import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Day–night tests use local clock times; pin the zone so they're deterministic anywhere.
    env: { TZ: 'Asia/Kolkata' },
  },
});
