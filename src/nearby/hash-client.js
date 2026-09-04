export function createNearbyHashClient({ workerFactory = defaultWorkerFactory } = {}) {
  let nextId = 0;
  let closed = false;
  const active = new Set();

  function hash(file, { signal, onProgress } = {}) {
    if (closed) return Promise.reject(clientError("CLOSED", "Özet istemcisi kapatıldı."));
    if (signal?.aborted) return Promise.reject(clientError("ABORTED", "Özet işlemi iptal edildi."));
    let worker;
    try {
      worker = workerFactory();
    } catch (error) {
      return Promise.reject(error);
    }
    const id = ++nextId;

    return new Promise((resolve, reject) => {
      const job = { worker, settled: false, cancel: null };
      active.add(job);
      const cleanup = () => {
        if (job.settled) return false;
        job.settled = true;
        active.delete(job);
        signal?.removeEventListener("abort", onAbort);
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        return true;
      };
      const onAbort = () => {
        if (cleanup()) reject(clientError("ABORTED", "Özet işlemi iptal edildi."));
      };
      job.cancel = (code = "CLOSED", message = "Özet istemcisi kapatıldı.") => {
        if (cleanup()) reject(clientError(code, message));
      };
      worker.onmessage = (event) => {
        const message = event?.data;
        if (message?.id !== id || job.settled) return;
        if (message.type === "progress") onProgress?.(message.progress);
        if (message.type === "complete" && cleanup()) resolve(message.sha256);
        if (message.type === "error" && cleanup()) {
          reject(clientError(message.error?.code || "HASH_FAILED", message.error?.message || "Özet hesaplanamadı."));
        }
      };
      worker.onerror = (event) => {
        if (cleanup()) reject(clientError("HASH_FAILED", event?.message || "Özet hesaplanamadı."));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      worker.postMessage({ type: "hash", id, file });
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    for (const job of [...active]) job.cancel();
  }

  return { hash, close };
}

function defaultWorkerFactory() {
  if (typeof Worker !== "function") throw clientError("WORKER_UNSUPPORTED", "Tarayıcı özet işçisini desteklemiyor.");
  return new Worker(new URL("../workers/nearby-hash.worker.js", import.meta.url), { type: "module" });
}

function clientError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
