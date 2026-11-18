import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? version),
  },
  plugins: [
    react(),
    VitePWA({
      // Never swap code under an officer mid-entry: the app asks first.
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icon-maskable.svg"],
      manifest: {
        name: "Afisa Ugani",
        short_name: "Afisa Ugani",
        description: "Kumbukumbu za kazi za ugani na ripoti za mwezi, robo na mwaka.",
        lang: "sw",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#eef1ec",
        theme_color: "#eef1ec",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Keep vendor code in its own long-lived cache entry.
        advancedChunks: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: "convex", test: /node_modules[\\/](convex|@convex-dev)[\\/]/ },
            { name: "data", test: /node_modules[\\/](dexie|dexie-react-hooks|uuid)[\\/]/ },
          ],
        },
      },
    },
  },
  server: { port: 5173 },
});
