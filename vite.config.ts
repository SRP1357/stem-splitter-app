import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * GitHub Pages serves project sites from https://<user>.github.io/<repo>/,
 * so all asset URLs must be prefixed with the repository name.
 */
const GITHUB_PAGES_BASE_PATH = "/stem-splitter-app/";

export default defineConfig({
  base: GITHUB_PAGES_BASE_PATH,
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // onnxruntime-web locates its .wasm binaries at runtime relative to its
    // own module URL; Vite's dependency pre-bundling breaks that lookup.
    exclude: ["onnxruntime-web"],
  },
  // Note: the production bundle also emits a copy of the ONNX Runtime .wasm
  // under dist/assets/ (Rollup resolves ORT's internal `new URL(...)`
  // reference). It is never fetched at runtime — ort.env.wasm.wasmPaths
  // points at the first-party copies in public/ort/ — it just inflates the
  // deploy artifact slightly.
  server: {
    // Cross-origin isolation enables SharedArrayBuffer, which onnxruntime-web
    // needs for multi-threaded WASM inference. In production (GitHub Pages
    // cannot set headers) the same effect is achieved by coi-serviceworker.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
