/**
 * Loads a local ONNX model with onnxruntime-node, prints its input/output
 * signatures, and runs one random segment through it to verify the tensor
 * names and shapes the website assumes. Dev-only sanity check:
 *   node scripts/validate-model.mjs [models/htdemucs_fp16weights.onnx]
 */
import ort from "onnxruntime-node";

const CHANNEL_COUNT = 2;
const SEGMENT_SAMPLES = 343980;

const modelPath = process.argv[2] ?? "models/htdemucs_fp16weights.onnx";

const session = await ort.InferenceSession.create(modelPath);
console.log("input names: ", session.inputNames);
console.log("output names:", session.outputNames);

const data = new Float32Array(CHANNEL_COUNT * SEGMENT_SAMPLES);
for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 0.1;

const feeds = {
  [session.inputNames[0]]: new ort.Tensor("float32", data, [
    1,
    CHANNEL_COUNT,
    SEGMENT_SAMPLES,
  ]),
};

const start = Date.now();
const results = await session.run(feeds);
const output = results[session.outputNames[0]];
console.log("output dims: ", output.dims);
console.log("elapsed:     ", ((Date.now() - start) / 1000).toFixed(1), "s");
console.log(
  "output finite:",
  Number.isFinite(output.data[0]),
  "sample:",
  output.data.slice(0, 3),
);
