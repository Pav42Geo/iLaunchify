import { defineConfig } from 'vitest/config'

// Unit tests for the creator app's PURE logic modules (no React, no DB, no
// Fabric). Scoped to *.test.ts under src; node environment so we never pull in
// jsdom or the Next runtime. Cross-package imports in the modules under test are
// type-only and erase at transform time.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
