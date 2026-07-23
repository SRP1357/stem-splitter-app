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

const DEMUCS_CHECKPOINT_BASE_URL =
  "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer";

/**
 * The complete official HT-Demucs v4 model family. Checkpoint signatures come
 * from demucs/remote/*.yaml in the officially maintained repository
 * (https://github.com/adefossez/demucs). The .th checkpoints are archival
 * only; the website uses the ONNX export.
 */
const MODEL_SOURCES = [
  {
    fileName: "htdemucs_fp16weights.onnx",
    url: "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx",
    description:
      "HT-Demucs 4-stem ONNX export (fp16 weights) — served to the website via GitHub Release",
  },
  {
    fileName: "htdemucs_original_955717e8-8726e21a.th",
    url: `${DEMUCS_CHECKPOINT_BASE_URL}/955717e8-8726e21a.th`,
    description: "htdemucs — the 4-stem model the website's ONNX derives from",
  },
  {
    fileName: "htdemucs_ft_original_f7e0c4bc-ba3fe64a.th",
    url: `${DEMUCS_CHECKPOINT_BASE_URL}/f7e0c4bc-ba3fe64a.th`,
    description: "htdemucs_ft drums specialist",
  },
  {
    fileName: "htdemucs_ft_original_d12395a8-e57c48e6.th",
    url: `${DEMUCS_CHECKPOINT_BASE_URL}/d12395a8-e57c48e6.th`,
    description: "htdemucs_ft bass specialist",
  },
  {
    fileName: "htdemucs_ft_original_92cfc3b6-ef3bcb9c.th",
    url: `${DEMUCS_CHECKPOINT_BASE_URL}/92cfc3b6-ef3bcb9c.th`,
    description: "htdemucs_ft other specialist",
  },
  {
    fileName: "htdemucs_ft_original_04573f0d-f3cf25b2.th",
    url: `${DEMUCS_CHECKPOINT_BASE_URL}/04573f0d-f3cf25b2.th`,
    description: "htdemucs_ft vocals specialist",
  },
  {
    fileName: "htdemucs_6s_original_5c90dfd2-34c22ccb.th",
    url: `${DEMUCS_CHECKPOINT_BASE_URL}/5c90dfd2-34c22ccb.th`,
    description: "htdemucs_6s — experimental 6-stem model (guitar + piano)",
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
