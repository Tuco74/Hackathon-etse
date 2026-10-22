import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/game-core/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/types.ts"],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});