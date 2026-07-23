/**
 * Copies runtime assets that must be served as plain static files (they are
 * loaded by URL at runtime, not bundled) from node_modules into public/.
 * Runs automatically before `npm run dev` and `npm run build`.
 *
 *  - onnxruntime-web's .wasm/.mjs runtime files -> public/ort/
 *  - coi-serviceworker (COOP/COEP shim for GitHub Pages) -> public/
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const ORT_DIST_DIR = path.join(projectRoot, "node_modules/onnxruntime-web/dist");
const ORT_TARGET_DIR = path.join(projectRoot, "public/ort");
const ORT_RUNTIME_FILE_PATTERN = /^ort-.*\.(wasm|mjs)$/;

const COI_SOURCE = path.join(
  projectRoot,
  "node_modules/coi-serviceworker/coi-serviceworker.min.js",
);
const COI_TARGET = path.join(projectRoot, "public/coi-serviceworker.min.js");

await mkdir(ORT_TARGET_DIR, { recursive: true });

const ortFiles = (await readdir(ORT_DIST_DIR)).filter((name) =>
  ORT_RUNTIME_FILE_PATTERN.test(name),
);
if (ortFiles.length === 0) {
  throw new Error(`No ONNX Runtime files found in ${ORT_DIST_DIR}`);
}
await Promise.all(
  ortFiles.map((name) =>
    copyFile(path.join(ORT_DIST_DIR, name), path.join(ORT_TARGET_DIR, name)),
  ),
);

await copyFile(COI_SOURCE, COI_TARGET);

console.log(
  `Copied ${ortFiles.length} ONNX Runtime files and coi-serviceworker into public/`,
);
