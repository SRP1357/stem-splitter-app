/**
 * Downloads the model files into models/ (gitignored) from their original
 * upstream sources. Used to (re)build the GitHub Release that the website
 * fetches the ONNX model from, and to archive the original PyTorch
 * checkpoint for record keeping. See README.md ("Model files").
 */
import { createWriteStream } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODELS_DIR = path.join(projectRoot, "models");

const MODEL_SOURCES = [
  {
    fileName: "htdemucs_fp16weights.onnx",
    url: "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx",
    description:
      "HT-Demucs 4-stem ONNX export (fp16 weights) — served to the website via GitHub Release",
  },
  {
    fileName: "htdemucs_original_955717e8-8726e21a.th",
    url: "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th",
    description:
      "Original HT-Demucs PyTorch checkpoint from Meta — archival only, not used by the website",
  },
];

await mkdir(MODELS_DIR, { recursive: true });

for (const source of MODEL_SOURCES) {
  const targetPath = path.join(MODELS_DIR, source.fileName);
  if (await fileExists(targetPath)) {
    console.log(`✓ ${source.fileName} already present, skipping`);
    continue;
  }

  console.log(`Downloading ${source.fileName}\n  from ${source.url}`);
  const response = await fetch(source.url);
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} for ${source.url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));

  const { size } = await stat(targetPath);
  console.log(`✓ ${source.fileName} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
