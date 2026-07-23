import {
  MODEL_CACHE_NAME,
  MODEL_CHUNKS_BASE_URL,
  MODEL_MANIFEST_URL,
} from "../../config/constants";

export type DownloadProgressCallback = (
  loadedBytes: number,
  totalBytes: number,
) => void;

/**
 * Models are stored as <100 MB chunks on the repository's `model-chunks`
 * branch, because raw.githubusercontent.com serves CORS headers (GitHub
 * Release downloads do not, so browsers cannot fetch them). A manifest on the
 * same branch describes how many parts each file has.
 */
interface ChunkManifest {
  chunkBytes: number;
  files: Record<string, { totalBytes: number; parts: number }>;
}

let manifestPromise: Promise<ChunkManifest> | null = null;

function getManifest(): Promise<ChunkManifest> {
  manifestPromise ??= (async () => {
    const response = await fetch(MODEL_MANIFEST_URL);
    if (!response.ok) {
      throw new Error(
        `Model manifest download failed: HTTP ${response.status}`,
      );
    }
    return (await response.json()) as ChunkManifest;
  })().catch((error: unknown) => {
    // Don't cache failures: a transient network error should not disable
    // model downloads until the page is reloaded.
    manifestPromise = null;
    throw error;
  });
  return manifestPromise;
}

/**
 * Fetches one model file (reassembled from its chunks), caching the result
 * via the Cache API so the large download only ever happens once per
 * browser. Reports incremental progress across all chunks.
 */
export async function fetchModelWithCache(
  fileName: string,
  onProgress: DownloadProgressCallback,
): Promise<Uint8Array> {
  // Logical key for the assembled file; the individual part URLs are an
  // implementation detail of the transport.
  const cacheKey = `${MODEL_CHUNKS_BASE_URL}/${fileName}`;
  const cache = await tryOpenCache();

  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const bytes = new Uint8Array(await cached.arrayBuffer());
      onProgress(bytes.byteLength, bytes.byteLength);
      return bytes;
    }
  }

  const manifest = await getManifest();
  const entry = manifest.files[fileName];
  if (!entry) {
    throw new Error(`Model file "${fileName}" not present in manifest`);
  }

  const bytes = new Uint8Array(entry.totalBytes);
  let loadedBytes = 0;

  for (let part = 0; part < entry.parts; part++) {
    const partUrl = `${cacheKey}.part${part}`;
    const response = await fetch(partUrl);
    if (!response.ok || !response.body) {
      throw new Error(
        `Model download failed: HTTP ${response.status} for ${partUrl}`,
      );
    }
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.set(value, loadedBytes);
      loadedBytes += value.byteLength;
      onProgress(loadedBytes, entry.totalBytes);
    }
  }

  if (loadedBytes !== entry.totalBytes) {
    throw new Error(
      `Model download incomplete: got ${loadedBytes} of ${entry.totalBytes} bytes`,
    );
  }

  if (cache) {
    // Quota errors are non-fatal: the model still works, it just won't
    // survive a page reload.
    try {
      await cache.put(cacheKey, new Response(bytes.slice().buffer));
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
