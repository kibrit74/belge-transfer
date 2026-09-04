import { encodeColorFrameV2, parseColorFrameV2 } from '../optical/color-frame-v2.js';
import { scanColorMatrixV2 } from '../optical/color-matrix-canvas.js';
import { createColorPackageV2 } from '../optical/color-package-v2.js';
import { createFountainEncoder } from '../optical/fountain.js';
import { prepareTransferPayload } from '../transfer/payload-compression.js';

const opticalSessions = new Map();
const opticalSessionTokens = new Map();

export function pickCompressionStats(stats) {
  if (!stats) return null;
  return {
    compression: stats.compression,
    originalSize: stats.originalSize,
    storedSize: stats.storedSize,
    savedBytes: stats.savedBytes,
    savedPercent: stats.savedPercent,
  };
}

function workerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function serializeError(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'WORKER_ERROR',
    message: typeof error?.message === 'string' && error.message
      ? error.message
      : 'Renkli QR worker işlemi başarısız oldu.',
  };
}

export function createColorQrWorkerMessageHandler(dependencies = {}) {
  const deps = {
    postMessage: (...args) => globalThis.postMessage(...args),
    prepareTransferPayload,
    createColorPackageV2,
    createFountainEncoder,
    encodeColorFrameV2,
    scanColorMatrixV2,
    parseColorFrameV2,
    ...dependencies,
  };
  const sessions = dependencies.opticalSessions ?? opticalSessions;
  const sessionTokens = dependencies.opticalSessionTokens ?? opticalSessionTokens;

  function beginSessionPreparation(sessionId) {
    const token = {};
    sessions.delete(sessionId);
    sessionTokens.set(sessionId, token);
    return token;
  }

  function assertSessionToken(sessionId, token) {
    if (sessionTokens.get(sessionId) !== token) {
      throw workerError('STALE_SESSION', 'Renkli QR oturumu artık geçerli değil.');
    }
  }

  function reply(type, sessionId, requestId, result, transfer = []) {
    deps.postMessage({ type, sessionId, requestId, result }, transfer);
  }

  async function prepareEncoderAndReply(
    responseType,
    sessionId,
    requestId,
    bytes,
    transferId,
    stats,
    token,
  ) {
    assertSessionToken(sessionId, token);
    const encoder = await deps.createFountainEncoder(bytes, {
      transferId,
      blockBytes: 380,
      emissionRatio: 1.30,
    });
    assertSessionToken(sessionId, token);
    sessions.set(sessionId, encoder);
    const metadata = encoder.metadata;
    reply(responseType, sessionId, requestId, {
      transferId: metadata.transferId,
      sourceCount: metadata.sourceCount,
      emittedSymbols: metadata.emittedSymbols,
      blockBytes: metadata.blockBytes,
      originalBytes: metadata.originalBytes,
      compressionStats: pickCompressionStats(stats),
    });
  }

  return async function handleMessage(event) {
    const message = event?.data ?? event;
    const { type, sessionId, requestId } = message ?? {};

    try {
      switch (type) {
        case 'prepare-payload': {
          const prepared = await deps.prepareTransferPayload(new Uint8Array(message.bytes));
          reply(
            'prepared-payload',
            sessionId,
            requestId,
            prepared,
            [prepared.storedBytes.buffer],
          );
          return;
        }
        case 'prepare-package': {
          const token = beginSessionPreparation(sessionId);
          const created = await deps.createColorPackageV2(message.input);
          await prepareEncoderAndReply(
            'prepared-package',
            sessionId,
            requestId,
            created.containerBytes,
            created.metadata.transferId,
            created.stats,
            token,
          );
          return;
        }
        case 'prepare-optical': {
          const token = beginSessionPreparation(sessionId);
          await prepareEncoderAndReply(
            'prepared-optical',
            sessionId,
            requestId,
            new Uint8Array(message.bytes),
            message.options?.transferId,
            null,
            token,
          );
          return;
        }
        case 'get-frame': {
          const encoder = sessions.get(sessionId);
          if (!encoder) {
            throw workerError('STALE_SESSION', 'Renkli QR oturumu artık geçerli değil.');
          }
          const symbol = encoder.symbol(message.symbolId);
          const frameBytes = deps.encodeColorFrameV2(encoder.metadata, symbol);
          reply(
            'color-frame',
            sessionId,
            requestId,
            { frameBytes },
            [frameBytes.buffer],
          );
          return;
        }
        case 'decode-image': {
          const scan = deps.scanColorMatrixV2(message.imageData);
          const frame = scan ? deps.parseColorFrameV2(scan.frameBytes) : null;
          reply(
            'decoded-frame',
            sessionId,
            requestId,
            { scan, frame },
            frame ? [frame.data.buffer] : [],
          );
          return;
        }
        case 'dispose-session':
          sessionTokens.delete(sessionId);
          sessions.delete(sessionId);
          return;
        default:
          throw workerError('INVALID_WORKER_REQUEST', 'Renkli QR worker isteği geçersiz.');
      }
    } catch (error) {
      const serialized = serializeError(error);
      deps.postMessage({
        type: 'error',
        sessionId,
        requestId,
        code: serialized.code,
        message: serialized.message,
      });
    }
  };
}

if (typeof WorkerGlobalScope !== 'undefined'
  && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = createColorQrWorkerMessageHandler();
}
