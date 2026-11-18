import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pdfjsAssets } from "./vite-pdfjs-assets.ts";

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "convex", test: /node_modules[\\/](convex|@convex-dev)[\\/]/ },
          ],
        },
      },
    },
  },
  server: { port: 5174 },
});
