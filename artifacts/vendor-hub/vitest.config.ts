import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [
      // Component tests run in jsdom
      ["src/**/__tests__/**/*.test.tsx", "jsdom"],
    ],
  },
});
