import { sha256Base64Url } from '../protocol/hash.js';
import { createLiveFountainDecoder, LIVE_BLOCK_BYTES } from './fountain.js';
import { MAX_LEGACY_LIVE_QR_PACKAGE_BYTES, MAX_LIVE_QR_PACKAGE_BYTES } from './limits.js';
import { openLiveQrPackage } from './package-v1.js';
import {
  createStripeFountainDecoder,
  LIVE_V2_BLOCK_BYTES,
  MAX_PARITY_ROWS,
  STRIPE_DATA_COUNT,
} from './stripe-fountain-v2.js';

const COMMON_METADATA_FIELDS = [
  'protocolVersion', 'transferId', 'sourceCount', 'blockBytes', 'originalBytes', 'sha256',
];
const EMPTY_PROGRESS = Object.freeze({ solved: 0, sourceCount: 0, accepted: 0, duplicates: 0 });
const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const SHA256_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_LEGACY_SOURCE_COUNT = Math.ceil(
  MAX_LEGACY_LIVE_QR_PACKAGE_BYTES / LIVE_BLOCK_BYTES,
);
const MAX_V2_SOURCE_COUNT = Math.ceil(MAX_LIVE_QR_PACKAGE_BYTES / LIVE_V2_BLOCK_BYTES);

export class LiveQrReceiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LiveQrReceiveError';
    this.code = code;
  }
}

export function createLiveQrReceiveSession({ maxBytes = MAX_LIVE_QR_PACKAGE_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_LIVE_QR_PACKAGE_BYTES) {
    throw new RangeError('Canlı QR alım bellek sınırı geçersiz.');
  }

  let state = 'idle';
  let metadata = null;
  let decoder = null;
  let assemblyPromise = null;
  let completedResult = null;

  function accept(frame) {
    if (state === 'failed') return { accepted: false, reason: 'session-failed' };
    if (state === 'complete') return { accepted: false, reason: 'session-complete' };
    if (!isValidFrame(frame)) return { accepted: false, reason: 'invalid-frame' };
    if (frame.originalBytes > maxBytes) return failAccept('size-limit');

    if (metadata && frame.transferId !== metadata.transferId) {
      return { accepted: false, reason: 'different-transfer' };
    }
    const metadataFields = frame.protocolVersion === 'QRL2'
      ? [...COMMON_METADATA_FIELDS, 'stripeDataCount']
      : COMMON_METADATA_FIELDS;
    if (metadata && !metadataFields.every((field) => frame[field] === metadata[field])) {
      return { accepted: false, reason: 'metadata-mismatch' };
    }
    if (!metadata) {
      metadata = Object.freeze(Object.fromEntries(metadataFields.map((field) => [field, frame[field]])));
      decoder = frame.protocolVersion === 'QRL2'
        ? createStripeFountainDecoder(metadata)
        : createLiveFountainDecoder(metadata);
      state = 'collecting';
    }

    return decoder.accept({
      transferId: frame.transferId,
      symbolId: frame.symbolId,
      data: frame.data,
    });
  }

  async function acceptMany(frames) {
    if (!Array.isArray(frames)) return { results: [], result: null };
    const results = frames.map(accept);
    return { results, result: await assemble() };
  }

  async function assemble() {
    if (completedResult) return completedResult;
    if (assemblyPromise) return assemblyPromise;
    if (!decoder?.isComplete()) return null;

    assemblyPromise = (async () => {
      const bytes = decoder.bytes();
      if (!bytes || await sha256Base64Url(bytes) !== metadata.sha256) {
        throw integrityError();
      }

      try {
        const opened = await openLiveQrPackage(bytes);
        completedResult = { file: opened.file, sha256: opened.sha256 };
        state = 'complete';
        return completedResult;
      } catch {
        throw integrityError();
      }
    })().catch((error) => {
      state = 'failed';
      throw error;
    }).finally(() => {
      assemblyPromise = null;
    });

    return assemblyPromise;
  }

  function reset() {
    state = 'idle';
    metadata = null;
    decoder = null;
    assemblyPromise = null;
    completedResult = null;
  }

  function failAccept(reason) {
    state = 'failed';
    return { accepted: false, reason };
  }

  return {
    accept,
    acceptMany,
    assemble,
    progress: () => decoder?.progress() ?? EMPTY_PROGRESS,
    reset,
    getState: () => state,
    getMetadata: () => (metadata ? { ...metadata } : null),
  };
}

function integrityError() {
  return new LiveQrReceiveError(
    'INTEGRITY_FAILED',
    'Canlı QR aktarımının bütünlük kontrolü başarısız oldu.',
  );
}

function isValidFrame(frame) {
  const commonIsValid = Boolean(
    frame
      && typeof frame === 'object'
      && !Array.isArray(frame)
      && (frame.protocolVersion === 'QRL1' || frame.protocolVersion === 'QRL2')
      && typeof frame.transferId === 'string'
      && TRANSFER_ID_PATTERN.test(frame.transferId)
      && Number.isSafeInteger(frame.sourceCount)
      && frame.sourceCount >= 1
      && Number.isSafeInteger(frame.originalBytes)
      && frame.originalBytes >= 0
      && frame.originalBytes <= MAX_LIVE_QR_PACKAGE_BYTES
      && typeof frame.sha256 === 'string'
      && SHA256_PATTERN.test(frame.sha256)
      && Number.isSafeInteger(frame.symbolId)
      && frame.symbolId >= 0
      && frame.data instanceof Uint8Array,
  );
  if (!commonIsValid) return false;
  if (frame.protocolVersion === 'QRL1') {
    return frame.sourceCount <= MAX_LEGACY_SOURCE_COUNT
      && frame.blockBytes === LIVE_BLOCK_BYTES
      && frame.sourceCount === Math.max(1, Math.ceil(frame.originalBytes / frame.blockBytes))
      && frame.data.length === frame.blockBytes;
  }
  const stripeCount = Math.ceil(frame.sourceCount / STRIPE_DATA_COUNT);
  return frame.sourceCount <= MAX_V2_SOURCE_COUNT
    && frame.blockBytes === LIVE_V2_BLOCK_BYTES
    && frame.stripeDataCount === STRIPE_DATA_COUNT
    && frame.sourceCount === Math.max(1, Math.ceil(frame.originalBytes / frame.blockBytes))
    && frame.symbolId < frame.sourceCount + (stripeCount * MAX_PARITY_ROWS)
    && frame.data.length === frame.blockBytes;
}
