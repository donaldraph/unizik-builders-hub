import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist' },
  // amazon-cognito-identity-js (custom auth screens) references Node's `global`,
  // which doesn't exist in the browser. Map it to globalThis so the SDK loads.
  define: { global: 'globalThis' },
});
