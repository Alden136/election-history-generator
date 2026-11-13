import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built site works from any folder or host.
  base: './',
  server: { port: 5173, strictPort: true },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
