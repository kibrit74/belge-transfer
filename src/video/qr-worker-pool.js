class QrWorkerPoolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QrWorkerPoolError";
    this.code = code;
  }
}

export function createQrWorkerPool({ workerFactory, size } = {}) {
  if (typeof workerFactory !== "function") throw new TypeError("İşçi fabrikası gerekli.");

  const safeSize = Math.max(1, Math.min(4, Number.isSafeInteger(size) ? size : defaultPoolSize()));
  const workerStates = Array.from({ length: safeSize }, () => ({
    worker: workerFactory(),
    activeJob: null,
  }));
  const queuedJobs = [];
  let sequence = 0;
  let closed = false;

  workerStates.forEach((state) => {
    state.worker.onmessage = (event) => {
      const job = state.activeJob;
      if (!job || event.data?.id !== job.id) return;

      state.activeJob = null;
      if (event.data.error) job.reject(new Error(event.data.error));
      else job.resolve(event.data.texts ?? []);
      dispatch();
    };
    state.worker.onerror = (event) => {
      const job = state.activeJob;
      state.activeJob = null;
      job?.reject(event.error ?? new Error("QR işçisi başarısız oldu."));
      dispatch();
    };
  });

  function dispatch() {
    if (closed) return;

    for (const state of workerStates) {
      if (state.activeJob) continue;

      let job = queuedJobs.shift();
      while (job?.signal?.aborted) {
        job.reject(new QrWorkerPoolError("ABORTED", "QR çözme iptal edildi."));
        job = queuedJobs.shift();
      }
      if (!job) continue;

      state.activeJob = job;
      job.workerState = state;
      state.worker.postMessage({
        id: job.id,
        regionIndex: job.regionIndex,
        imageData: job.imageData,
      });
    }
  }

  function createJob(region, regionIndex, signal) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const job = {
        id,
        imageData: region.imageData,
        regionIndex,
        signal,
        settled: false,
        workerState: null,
        resolve(value) {
          settle(resolve, value);
        },
        reject(error) {
          settle(reject, error);
        },
      };

      const onAbort = () => {
        const queueIndex = queuedJobs.indexOf(job);
        if (queueIndex >= 0) queuedJobs.splice(queueIndex, 1);
        job.reject(new QrWorkerPoolError("ABORTED", "QR çözme iptal edildi."));
      };

      function settle(callback, value) {
        if (job.settled) return;
        job.settled = true;
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      }

      signal?.addEventListener("abort", onAbort, { once: true });
      queuedJobs.push(job);
    });
  }

  async function decode(regions, signal) {
    if (closed) throw new QrWorkerPoolError("CLOSED", "QR işçi havuzu kapalı.");
    if (signal?.aborted) throw new QrWorkerPoolError("ABORTED", "QR çözme iptal edildi.");

    const jobs = regions.map((region, regionIndex) => createJob(region, regionIndex, signal));
    dispatch();
    return (await Promise.all(jobs)).flat();
  }

  function close() {
    if (closed) return;
    closed = true;
    const error = new QrWorkerPoolError("CLOSED", "QR işçi havuzu kapatıldı.");

    for (const job of queuedJobs.splice(0)) job.reject(error);
    for (const state of workerStates) {
      state.activeJob?.reject(error);
      state.activeJob = null;
      state.worker.terminate();
    }
  }

  return { decode, close };
}

function defaultPoolSize() {
  return Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency || 2) - 1));
}
