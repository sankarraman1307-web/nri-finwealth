import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error plain JavaScript helper without types
import guidePages from './scripts/vite-guides.mjs';

export default defineConfig({
  plugins: [react(), guidePages()],
  test: { include: ['tests/**/*.test.ts'] },
});
