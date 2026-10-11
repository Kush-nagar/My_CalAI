/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './' keeps the build portable to any static host path (e.g. GitHub Pages /repo/).
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'safari15', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
});
