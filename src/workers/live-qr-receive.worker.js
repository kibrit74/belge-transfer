import { parseLiveFrame } from '../live-qr/frame.js';
import { createLiveQrReceiveSession } from '../live-qr/receive-session.js';

function serializeError(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'WORKER_ERROR',
    message: typeof error?.message === 'string' && error.message
      ? error.message
      : 'Canlı QR alım işlemi başarısız oldu.',
  };
}

function isSessionId(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createLiveQrReceiveWorkerMessageHandler({
  postMessage = (...args) => globalThis.postMessage(...args),
  createSession = createLiveQrReceiveSession,
} = {}) {
  const sessions = new Map();

  function start(sessionId) {
    // İstemci tek bir etkin tarama oturumu kullanır; eskileri bellekte tutmayız.
    sessions.clear();
    const session = createSession();
    sessions.set(sessionId, session);
    postMessage({ type: 'progress', sessionId, progress: session.progress(), state: session.getState() });
    return session;
  }

  return async function handleMessage(event) {
    const message = event?.data ?? event;
    const sessionId = message?.sessionId;
    if (!message || !isSessionId(sessionId)) return;

    try {
      if (message.type === 'start' || message.type === 'reset') {
        start(sessionId);
        return;
      }
      if (message.type !== 'accept') return;

      const session = sessions.get(sessionId);
      if (!session) {
        postMessage({
          type: 'error',
          sessionId,
          error: { code: 'SESSION_NOT_FOUND', message: 'Canlı QR alım oturumu bulunamadı.' },
        });
        return;
      }

      const frames = Array.isArray(message.texts)
        ? message.texts.map(parseLiveFrame).filter(Boolean)
        : [];
      for (const frame of frames) session.accept(frame);
      const progress = session.progress();
      if (progress.sourceCount > 0 && progress.solved >= progress.sourceCount) {
        postMessage({ type: 'progress', sessionId, progress, state: 'verifying' });
      }
      const result = await session.assemble();
      postMessage({ type: 'progress', sessionId, progress: session.progress(), state: session.getState() });
      if (result) {
        postMessage({ type: 'complete', sessionId, result });
      } else if (session.getState() === 'failed') {
        postMessage({
          type: 'error',
          sessionId,
          error: { code: 'RECEIVE_FAILED', message: 'Canlı QR aktarımı doğrulanamadı.' },
        });
      }
    } catch (error) {
      postMessage({ type: 'error', sessionId, error: serializeError(error) });
    }
  };
}

const isWorkerScope = typeof WorkerGlobalScope !== 'undefined'
  && globalThis instanceof WorkerGlobalScope;

if (isWorkerScope) {
  const handleMessage = createLiveQrReceiveWorkerMessageHandler();
  globalThis.addEventListener('message', handleMessage);
}
