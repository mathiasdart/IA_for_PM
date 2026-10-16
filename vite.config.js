import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { include: ['onnxruntime-web/wasm'] },
  worker: { format: 'es' },
});
