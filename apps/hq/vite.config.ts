import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
