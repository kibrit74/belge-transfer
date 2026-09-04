export class LiveQrReceiveClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LiveQrReceiveClientError';
    this.code = code;
  }
}

export function createLiveQrReceiveWorker() {
  if (typeof globalThis.Worker !== 'function') {
    throw new LiveQrReceiveClientError(
      'LIVE_QR_UNSUPPORTED',
      'Bu tarayıcı Canlı QR alımını desteklemiyor.',
    );
  }
  return new Worker(new URL('../workers/live-qr-receive.worker.js', import.meta.url), { type: 'module' });
}

export function createLiveQrReceiveClient({ workerFactory = createLiveQrReceiveWorker } = {}) {
  const worker = workerFactory();
  if (!worker) {
    throw new LiveQrReceiveClientError(
      'LIVE_QR_UNSUPPORTED',
      'Bu tarayıcı Canlı QR alımını desteklemiyor.',
    );
  }

  const listeners = new Set();
  let sessionId = 0;
  let closed = false;

  function notify(message) {
    for (const listener of listeners) listener(message);
  }

  function post(message) {
    if (closed) return false;
    try {
      worker.postMessage(message);
      return true;
    } catch (error) {
      notify({
        type: 'error',
        sessionId,
        error: {
          code: 'WORKER_ERROR',
          message: error?.message || 'Canlı QR alım worker işlemi başarısız oldu.',
        },
      });
      return false;
    }
  }

  worker.onmessage = (event) => {
    const message = event?.data;
    if (!message || message.sessionId !== sessionId || closed) return;
    notify(message);
  };
  worker.onerror = (event) => {
    if (closed) return;
    notify({
      type: 'error',
      sessionId,
      error: {
        code: 'WORKER_ERROR',
        message: event?.message || 'Canlı QR alım worker işlemi başarısız oldu.',
      },
    });
  };

  post({ type: 'start', sessionId });

  return {
    accept(texts) {
      const validTexts = Array.isArray(texts) ? texts.filter((text) => typeof text === 'string') : [];
      return post({ type: 'accept', sessionId, texts: validTexts });
    },
    reset() {
      if (closed) return sessionId;
      sessionId += 1;
      post({ type: 'reset', sessionId });
      return sessionId;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Canlı QR dinleyicisi bir fonksiyon olmalı.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      worker.terminate();
    },
    getSessionId: () => sessionId,
  };
}
