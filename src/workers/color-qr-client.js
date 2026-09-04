export class ColorQrWorkerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ColorQrWorkerError';
    this.code = code;
  }
}

function clientError(code, message) {
  return new ColorQrWorkerError(code, message);
}

export function createWorker() {
  if (typeof globalThis.Worker !== 'function') {
    throw clientError(
      'COLOR_UNSUPPORTED',
      'Bu tarayıcı renkli QR işlemlerini desteklemiyor.',
    );
  }

  return new Worker(new URL('./color-qr.worker.js', import.meta.url), { type: 'module' });
}

export function createColorQrWorkerClient({ worker = createWorker() } = {}) {
  if (!worker) {
    throw clientError(
      'COLOR_UNSUPPORTED',
      'Bu tarayıcı renkli QR işlemlerini desteklemiyor.',
    );
  }

  const pending = new Map();
  const disposedSessions = new Set();
  let nextRequestId = 0;
  let terminated = false;

  function rejectPending(error, sessionId) {
    for (const [requestId, request] of pending) {
      if (sessionId !== undefined && request.sessionId !== sessionId) continue;
      pending.delete(requestId);
      request.reject(error);
    }
  }

  function toWorkerError(error, fallbackCode = 'WORKER_ERROR') {
    const code = typeof error?.code === 'string' ? error.code : fallbackCode;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Renkli QR worker işlemi başarısız oldu.';
    return clientError(code, message);
  }

  function closeFromWorkerError(event) {
    if (terminated) return;
    terminated = true;
    rejectPending(toWorkerError(event?.error ?? event));
    worker.terminate();
  }

  worker.onmessage = (event) => {
    const response = event.data;
    const request = pending.get(response?.requestId);
    if (!request) return;

    pending.delete(response.requestId);
    if (disposedSessions.has(request.sessionId)
      || response.sessionId !== request.sessionId) {
      request.reject(clientError('STALE_SESSION', 'Renkli QR oturumu artık geçerli değil.'));
      return;
    }

    if (response.type === 'error' || response.error) {
      request.reject(toWorkerError(response.error ?? response.result ?? response));
      return;
    }

    request.resolve(response.result);
  };

  worker.onerror = closeFromWorkerError;

  function request(type, sessionId, payload = {}, transfer = []) {
    if (terminated) {
      return Promise.reject(clientError(
        'WORKER_TERMINATED',
        'Renkli QR worker sonlandırıldı.',
      ));
    }
    if (disposedSessions.has(sessionId)) {
      return Promise.reject(clientError(
        'STALE_SESSION',
        'Renkli QR oturumu artık geçerli değil.',
      ));
    }

    const requestId = ++nextRequestId;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, sessionId });
      try {
        worker.postMessage({ type, sessionId, requestId, ...payload }, transfer);
      } catch (error) {
        pending.delete(requestId);
        reject(toWorkerError(error));
      }
    });
  }

  function preparePayload(sessionId, bytes) {
    const copiedBytes = new Uint8Array(bytes);
    return request(
      'prepare-payload',
      sessionId,
      { bytes: copiedBytes },
      [copiedBytes.buffer],
    );
  }

  function preparePackage(sessionId, input) {
    return request('prepare-package', sessionId, { input });
  }

  function prepareOptical(sessionId, bytes, options) {
    const copiedBytes = new Uint8Array(bytes);
    return request(
      'prepare-optical',
      sessionId,
      { bytes: copiedBytes, options },
      [copiedBytes.buffer],
    );
  }

  function getFrame(sessionId, symbolId) {
    return request('get-frame', sessionId, { symbolId });
  }

  function decodeImage(sessionId, imageData) {
    const copiedData = new Uint8ClampedArray(imageData.data);
    return request(
      'decode-image',
      sessionId,
      { imageData: { data: copiedData, width: imageData.width, height: imageData.height } },
      [copiedData.buffer],
    );
  }

  function disposeSession(sessionId) {
    if (disposedSessions.has(sessionId)) return;
    disposedSessions.add(sessionId);
    rejectPending(
      clientError('STALE_SESSION', 'Renkli QR oturumu artık geçerli değil.'),
      sessionId,
    );
    if (terminated) return;

    worker.postMessage({
      type: 'dispose-session',
      sessionId,
      requestId: ++nextRequestId,
    });
  }

  function terminate() {
    if (terminated) return;
    terminated = true;
    rejectPending(clientError('WORKER_TERMINATED', 'Renkli QR worker sonlandırıldı.'));
    worker.terminate();
  }

  return {
    preparePayload,
    preparePackage,
    prepareOptical,
    getFrame,
    decodeImage,
    disposeSession,
    terminate,
  };
}
