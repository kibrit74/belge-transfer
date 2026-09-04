function createClientError(code, message) {
  const error = new Error(message);
  error.name = "VaultDropPackageClientError";
  error.code = code;
  return error;
}

function defaultWorkerFactory() {
  if (typeof Worker !== "function") {
    throw createClientError(
      "WORKER_UNSUPPORTED",
      "Bu tarayıcı arka plan paket hazırlığını desteklemiyor.",
    );
  }

  return new Worker(
    new URL("./vaultdrop-package.worker.js", import.meta.url),
    { type: "module" },
  );
}

function workerError(error) {
  const code = typeof error?.code === "string" ? error.code : "PACKAGE_FAILED";
  const message = typeof error?.message === "string" && error.message
    ? error.message
    : "Paket hazırlanamadı.";
  return createClientError(code, message);
}

export function createVaultDropPackageClient({ workerFactory = defaultWorkerFactory } = {}) {
  let closed = false;
  let nextId = 0;
  const activeJobs = new Map();

  function settle(job, outcome, value) {
    if (job.settled) return;
    job.settled = true;
    activeJobs.delete(job.id);
    job.signal?.removeEventListener?.("abort", job.onAbort);
    job.worker.onmessage = null;
    job.worker.onerror = null;
    job.worker.terminate();

    if (outcome === "resolve") {
      job.resolve(value);
      return;
    }
    job.reject(value);
  }

  function abortJob(job, code, message) {
    settle(job, "reject", createClientError(code, message));
  }

  function handleWorkerMessage(job, event) {
    if (job.settled) return;

    const message = event?.data;
    if (!message || message.id !== job.id) return;

    if (message.type === "progress") {
      job.onProgress?.(message.progress);
      return;
    }
    if (message.type === "complete") {
      settle(job, "resolve", message.result);
      return;
    }
    if (message.type === "error") {
      settle(job, "reject", workerError(message.error));
    }
  }

  function create(files, { signal, onProgress } = {}) {
    if (closed) {
      return Promise.reject(createClientError("CLOSED", "Paket istemcisi kapatıldı."));
    }
    if (signal?.aborted) {
      return Promise.reject(createClientError("ABORTED", "Paket hazırlama işlemi iptal edildi."));
    }

    let worker;
    try {
      worker = workerFactory();
    } catch (error) {
      return Promise.reject(error);
    }

    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const job = {
        id,
        worker,
        signal,
        onProgress,
        resolve,
        reject,
        settled: false,
        onAbort: null,
      };
      job.onAbort = () => abortJob(job, "ABORTED", "Paket hazırlama işlemi iptal edildi.");

      activeJobs.set(id, job);
      worker.onmessage = (event) => handleWorkerMessage(job, event);
      worker.onerror = (event) => settle(job, "reject", workerError(event?.error ?? event));
      signal?.addEventListener?.("abort", job.onAbort, { once: true });

      try {
        worker.postMessage({ type: "create", id, files });
      } catch (error) {
        settle(job, "reject", workerError(error));
      }
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    for (const job of [...activeJobs.values()]) {
      abortJob(job, "CLOSED", "Paket istemcisi kapatıldı.");
    }
  }

  return { create, close };
}

export { createClientError, defaultWorkerFactory };
