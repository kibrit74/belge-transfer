import { fromBase64Url, toBase64Url } from "../protocol/base64url.js";

export const NEARBY_PROTOCOL_VERSION = "NDP1";
export const MAX_NEARBY_FILE_BYTES = 100 * 1024 * 1024;
export const NEARBY_CHUNK_BYTES = 32 * 1024;
export const NEARBY_VERIFIED_MESSAGE = "VDN1|VERIFIED";

export function isNearbyHandshakeMessage(value) {
  return value === "VDN1|READY" || value === "VDN1|ACK" || value === NEARBY_VERIFIED_MESSAGE;
}

const MAX_CONTROL_TEXT_LENGTH = 2048;
const CHUNK_TYPE = 1;
const CHUNK_HEADER_BYTES = 9;
const MAX_UINT32 = 0xffffffff;
const TRANSFER_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const SHA256_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const FORBIDDEN_NAME_PATTERN = /[\u0000-\u001f\u007f/\\]/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const CONTROL_KEYS = Object.freeze({
  "offer-file": Object.freeze(["version", "type", "transferId", "name", "mime", "size", "sha256"]),
  "accept-file": Object.freeze(["version", "type", "transferId"]),
  "reject-file": Object.freeze(["version", "type", "transferId", "reason"]),
  complete: Object.freeze(["version", "type", "transferId", "totalBytes", "sha256"]),
  cancel: Object.freeze(["version", "type", "transferId", "reason"]),
  error: Object.freeze(["version", "type", "code"]),
});

export function encodeControlMessage(message) {
  if (!isValidControlMessage(message)) {
    throw new TypeError("Yakındaki Cihazlar kontrol mesajı geçersiz.");
  }

  const text = JSON.stringify(message);
  if (text.length > MAX_CONTROL_TEXT_LENGTH) {
    throw new RangeError("Yakındaki Cihazlar kontrol mesajı çok büyük.");
  }
  return text;
}

export function parseControlMessage(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_CONTROL_TEXT_LENGTH) {
    return null;
  }

  try {
    const value = JSON.parse(text);
    return isValidControlMessage(value) ? Object.freeze({ ...value }) : null;
  } catch {
    return null;
  }
}

export function encodeChunkFrame({ sequence, offset, bytes } = {}) {
  if (
    !isUint32(sequence) ||
    !isUint32(offset) ||
    !(bytes instanceof Uint8Array) ||
    bytes.length > NEARBY_CHUNK_BYTES
  ) {
    throw new RangeError("Yakındaki Cihazlar dosya parçası geçersiz.");
  }

  const frame = new Uint8Array(CHUNK_HEADER_BYTES + bytes.length);
  const view = new DataView(frame.buffer);
  view.setUint8(0, CHUNK_TYPE);
  view.setUint32(1, sequence, false);
  view.setUint32(5, offset, false);
  frame.set(bytes, CHUNK_HEADER_BYTES);
  return frame.buffer;
}

export function parseChunkFrame(buffer) {
  const frame = toUint8Array(buffer);
  if (
    !frame ||
    frame.length < CHUNK_HEADER_BYTES ||
    frame.length > CHUNK_HEADER_BYTES + NEARBY_CHUNK_BYTES
  ) {
    return null;
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  if (view.getUint8(0) !== CHUNK_TYPE) return null;

  return {
    sequence: view.getUint32(1, false),
    offset: view.getUint32(5, false),
    bytes: frame.slice(CHUNK_HEADER_BYTES),
  };
}

function isValidControlMessage(value) {
  if (!isPlainObject(value) || value.version !== NEARBY_PROTOCOL_VERSION) return false;
  const expectedKeys = CONTROL_KEYS[value.type];
  if (!expectedKeys || !hasExactKeys(value, expectedKeys)) return false;

  switch (value.type) {
    case "offer-file":
      return isTransferId(value.transferId) &&
        isSafeName(value.name) &&
        isBoundedText(value.mime, 127) &&
        isFileByteCount(value.size) &&
        isCanonicalSha256(value.sha256);
    case "accept-file":
      return isTransferId(value.transferId);
    case "reject-file":
    case "cancel":
      return isTransferId(value.transferId) && isBoundedText(value.reason, 255);
    case "complete":
      return isTransferId(value.transferId) &&
        isFileByteCount(value.totalBytes) &&
        isCanonicalSha256(value.sha256);
    case "error":
      return typeof value.code === "string" && ERROR_CODE_PATTERN.test(value.code);
    default:
      return false;
  }
}

function isPlainObject(value) {
  return value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key));
}

function isTransferId(value) {
  return typeof value === "string" && TRANSFER_ID_PATTERN.test(value);
}

function isSafeName(value) {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 255 &&
    !FORBIDDEN_NAME_PATTERN.test(value);
}

function isBoundedText(value, maxLength) {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maxLength &&
    !CONTROL_CHARACTER_PATTERN.test(value);
}

function isFileByteCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_NEARBY_FILE_BYTES;
}

function isCanonicalSha256(value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) return false;
  try {
    const bytes = fromBase64Url(value);
    return bytes.length === 32 && toBase64Url(bytes) === value;
  } catch {
    return false;
  }
}

function isUint32(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_UINT32;
}

function toUint8Array(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}
