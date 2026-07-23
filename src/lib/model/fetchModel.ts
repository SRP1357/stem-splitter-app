import { MODEL_CACHE_NAME } from "../../config/constants";

export type DownloadProgressCallback = (
  loadedBytes: number,
  totalBytes: number,
) => void;

/**
 * Fetches the ONNX model, caching it via the Cache API so the (large)
 * download only ever happens once per browser. Reports incremental progress
 * while streaming the network response.
 */
export async function fetchModelWithCache(
  url: string,
  onProgress: DownloadProgressCallback,
): Promise<Uint8Array> {
  const cache = await tryOpenCache();

  if (cache) {
    const cached = await cache.match(url);
    if (cached) {
      const bytes = new Uint8Array(await cached.arrayBuffer());
      onProgress(bytes.byteLength, bytes.byteLength);
      return bytes;
    }
  }

  const bytes = await downloadWithProgress(url, onProgress);

  if (cache) {
    // Quota errors are non-fatal: the model still works, it just won't
    // survive a page reload.
    try {
      await cache.put(url, new Response(bytes.slice().buffer));
    } catch {
      /* ignore storage failures */
    }
  }

  return bytes;
}

async function tryOpenCache(): Promise<Cache | null> {
  try {
    return await caches.open(MODEL_CACHE_NAME);
  } catch {
    return null; // e.g. private browsing modes without Cache API access
  }
}

async function downloadWithProgress(
  url: string,
  onProgress: DownloadProgressCallback,
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(
      `Model download failed: HTTP ${response.status} for ${url}`,
    );
  }

  const totalBytes = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress(loadedBytes, totalBytes);
  }

  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
