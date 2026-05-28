// Smoke test — confirms Vitest test runner is wired and the include glob
// `src/**/*.{test,spec}.{ts,tsx}` picks up TypeScript test files.
// Vitest globals are enabled in vite.config.ts so `it`/`expect` are available
// without an explicit import.

it('runs', () => {
  expect(1 + 1).toBe(2);
});
