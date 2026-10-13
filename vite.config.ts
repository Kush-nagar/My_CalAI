/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Emits dist/sw.js from src/platform/sw-template.js with the list of every built file and a
 * content hash as the cache version. Runs after all other plugins have written their output,
 * so lazily imported chunks (seed JSON) and the barcode WASM are included.
 */
function swPrecache(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'thali-sw-precache',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
      root = c.root;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir).sort()) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      // onnxruntime-web's bundle also references its WASM via import.meta.url, so Vite emits a hashed
      // copy under assets/. The app always passes the WASM bytes from the opt-in model cache
      // (env.wasm.wasmBinary), so that copy is never fetched: delete it rather than precache 27 MB.
      for (const f of readdirSync(join(outDir, 'assets'))) if (/^ort-wasm-.*\.wasm$/.test(f)) unlinkSync(join(outDir, 'assets', f));
      walk(outDir);
      // Opt-in model files (models/, ort/) are downloaded only when the user enables photo
      // suggestions, so they must never be precached for everyone.
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !/^(models|ort)\//.test(f));
      const hash = createHash('sha256');
      for (const f of list) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const tpl = readFileSync(join(root, 'src/platform/sw-template.js'), 'utf8');
      const out = tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(list, null, 1));
      writeFileSync(join(outDir, 'sw.js'), out);
    },
  };
}

/**
 * Ships onnxruntime-web's single-threaded-capable WASM (used for both WebGPU and CPU) as a plain
 * file under ort/ with a content-hashed name, and exposes its size and SHA-256 to the app so the
 * opt-in downloader can verify it. Never loaded from a CDN.
 */
function ortWasm(): Plugin {
  const src = resolve('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm');
  const buf = readFileSync(src);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const path = `ort/ort-wasm-simd-threaded.asyncify-${sha256.slice(0, 10)}.wasm`;
  return {
    name: 'thali-ort-wasm',
    config: () => ({ define: { __ORT_WASM__: JSON.stringify({ path, bytes: buf.length, sha256 }) } }),
    configureServer(server) {
      server.middlewares.use('/' + path, (_req, res) => {
        res.setHeader('content-type', 'application/wasm');
        res.end(buf);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: path, source: buf });
    },
  };
}

// base './' keeps the build portable to any static host path (e.g. GitHub Pages /repo/).
export default defineConfig({
  base: './',
  plugins: [preact(), ortWasm(), swPrecache()],
  worker: { format: 'es' },
  // Pre-bundle so the dev server does not reload mid-test when the worker first imports ORT.
  optimizeDeps: { include: ['onnxruntime-web/webgpu'] },
  build: { target: 'safari15', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
});
