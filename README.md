# Stem Splitter

Split any song into **drums, bass, vocals and other** — entirely in your browser.
No servers, no uploads, no accounts: the neural network runs on your device via
WebGPU (or multi-threaded WASM as a fallback), so your audio never leaves your machine.

**Model:** HT-Demucs v4 by Alexandre Défossez et al. at Meta AI, exported to
ONNX by [demucs-onnx](https://github.com/StemSplit/demucs-onnx) and executed
with [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/).
The officially maintained Demucs repository is
[adefossez/demucs](https://github.com/adefossez/demucs) (the original
[facebookresearch/demucs](https://github.com/facebookresearch/demucs) was
archived in January 2025 after the author left Meta; the model weights are
identical in both).

## How it works

1. Your audio file is decoded to stereo 44.1 kHz PCM with the Web Audio API.
2. A Web Worker downloads the selected ONNX model files (once — cached via
   the Cache API afterwards) and creates an ONNX Runtime session, preferring
   WebGPU over multi-threaded WASM.
3. The track is processed in overlapping 7.8-second windows (the segment
   length is baked into the exported graphs) and blended back together with a
   triangular cross-fade (overlap-add).
4. Each stem is encoded to 16-bit WAV for preview and download.

### Model variants

| Variant | Stems | Files | Notes |
| --- | --- | --- | --- |
| Standard (`htdemucs`) | 4 | 1 × 158 MB | Default; fastest |
| Highest quality (`htdemucs_ft`) | 4 | 4 × 158 MB | Fine-tuned specialist per stem; ~4× slower. Processed one specialist at a time — stems appear as they finish |
| 6 stems (`htdemucs_6s`) | 6 | 1 × 130 MB | Adds guitar + piano; experimental |

## Development

```bash
npm install
npm run dev      # dev server with COOP/COEP headers
npm run build    # type-check + production build into dist/
```

## Model files

Model binaries are far too large for the main git tree (GitHub rejects files
over 100 MB), so they live in two places, both within this repository:

1. **The [`models-v1` GitHub Release](https://github.com/SRP1357/stem-splitter-app/releases/tag/models-v1)** —
   the archival home of every intact file (ONNX exports + original PyTorch
   checkpoints). Browsers cannot fetch release assets directly (GitHub serves
   them without CORS headers), so the website does not use these at runtime.
2. **The [`model-chunks` branch](https://github.com/SRP1357/stem-splitter-app/tree/model-chunks)** —
   the runtime ONNX files split into <100 MB chunks plus a `manifest.json`.
   The website fetches these via `raw.githubusercontent.com`, which does
   serve CORS headers, and reassembles them client-side
   (`scripts/publish-model-chunks.mjs` regenerates the chunks;
   `src/lib/model/fetchModel.ts` reassembles and caches them).

Release contents:

| File | Purpose |
| --- | --- |
| `htdemucs_fp16weights.onnx` | Fetched by the website at runtime |
| `htdemucs_ft_{drums,bass,other,vocals}_fp16weights.onnx` | Fine-tuned specialist ONNX exports — reserved for a future high-quality mode |
| `htdemucs_6s_fp16weights.onnx` | 6-stem ONNX export (guitar + piano) — reserved for a future option |
| `htdemucs_original_955717e8-8726e21a.th` | `htdemucs` — the checkpoint the website's ONNX export derives from |
| `htdemucs_ft_original_f7e0c4bc-ba3fe64a.th` | `htdemucs_ft` drums specialist |
| `htdemucs_ft_original_d12395a8-e57c48e6.th` | `htdemucs_ft` bass specialist |
| `htdemucs_ft_original_92cfc3b6-ef3bcb9c.th` | `htdemucs_ft` other specialist |
| `htdemucs_ft_original_04573f0d-f3cf25b2.th` | `htdemucs_ft` vocals specialist |
| `htdemucs_6s_original_5c90dfd2-34c22ccb.th` | `htdemucs_6s` — experimental 6-stem model (guitar + piano) |

The `.th` checkpoints are the complete official HT-Demucs v4 family — the
latest (and final) weights, referenced identically by both the archived Meta
repo and the maintained [adefossez/demucs](https://github.com/adefossez/demucs).
They are archived for record keeping and future use (e.g. re-running the ONNX
export); the website only ever fetches the `.onnx` file.

To re-download both from their upstream sources (Hugging Face / Meta) into the
local gitignored `models/` folder:

```bash
npm run download:models
```

To (re)publish the release:

```bash
gh release create models-v1 --title "Model files" --notes "HT-Demucs model binaries" models/*
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the
site and deploys it to GitHub Pages. GitHub Pages cannot set the COOP/COEP
headers needed for multi-threaded WASM, so the site uses
[coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) to enable
cross-origin isolation client-side.

## Licenses

- Code in this repository: MIT
- Demucs models (weights and original code): MIT, © Meta AI Research
