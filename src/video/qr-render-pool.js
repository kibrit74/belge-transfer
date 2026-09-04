export class QrRenderPoolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QrRenderPoolError";
    this.code = code;
  }
}

export function createQrRenderPool({ workerFactory = createDefaultWorker, size } = {}) {
  if (typeof workerFactory !== "function") {
    throw new TypeError("QR worker fabrikası gerekli.");
  }

  const requestedSize = Number.isSafeInteger(size)
    ? size
    : (globalThis.navigator?.hardwareConcurrency ?? 2) - 1;
  const safeSize = Math.max(2, Math.min(4, requestedSize));
  const workerStates = [];
  try {
    for (let index = 0; index < safeSize; index += 1) {
      workerStates.push({ worker: workerFactory(), activeJob: null });
    }
  } catch (error) {
    workerStates.forEach((state) => state.worker.terminate());
    throw error;
  }
  const queue = [];
  let nextId = 0;
  let closed = false;

  workerStates.forEach((state) => {
    state.worker.onmessage = (event) => {
      const job = state.activeJob;
      if (!job || event.data?.id !== job.id) return;
      state.activeJob = null;

      if (event.data.error) {
        job.reject(new QrRenderPoolError(
          event.data.error.code ?? "QR_RENDER_ERROR",
          event.data.error.message ?? "QR karesi hazırlanamadı.",
        ));
      } else {
        job.resolve({
          frameIndex: event.data.frameIndex,
          regionIndex: event.data.regionIndex,
          width: event.data.width,
          height: event.data.height,
          pixels: event.data.pixels,
          moduleCount: event.data.moduleCount,
          margin: event.data.margin,
        });
      }
      dispatch();
    };

    state.worker.onerror = (event) => {
      failPool(new QrRenderPoolError(
        "WORKER_ERROR",
        event?.error?.message ?? "QR hazırlama işçisi başarısız oldu.",
      ));
    };
  });

  function dispatch() {
    if (closed) return;
    for (const state of workerStates) {
      if (state.activeJob) continue;
      const job = queue.shift();
      if (!job) continue;
      state.activeJob = job;
      job.state = state;
      state.worker.postMessage({
        id: job.id,
        frameIndex: job.frameIndex,
        regionIndex: job.regionIndex,
        text: job.text,
      });
    }
  }

  function render(text, { frameIndex, regionIndex, signal } = {}) {
    if (closed) {
      return Promise.reject(new QrRenderPoolError("CLOSED", "QR hazırlama havuzu kapalı."));
    }
    if (signal?.aborted) {
      return Promise.reject(new QrRenderPoolError("ABORTED", "QR hazırlama iptal edildi."));
    }

    const id = ++nextId;
    const promise = new Promise((resolve, reject) => {
      const job = {
        id,
        text,
        frameIndex,
        regionIndex,
        signal,
        state: null,
        settled: false,
        resolve(value) { settle(resolve, value); },
        reject(error) { settle(reject, error); },
      };

      const onAbort = () => {
        const queuedIndex = queue.indexOf(job);
        if (queuedIndex >= 0) queue.splice(queuedIndex, 1);
        job.reject(new QrRenderPoolError("ABORTED", "QR hazırlama iptal edildi."));
      };

      function settle(callback, value) {
        if (job.settled) return;
        job.settled = true;
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      }

      signal?.addEventListener("abort", onAbort, { once: true });
      queue.push(job);
    });

    dispatch();
    return promise;
  }

  function failPool(error) {
    if (closed) return;
    closed = true;
    for (const job of queue.splice(0)) job.reject(error);
    for (const state of workerStates) {
      state.activeJob?.reject(error);
      state.activeJob = null;
      state.worker.terminate();
    }
  }

  function close() {
    failPool(new QrRenderPoolError("CLOSED", "QR hazırlama havuzu kapatıldı."));
  }

  return { render, close };
}

function createDefaultWorker() {
  if (typeof Worker !== "function") {
    throw new QrRenderPoolError("WORKER_UNSUPPORTED", "QR hazırlama işçisi desteklenmiyor.");
  }
  return new Worker(
    new URL("../workers/standard-qr-render.worker.js", import.meta.url),
    { type: "module" },
  );
}
