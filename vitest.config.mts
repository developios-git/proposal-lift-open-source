import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Only `.test.ts` is collected under `src/`. A `.test.tsx` file is silently
    // skipped — keep ported tests as `.ts` or they never run.
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
