# Stem Splitter

Split any song into **drums, bass, vocals and more** — entirely in your
browser. No servers, no uploads, no accounts: the neural network runs on your
device, so your audio never leaves your machine.

**Live site:** https://srp1357.github.io/stem-splitter-app/

**Model:** HT-Demucs v4, exported to ONNX by
[demucs-onnx](https://github.com/StemSplit/demucs-onnx) and executed with
[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/). The exports
store weights in fp16 (half the download size); all computation runs in fp32.

## How it works

1. **Decode** — the audio file is decoded to stereo 44.1 kHz PCM with the Web
   Audio API (`OfflineAudioContext` handles resampling and mono→stereo).
2. **Fetch model** — a Web Worker downloads the selected ONNX file(s) as
   <100 MB chunks from this repo's `model-chunks` branch and reassembles
   them. Downloads are cached with the Cache API, so they only happen once
   per browser.
3. **Create session** — ONNX Runtime prefers WebGPU and falls back to
   multi-threaded WASM (threads require cross-origin isolation, provided by
   `coi-serviceworker`). If the GPU device is lost mid-run (e.g. Windows'
   watchdog resets a long dispatch), the worker is replaced and the whole run
   restarts on the CPU backend; a localStorage flag skips WebGPU on future
   runs.
4. **Separate** — the exported graphs take fixed 7.8-second segments, so the
   track is processed in overlapping windows blended back together with a
   triangular cross-fade (overlap-add). Progress streams to the UI per chunk.
5. **Deliver** — each stem is encoded to 16-bit WAV immediately and to
   320 kbps MP3 eagerly in a second worker, so both download buttons respond
   instantly. Stems from multi-file variants appear as soon as their
   specialist model finishes.

## Code map

| Path | Role |
| --- | --- |
| `src/App.tsx` | Page composition: picker → flow diagram → activity log → track deck |
| `src/hooks/useStemSeparation.ts` | The pipeline as React state: phases, progress, stems, activity log; owns the separation worker and the GPU-loss restart |
| `src/workers/separation.worker.ts` | Model download, ORT session creation (WebGPU→WASM), overlap-add inference loop |
| `src/workers/mp3.worker.ts` | MP3 encoding with lamejs, off the main thread |
| `src/components/SplitFlow.tsx` | The diagram: drop zone, stem cards, and SVG connectors that fill with color as separation progresses |
| `src/components/StemTracks.tsx` | Waveform lanes with synced multi-track playback (a shared transport keeps stems time-locked) and WAV/MP3 downloads |
| `src/components/ActivityLog.tsx` | Terminal-style ticker fed by the hook's log entries |
| `src/components/FileDropZone.tsx`, `ModelPicker.tsx`, `StemCard.tsx` | The remaining UI nodes |
| `src/lib/model/fetchModel.ts` | Chunk manifest, streaming download, reassembly, Cache API caching |
| `src/lib/audio/` | `decode.ts` (Web Audio decode), `wavEncoder.ts` (RIFF/WAVE writer), `mp3.ts` (encoder-worker client) |
| `src/lib/separation/overlapAdd.ts` | Window/weight math for the overlap-add blend |
| `src/config/constants.ts` | Every pipeline constant: URLs, segment sizes, model variants, bitrates |
| `src/config/theme.ts` | Stem colors and waveform rendering parameters |
| `src/types/messages.ts` | Typed protocol between the main thread and both workers |

Two implementation notes worth knowing:

- **Graph optimization is disabled** when creating ORT sessions. The exports
  store fp16 weights followed by cast-to-fp32 nodes; ORT's optimizer
  constant-folds those casts, materializing a second full-precision copy of
  the weights and exhausting the WASM heap (`std::bad_alloc`).
- **Chunked model hosting** exists because GitHub Release downloads lack CORS
  headers (browsers can't fetch them), while `raw.githubusercontent.com`
  serves them but caps files at 100 MB.

## Model variants

| Variant | Stems | Download | Notes |
| --- | --- | --- | --- |
| Standard (`htdemucs`) | 4 | 1 × 158 MB | Default; fastest |
| Highest quality (`htdemucs_ft`) | 4 | 4 × 158 MB | One fine-tuned specialist per stem; ~4× slower, stems appear as each finishes |
| 6 stems (`htdemucs_6s`) | 6 | 1 × 130 MB | Adds guitar + piano; experimental |

## Model files

Model binaries are too large for the main git tree, so they live in two
places, both within this repository:

1. **[`models-v1` GitHub Release](https://github.com/SRP1357/stem-splitter-app/releases/tag/models-v1)** —
   archival home of every intact file: the six ONNX exports plus the six
   original fp32 PyTorch checkpoints (`.th`) they derive from, kept for
   record keeping and future re-exports.
2. **[`model-chunks` branch](https://github.com/SRP1357/stem-splitter-app/tree/model-chunks)** —
   the runtime ONNX files split into <100 MB chunks plus `manifest.json`;
   this is what the website actually fetches.

Maintenance workflow (all local, `models/` is gitignored):

```bash
npm run download:models   # re-download everything from upstream sources
npm run chunk:models      # split ONNX files into build/model-chunks/
node scripts/verify-model-chunks.mjs   # SHA-256: published chunks == local originals
node scripts/validate-model.mjs        # sanity-check a model's tensor names/shapes
```

To (re)publish the release and the `model-chunks` branch (an orphan branch,
managed through a worktree):

```bash
gh release create models-v1 --title "Model files" --notes "HT-Demucs model binaries" models/*

git worktree add ../model-chunks-worktree --detach
cd ../model-chunks-worktree
git checkout --orphan model-chunks            # or plain checkout if it exists
git rm -rfq . 2>/dev/null || true
cp ../stem-splitter-app/build/model-chunks/* .
git add -A && git commit -m "Update model chunks"
git push -f -u origin model-chunks
cd ../stem-splitter-app && git worktree remove ../model-chunks-worktree
```

## Development

```bash
npm install
npm run dev      # dev server with COOP/COEP headers
npm run lint     # eslint (typed rules + react-hooks)
npm run build    # type-check + production build into dist/
```

`npm run dev`/`build` first copy the ONNX Runtime `.wasm` files and
`coi-serviceworker` from `node_modules` into `public/` so everything is
served first-party.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml` (lint → build →
GitHub Pages). Pages cannot set the COOP/COEP headers needed for
multi-threaded WASM, so the site enables cross-origin isolation client-side
with [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker).

## Licenses

- Code in this repository: MIT
- HT-Demucs models (weights and original code): MIT, © Meta AI Research
