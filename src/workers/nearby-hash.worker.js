import { sha256Base64Url } from "../protocol/hash.js";

export function createNearbyHashWorkerMessageHandler(dependencies = {}) {
  const deps = {
    sha256Base64Url,
    postMessage: (message) => globalThis.postMessage(message),
    ...dependencies,
  };

  return async function handleMessage(event) {
    const message = event?.data ?? event;
    if (message?.type !== "hash" || !Number.isSafeInteger(message.id) || !(message.file instanceof Blob)) return;
    const { id, file } = message;
    try {
      deps.postMessage({ type: "progress", id, progress: { stage: "reading", percent: 0 } });
      const bytes = new Uint8Array(await file.arrayBuffer());
      deps.postMessage({ type: "progress", id, progress: { stage: "hashing", percent: 50 } });
      const sha256 = await deps.sha256Base64Url(bytes);
      deps.postMessage({ type: "complete", id, sha256 });
    } catch (error) {
      deps.postMessage({
        type: "error",
        id,
        error: { code: "HASH_FAILED", message: error?.message || "Dosya özeti hesaplanamadı." },
      });
    }
  };
}

if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = createNearbyHashWorkerMessageHandler();
}
