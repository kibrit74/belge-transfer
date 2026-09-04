import { sha256Base64Url } from '../protocol/hash.js';
import { createFountainDecoder } from './fountain.js';

const METADATA_FIELDS = ['transferId', 'sourceCount', 'blockBytes', 'originalBytes', 'sha256'];
const EMPTY_PROGRESS = Object.freeze({ solved: 0, sourceCount: 0, accepted: 0, duplicates: 0 });
const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const SHA256_BASE64URL_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_SOURCE_COUNT = 100_000;
const MAX_BLOCK_BYTES = 4_096;
const MAX_SYMBOL_MULTIPLIER = 4;

export class ColorReceiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ColorReceiveError';
    this.code = code;
  }
}

export function createColorReceiveSession(options = {}) {
  const maxBytes = options.maxBytes ?? 15 * 1024 * 1024 + 16 * 1024 + 9;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('Bellek sınırı geçersiz.');
  }

  let state = 'idle';
  let metadata = null;
  let decoder = null;

  function accept(frame) {
    if (state === 'failed') return { accepted: false, reason: 'session-failed' };
    if (!isValidColorFrame(frame)) return { accepted: false, reason: 'invalid-frame' };
    if (frame.originalBytes > maxBytes) return failAccept('size-limit');

    if (metadata && frame.transferId !== metadata.transferId) {
      return { accepted: false, reason: 'different-transfer' };
    }
    if (metadata && !METADATA_FIELDS.every((field) => frame[field] === metadata[field])) {
      return { accepted: false, reason: 'metadata-mismatch' };
    }
    if (!metadata) {
      metadata = Object.fromEntries(METADATA_FIELDS.map((field) => [field, frame[field]]));
      metadata.protocolVersion = 'CRF2';
      decoder = createFountainDecoder(metadata);
      state = 'collecting';
    }

    const result = decoder.accept({
      transferId: frame.transferId,
      symbolId: frame.symbolId,
      data: frame.data,
    });
    if (decoder.isComplete()) state = 'complete';
    return result;
  }

  async function assemble() {
    if (!decoder?.isComplete()) return null;

    const bytes = decoder.bytes();
    if (!bytes || await sha256Base64Url(bytes) !== metadata.sha256) {
      state = 'failed';
      throw new ColorReceiveError(
        'CONTAINER_HASH_MISMATCH',
        'Renkli QR kapsayıcısı bütünlük kontrolünü geçemedi.',
      );
    }

    state = 'complete';
    return { bytes, metadata: { ...metadata } };
  }

  function reset() {
    state = 'idle';
    metadata = null;
    decoder = null;
  }

  function failAccept(reason) {
    state = 'failed';
    return { accepted: false, reason };
  }

  return {
    accept,
    assemble,
    progress: () => decoder?.progress() ?? EMPTY_PROGRESS,
    reset,
    getState: () => state,
    getMetadata: () => (metadata ? { ...metadata } : null),
  };
}

function isValidColorFrame(frame) {
  return Boolean(
    frame
      && typeof frame === 'object'
      && !Array.isArray(frame)
      && frame.protocolVersion === 'CRF2'
      && typeof frame.transferId === 'string'
      && TRANSFER_ID_PATTERN.test(frame.transferId)
      && Number.isSafeInteger(frame.sourceCount)
      && frame.sourceCount >= 1
      && frame.sourceCount <= MAX_SOURCE_COUNT
      && Number.isSafeInteger(frame.blockBytes)
      && frame.blockBytes >= 1
      && frame.blockBytes <= MAX_BLOCK_BYTES
      && Number.isSafeInteger(frame.originalBytes)
      && frame.originalBytes >= 0
      && frame.originalBytes <= frame.sourceCount * frame.blockBytes
      && typeof frame.sha256 === 'string'
      && SHA256_BASE64URL_PATTERN.test(frame.sha256)
      && Number.isSafeInteger(frame.symbolId)
      && frame.symbolId >= 0
      && frame.symbolId < frame.sourceCount * MAX_SYMBOL_MULTIPLIER
      && frame.data instanceof Uint8Array
      && frame.data.length === frame.blockBytes
  );
}
