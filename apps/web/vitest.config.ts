import { defineConfig } from 'vitest/config'

// Scoped to the pure spreadsheet logic for now — no DOM environment needed.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
