/**
 * pdf.js needs data files for some PDFs: standard fonts (for fonts a PDF does
 * not embed, common in files saved from Word), character maps, WebAssembly
 * image decoders and colour profiles. This plugin serves them at /pdfjs/ in
 * development and copies them into the build, so they work offline too.
 */
import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
const DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];
const TYPES: Record<string, string> = { ".wasm": "application/wasm", ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream", ".ttf": "font/ttf", ".icc": "application/octet-stream" };

export function pdfjsAssets(): Plugin {
  const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
  let outDir = "dist";
  return {
    name: "afisa-pdfjs-assets",
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0]!).replace(/^\/+/, "");
        const file = path.join(root, rel);
        if (!DIRS.includes(rel.split("/")[0]!) || !file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    writeBundle() {
      for (const d of DIRS) {
        const from = path.join(root, d);
        if (existsSync(from)) cpSync(from, path.join(outDir, "pdfjs", d), { recursive: true });
      }
    },
  };
}
