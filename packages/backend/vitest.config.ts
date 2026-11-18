import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * convex-auth hashes passwords with a wasm module imported as
 * `import mod from "x.wasm"` (a WebAssembly.Module, as the Convex bundler
 * provides). Reproduce that for tests.
 */
const wasmModule = (): Plugin => ({
  name: "wasm-as-module",
  enforce: "pre",
  load(id) {
    const path = id.split("?")[0]!;
    if (!path.endsWith(".wasm")) return null;
    const b64 = readFileSync(path).toString("base64");
    return `const bytes = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
export default new WebAssembly.Module(bytes);`;
  },
});

export default defineConfig({
  plugins: [wasmModule()],
  test: {
    environment: "edge-runtime",
    env: { CONVEX_CLOUD_URL: "https://test.convex.cloud" },
    server: {
      deps: {
        inline: ["convex-test", "@convex-dev/auth", "@convex-dev/rate-limiter", "password-hash-wasm"],
      },
    },
  },
});
