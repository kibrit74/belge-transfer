import { assembleChunks } from "../protocol.js";
import { MAX_FRAME_COUNT, MAX_INPUT_BYTES } from "../protocol/frame-v3.js";

const QRT3 = "QRT3";

export function createReceiveSession(options = {}) {
  const maxBytes = options.maxBytes ?? MAX_INPUT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("Bellek sınırı negatif olmayan güvenli bir tam sayı olmalı.");
  }

  let state = "idle";
  let metadata = null;
  let chunks = new Map();
  let collectedBytes = 0;

  function accept(frame) {
    if (state === "failed") {
      return { accepted: false, reason: "session-failed" };
    }

    const candidateMetadata = validateAndReadMetadata(frame);
    if (!candidateMetadata) {
      return { accepted: false, reason: "invalid-frame" };
    }

    if (state !== "idle") {
      if (frame.transferId !== metadata.transferId) {
        return { accepted: false, reason: "different-transfer" };
      }
      if (!hasMatchingMetadata(metadata, candidateMetadata)) {
        return { accepted: false, reason: "metadata-mismatch" };
      }
    }

    if (chunks.has(frame.index)) {
      return { accepted: false, reason: "duplicate" };
    }

    const declaredSize = candidateMetadata.size;
    if (declaredSize !== undefined && declaredSize > maxBytes) {
      state = "failed";
      return { accepted: false, reason: "size-limit" };
    }
    if (collectedBytes + frame.data.length > maxBytes) {
      state = "failed";
      return { accepted: false, reason: "size-limit" };
    }

    if (state === "idle") {
      metadata = candidateMetadata;
      state = "collecting";
    }

    const storedData = new Uint8Array(frame.data);
    chunks.set(frame.index, storedData);
    collectedBytes += storedData.length;
    if (chunks.size === metadata.total) {
      state = "complete";
    }

    return { accepted: true };
  }

  function progress() {
    return {
      collected: chunks.size,
      total: metadata?.total ?? 0,
    };
  }

  function assemble() {
    if (state !== "complete") return null;

    let bytes;
    if (metadata.protocolVersion === QRT3) {
      bytes = concatenateChunks(chunks, metadata.total, collectedBytes);
    } else {
      bytes = assembleChunks(chunks, metadata.total, metadata.size, metadata.isCompressed);
      if (!(bytes instanceof Uint8Array) || bytes.length !== metadata.size) {
        state = "failed";
        return null;
      }
    }

    if (!bytes) {
      state = "failed";
      return null;
    }

    return { bytes, metadata: { ...metadata } };
  }

  function reset() {
    state = "idle";
    metadata = null;
    chunks = new Map();
    collectedBytes = 0;
  }

  return {
    accept,
    progress,
    assemble,
    reset,
    getState: () => state,
    getMetadata: () => (metadata ? { ...metadata } : null),
  };
}

function validateAndReadMetadata(frame) {
  if (
    frame === null ||
    typeof frame !== "object" ||
    Array.isArray(frame) ||
    typeof frame.transferId !== "string" ||
    frame.transferId.length === 0 ||
    !Number.isSafeInteger(frame.index) ||
    frame.index < 0 ||
    !Number.isSafeInteger(frame.total) ||
    frame.total <= 0 ||
    frame.total > MAX_FRAME_COUNT ||
    frame.index >= frame.total ||
    !(frame.data instanceof Uint8Array)
  ) {
    return null;
  }

  if (frame.protocolVersion !== undefined) {
    if (
      frame.protocolVersion !== QRT3 ||
      !Number.isSafeInteger(frame.payloadSize) ||
      frame.payloadSize < 0 ||
      frame.payloadSize !== frame.data.length ||
      typeof frame.chunkCrc32 !== "string" ||
      !/^[0-9a-f]{8}$/.test(frame.chunkCrc32)
    ) {
      return null;
    }

    return {
      protocolVersion: frame.protocolVersion,
      transferId: frame.transferId,
      total: frame.total,
    };
  }

  if (
    typeof frame.name !== "string" ||
    typeof frame.mime !== "string" ||
    !Number.isSafeInteger(frame.size) ||
    frame.size < 0 ||
    typeof frame.isCompressed !== "boolean"
  ) {
    return null;
  }

  return {
    transferId: frame.transferId,
    total: frame.total,
    name: frame.name,
    mime: frame.mime,
    size: frame.size,
    isCompressed: frame.isCompressed,
  };
}

function hasMatchingMetadata(current, candidate) {
  const fields = new Set([...Object.keys(current), ...Object.keys(candidate)]);
  for (const field of fields) {
    if (current[field] !== candidate[field]) return false;
  }
  return true;
}

function concatenateChunks(chunks, total, totalBytes) {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (let index = 0; index < total; index += 1) {
    const chunk = chunks.get(index);
    if (!chunk) return null;
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
}
