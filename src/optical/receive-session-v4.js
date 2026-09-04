import { sha256Base64Url } from "../protocol/hash.js";
import { MAX_INPUT_BYTES } from "../protocol/frame-v3.js";
import { createFountainDecoder } from "./fountain.js";

const METADATA_FIELDS = [
  "transferId",
  "sourceCount",
  "blockBytes",
  "originalBytes",
  "sha256",
];

class OpticalReceiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OpticalReceiveError";
    this.code = code;
  }
}

export function createOpticalReceiveSession(options = {}) {
  const maxBytes = options.maxBytes ?? MAX_INPUT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("Bellek sınırı geçersiz.");
  }

  let state = "idle";
  let metadata = null;
  let decoder = null;
  const acceptedSymbols = new Map();

  function accept(frame) {
    if (state === "failed") return { accepted: false, reason: "session-failed" };
    if (!isValidFrame(frame)) return { accepted: false, reason: "invalid-frame" };
    if (frame.originalBytes > maxBytes) {
      state = "failed";
      return { accepted: false, reason: "size-limit" };
    }

    if (metadata) {
      if (frame.transferId !== metadata.transferId) {
        return { accepted: false, reason: "different-transfer" };
      }
      if (!METADATA_FIELDS.every((field) => frame[field] === metadata[field])) {
        return { accepted: false, reason: "metadata-mismatch" };
      }
    } else {
      metadata = Object.fromEntries(METADATA_FIELDS.map((field) => [field, frame[field]]));
      metadata.protocolVersion = "QRF1";
      decoder = createFountainDecoder(metadata);
      state = "collecting";
    }

    const result = decoder.accept({
      transferId: frame.transferId,
      symbolId: frame.symbolId,
      data: frame.data,
    });
    if (result.accepted) acceptedSymbols.set(frame.symbolId, new Uint8Array(frame.data));
    if (decoder.isComplete()) state = "complete";
    return result;
  }

  async function assemble() {
    if (!decoder?.isComplete()) return null;
    const bytes = decoder.bytes();
    if (!bytes || await sha256Base64Url(bytes) !== metadata.sha256) {
      state = "failed";
      throw new OpticalReceiveError("INTEGRITY_FAILED", "QR videosunun bütünlük kontrolü başarısız.");
    }
    state = "complete";
    return { bytes, metadata: { ...metadata } };
  }

  function progress() {
    return decoder?.progress() ?? {
      solved: 0,
      sourceCount: 0,
      accepted: 0,
      duplicates: 0,
    };
  }

  function exportRecovery() {
    return {
      protocolVersion: "QRF1",
      metadata: metadata ? { ...metadata } : null,
      symbols: [...acceptedSymbols].map(([symbolId, data]) => ({
        symbolId,
        data: new Uint8Array(data),
      })),
    };
  }

  return {
    accept,
    progress,
    assemble,
    exportRecovery,
    getState: () => state,
    getMetadata: () => (metadata ? { ...metadata } : null),
  };
}

function isValidFrame(frame) {
  return Boolean(
    frame &&
    frame.protocolVersion === "QRF1" &&
    typeof frame.transferId === "string" &&
    Number.isSafeInteger(frame.symbolId) &&
    frame.symbolId >= 0 &&
    Number.isSafeInteger(frame.sourceCount) &&
    frame.sourceCount > 0 &&
    Number.isSafeInteger(frame.blockBytes) &&
    frame.blockBytes > 0 &&
    Number.isSafeInteger(frame.originalBytes) &&
    frame.originalBytes >= 0 &&
    typeof frame.sha256 === "string" &&
    frame.sha256.length === 43 &&
    frame.data instanceof Uint8Array &&
    frame.data.length > 0 &&
    frame.data.length <= frame.blockBytes
  );
}
