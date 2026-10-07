import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "file:./test.db",
    },
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
