import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  base: './',
  plugins: [
    topLevelAwait(),
    legacy({
      targets: ['Android >= 5', 'iOS >= 10', 'Chrome >= 49'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
    wasm(),
  ],
  build: {
    target: 'es5',
  },
});

