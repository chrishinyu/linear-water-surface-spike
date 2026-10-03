import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  build: { sourcemap: true, target: 'es2020' },
  test: { environment: 'node', exclude: ['tests/e2e/**', 'node_modules/**'] },
});
