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
2. A Web Worker downloads the ONNX model (~166 MB, once — cached afterwards)
   and creates an ONNX Runtime session, preferring WebGPU over WASM.
3. The track is processed in overlapping 7.8-second windows (the segment
   length is baked into the exported graph) and blended back together with a
   triangular cross-fade (overlap-add).
4. Each stem is encoded to 16-bit WAV for preview and download.

## Development

```bash
npm install
npm run dev      # dev server with COOP/COEP headers
npm run build    # type-check + production build into dist/
```

## Model files

Model binaries are far too large for git (GitHub rejects files over 100 MB),
so they are **not** in the git tree. They are attached to the
[`models-v1` GitHub Release](https://github.com/SRP1357/stem-splitter-app/releases/tag/models-v1)
of this repository:

| File | Purpose |
| --- | --- |
| `htdemucs_fp16weights.onnx` | Fetched by the website at runtime |
| `htdemucs_original_955717e8-8726e21a.th` | Original PyTorch checkpoint — the latest (and final) official `htdemucs` weights, referenced by both the archived Meta repo and the maintained [adefossez/demucs](https://github.com/adefossez/demucs). Archived for record keeping; not used by the website |

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
