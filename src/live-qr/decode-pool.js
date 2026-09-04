export class LiveQrDecodePoolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LiveQrDecodePoolError';
    this.code = code;
  }
}

export function createLiveQrDecodePool({ workerFactory = createDefaultWorker, size } = {}) {
  if (typeof workerFactory !== 'function') throw new TypeError('Canlı QR çözüm worker fabrikası gerekli.');

  const requestedSize = Number.isSafeInteger(size)
    ? size
    : (globalThis.navigator?.hardwareConcurrency ?? 2) - 1;
  const safeSize = Math.min(3, Math.max(1, requestedSize));
  const states = [];
  let nextId = 0;
  let closed = false;

  try {
    for (let index = 0; index < safeSize; index += 1) {
      states.push({ worker: workerFactory(), job: null });
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

  function failState(state, error) {
    if (!state.job) return;
    const { job } = state;
    state.job = null;
    settle(job, job.reject, error);
  }

  states.forEach((state) => {
    state.worker.onmessage = (event) => {
      const { job } = state;
      const message = event?.data;
      if (!job || message?.id !== job.id) return;
      state.job = null;
      if (message.error) {
        settle(job, job.resolve, {
          dropped: false,
          texts: [],
          error: {
            code: message.error.code || 'WASM_UNAVAILABLE',
            message: message.error.message || 'QR çözümleyici kullanılamıyor.',
          },
        });
        return;
      }
      settle(job, job.resolve, {
        dropped: false,
        texts: [...new Set((message.texts || []).filter((text) => typeof text === 'string'))],
      });
    };
    state.worker.onerror = (event) => {
      failState(state, new LiveQrDecodePoolError(
        'WORKER_ERROR',
        event?.error?.message || 'Canlı QR çözüm worker işlemi başarısız oldu.',
      ));
    };
  });

  return {
    decode(imageData) {
      if (closed) return Promise.reject(new LiveQrDecodePoolError('CLOSED', 'Canlı QR çözüm havuzu kapalı.'));
      if (!imageData?.data || !Number.isSafeInteger(imageData.width) || !Number.isSafeInteger(imageData.height)) {
        return Promise.reject(new LiveQrDecodePoolError('INVALID_IMAGE', 'Kamera görüntüsü geçersiz.'));
      }
      const state = states.find((candidate) => candidate.job === null);
      if (!state) return Promise.resolve({ dropped: true, texts: [] });

      const copiedData = new Uint8ClampedArray(imageData.data);
      return new Promise((resolve, reject) => {
        const job = { id: ++nextId, resolve, reject, settled: false };
        state.job = job;
        try {
          state.worker.postMessage({
            id: job.id,
            imageData: { data: copiedData, width: imageData.width, height: imageData.height },
          }, [copiedData.buffer]);
        } catch (error) {
          state.job = null;
          settle(job, reject, new LiveQrDecodePoolError(
            'WORKER_ERROR',
            error?.message || 'Canlı QR görüntüsü gönderilemedi.',
          ));
        }
      });
    },
    close() {
      if (closed) return;
      closed = true;
      const error = new LiveQrDecodePoolError('CLOSED', 'Canlı QR çözüm havuzu kapatıldı.');
      for (const state of states) {
        failState(state, error);
        state.worker.terminate();
      }
    },
  };
}

function createDefaultWorker() {
  if (typeof Worker !== 'function') {
    throw new LiveQrDecodePoolError('WORKER_UNSUPPORTED', 'Canlı QR çözüm worker desteği yok.');
  }
  return new Worker(new URL('../workers/live-qr-decode.worker.js', import.meta.url), { type: 'module' });
}
