import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@workpay/shared": fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
