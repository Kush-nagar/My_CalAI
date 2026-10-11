/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
      walk(outDir);
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const f of list) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const tpl = readFileSync(join(root, 'src/platform/sw-template.js'), 'utf8');
      const out = tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(list, null, 1));
      writeFileSync(join(outDir, 'sw.js'), out);
    },
  };
}

// base './' keeps the build portable to any static host path (e.g. GitHub Pages /repo/).
export default defineConfig({
  base: './',
  plugins: [preact(), swPrecache()],
  build: { target: 'safari15', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
});
