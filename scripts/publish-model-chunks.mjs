/**
 * Splits the runtime ONNX models into chunks small enough for
 * raw.githubusercontent.com (which caps files at 100 MB but, unlike GitHub
 * Release downloads, serves proper CORS headers) and writes a manifest the
 * website uses to reassemble them.
 *
 * Output goes to build/model-chunks/; publishing that folder to the
 * `model-chunks` branch is documented in README.md ("Model files").
 */
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODELS_DIR = path.join(projectRoot, "models");
const OUTPUT_DIR = path.join(projectRoot, "build", "model-chunks");

/** Keeps every chunk safely under raw.githubusercontent.com's 100 MB cap. */
const CHUNK_BYTES = 90 * 1024 * 1024;

/** Only the ONNX files are fetched by the website at runtime. */
const RUNTIME_FILE_PATTERN = /\.onnx$/;

await mkdir(OUTPUT_DIR, { recursive: true });

const runtimeFiles = (await readdir(MODELS_DIR)).filter((name) =>
  RUNTIME_FILE_PATTERN.test(name),
);
if (runtimeFiles.length === 0) {
  throw new Error(
    `No .onnx files in ${MODELS_DIR} — run 'npm run download:models' first`,
  );
}

const manifest = { chunkBytes: CHUNK_BYTES, files: {} };

for (const fileName of runtimeFiles) {
  const sourcePath = path.join(MODELS_DIR, fileName);
  const { size: totalBytes } = await stat(sourcePath);
  const parts = Math.ceil(totalBytes / CHUNK_BYTES);
  manifest.files[fileName] = { totalBytes, parts };

  for (let part = 0; part < parts; part++) {
    const partPath = path.join(OUTPUT_DIR, `${fileName}.part${part}`);
    await pipeline(
      createReadStream(sourcePath, {
        start: part * CHUNK_BYTES,
        end: Math.min((part + 1) * CHUNK_BYTES, totalBytes) - 1,
      }),
      createWriteStream(partPath),
    );
  }
  console.log(`✓ ${fileName}: ${parts} part(s), ${totalBytes} bytes`);
}

await writeFile(
  path.join(OUTPUT_DIR, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(`\nWrote ${OUTPUT_DIR}/manifest.json`);
