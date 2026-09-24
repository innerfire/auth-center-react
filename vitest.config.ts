import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: [path.resolve(__dirname, "src/__tests__/setup.ts")],
    css: false,
    pool: "forks",
    testTimeout: 15_000,
  },
});
