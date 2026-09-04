export class LiveQrRenderPoolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LiveQrRenderPoolError';
    this.code = code;
  }
}

export function createLiveQrRenderPool({ workerFactory = createDefaultWorker, size } = {}) {
  if (typeof workerFactory !== 'function') throw new TypeError('Canlı QR worker fabrikası gerekli.');

  const requestedSize = Number.isSafeInteger(size)
    ? size
    : (globalThis.navigator?.hardwareConcurrency ?? 2) - 1;
  const safeSize = Math.max(2, Math.min(4, requestedSize));
  const states = [];
  const queue = [];
  let nextId = 0;
  let closed = false;

  try {
    for (let index = 0; index < safeSize; index += 1) {
      states.push({ worker: workerFactory(), active: null });
    }
  } catch (error) {
    states.forEach(({ worker }) => worker.terminate());
    throw error;
  }

  function settle(job, callback, value) {
    if (job.settled) return;
    job.settled = true;
    callback(value);
  }

  function dispatch() {
    if (closed) return;
    for (const state of states) {
      if (state.active) continue;
      const job = queue.shift();
      if (!job) continue;
      state.active = job;
      try {
        state.worker.postMessage({
          id: job.id,
          frameIndex: job.frameIndex,
          regionIndex: job.regionIndex,
          text: job.text,
        });
      } catch (error) {
        state.active = null;
        settle(job, job.reject, new LiveQrRenderPoolError('WORKER_ERROR', error?.message || 'QR karesi hazırlanamadı.'));
      }
    }
  }

  function fail(error) {
    if (closed) return;
    closed = true;
    for (const job of queue.splice(0)) settle(job, job.reject, error);
    for (const state of states) {
      if (state.active) settle(state.active, state.active.reject, error);
      state.active = null;
      state.worker.terminate();
    }
  }

  states.forEach((state) => {
    state.worker.onmessage = (event) => {
      const job = state.active;
      if (!job || event?.data?.id !== job.id) return;
      state.active = null;
      if (event.data.error) {
        settle(job, job.reject, new LiveQrRenderPoolError(
          event.data.error.code || 'QR_RENDER_ERROR',
          event.data.error.message || 'QR karesi hazırlanamadı.',
        ));
      } else {
        settle(job, job.resolve, {
          frameIndex: event.data.frameIndex,
          regionIndex: event.data.regionIndex,
          width: event.data.width,
          height: event.data.height,
          pixels: event.data.pixels,
        });
      }
      dispatch();
    };
    state.worker.onerror = (event) => fail(new LiveQrRenderPoolError(
      'WORKER_ERROR',
      event?.error?.message || 'Canlı QR hazırlama worker işlemi başarısız oldu.',
    ));
  });

  return {
    render(text, { frameIndex = 0, regionIndex = 0 } = {}) {
      if (closed) return Promise.reject(new LiveQrRenderPoolError('CLOSED', 'Canlı QR hazırlama havuzu kapalı.'));
      if (typeof text !== 'string' || !text) {
        return Promise.reject(new LiveQrRenderPoolError('INVALID_TEXT', 'Canlı QR metni geçersiz.'));
      }
      return new Promise((resolve, reject) => {
        queue.push({ id: ++nextId, text, frameIndex, regionIndex, resolve, reject, settled: false });
        dispatch();
      });
    },
    close() {
      fail(new LiveQrRenderPoolError('CLOSED', 'Canlı QR hazırlama havuzu kapatıldı.'));
    },
  };
}

function createDefaultWorker() {
  if (typeof Worker !== 'function') {
    throw new LiveQrRenderPoolError('WORKER_UNSUPPORTED', 'Canlı QR hazırlama worker desteği yok.');
  }
  return new Worker(new URL('../workers/live-qr-render.worker.js', import.meta.url), { type: 'module' });
}
