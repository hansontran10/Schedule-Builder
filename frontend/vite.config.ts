import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the planner page and the extension's background script into dist/.
// The content script is built separately (vite.content.config.ts) because Chrome
// needs it as a single classic script, not an ES module.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      input: { index: "index.html", background: "src/extension/background.ts" },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  test: { environment: "node" },
});
