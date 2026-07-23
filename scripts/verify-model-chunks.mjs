/**
 * Integrity check for the published model chunks: downloads every chunk
 * from raw.githubusercontent.com (exactly what the website does), hashes
 * the reassembled stream, and compares against the SHA-256 of the local
 * original in models/. Byte-identical hashes prove the hosting strategy
 * cannot affect model quality.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODELS_DIR = path.join(projectRoot, "models");
const BASE_URL =
  "https://raw.githubusercontent.com/SRP1357/stem-splitter-app/model-chunks";

async function hashLocalFile(filePath) {
  const hash = createHash("sha256");
  for await (const piece of createReadStream(filePath)) hash.update(piece);
  return hash.digest("hex");
}

const manifest = await (await fetch(`${BASE_URL}/manifest.json`)).json();
let allMatch = true;

for (const [fileName, { totalBytes, parts }] of Object.entries(
  manifest.files,
)) {
  const remoteHash = createHash("sha256");
  let remoteBytes = 0;
  for (let part = 0; part < parts; part++) {
    const response = await fetch(`${BASE_URL}/${fileName}.part${part}`);
    if (!response.ok) {
      throw new Error(`${fileName}.part${part}: HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    remoteHash.update(bytes);
    remoteBytes += bytes.length;
  }

  const localDigest = await hashLocalFile(path.join(MODELS_DIR, fileName));
  const remoteDigest = remoteHash.digest("hex");
  const sizeOk = remoteBytes === totalBytes;
  const match = localDigest === remoteDigest && sizeOk;
  allMatch &&= match;
  console.log(
    `${match ? "✓ MATCH" : "✗ MISMATCH"}  ${fileName}` +
      `  (${remoteBytes} bytes${sizeOk ? "" : `, expected ${totalBytes}`})`,
  );
  console.log(`   local:  ${localDigest}`);
  console.log(`   remote: ${remoteDigest}`);
}

console.log(
  allMatch
    ? "\nAll published models are byte-identical to the originals."
    : "\nINTEGRITY FAILURE — see mismatches above.",
);
process.exitCode = allMatch ? 0 : 1;
