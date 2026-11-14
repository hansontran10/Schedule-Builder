import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/extension/content/main.ts",
      formats: ["iife"],
      name: "ScheduleBuilderContent",
      fileName: () => "content.js",
    },
  },
});
