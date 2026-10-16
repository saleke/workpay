import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Domain/invariant tests must not touch the network. Fake adapters only.
    setupFiles: [],
  },
});
