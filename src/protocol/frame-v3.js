import { fromBase64Url, toBase64Url } from "./base64url.js";
import { crc32Hex } from "./crc32.js";
import { sha256Base64Url } from "./hash.js";

export const PROTOCOL_VERSION = "QRT3";
export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_FRAME_COUNT = 150_000;
export const DEFAULT_CHUNK_BYTES = 450;

const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const CRC32_PATTERN = /^[0-9a-f]{8}$/;
const MAX_FRAME_TEXT_LENGTH = 69_905_117;

export async function encodeFramesV3(input) {
  const { bytes, chunkBytes = DEFAULT_CHUNK_BYTES, transferId } = input ?? {};
  validateInput(bytes, chunkBytes, transferId);

  const total = Math.max(1, Math.ceil(bytes.length / chunkBytes));
  if (total > MAX_FRAME_COUNT) {
    throw new RangeError("Kare sayısı güvenli sınırı aşıyor.");
  }

  const safeTransferId = transferId ?? createTransferId();
  const frames = [];
  for (let index = 0; index < total; index += 1) {
    const chunk = bytes.slice(index * chunkBytes, (index + 1) * chunkBytes);
    frames.push(
      [
        PROTOCOL_VERSION,
        safeTransferId,
        index,
        total,
        chunk.length,
        crc32Hex(chunk),
        toBase64Url(chunk),
      ].join("|"),
    );
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    transferId: safeTransferId,
    total,
    sha256: await sha256Base64Url(bytes),
    frames,
  };
}

export function parseFrameV3(text) {
  if (typeof text !== "string" || !text.startsWith(`${PROTOCOL_VERSION}|`)) {
    return null;
  }
  if (text.length > MAX_FRAME_TEXT_LENGTH) return null;

  const parts = text.split("|");
  if (parts.length !== 7) return null;

  const [, transferId, indexText, totalText, payloadSizeText, chunkCrc32, dataBase64Url] = parts;
  if (!TRANSFER_ID_PATTERN.test(transferId) || !CRC32_PATTERN.test(chunkCrc32)) return null;

  const index = parseNonNegativeSafeInteger(indexText);
  const total = parsePositiveSafeInteger(totalText);
  const payloadSize = parseNonNegativeSafeInteger(payloadSizeText);
  if (
    index === null ||
    total === null ||
    payloadSize === null ||
    index >= total ||
    total > MAX_FRAME_COUNT ||
    payloadSize > MAX_INPUT_BYTES
  ) {
    return null;
  }
  if (!isBase64UrlLengthWithinPayloadLimit(payloadSize, dataBase64Url.length)) return null;

  try {
    const data = fromBase64Url(dataBase64Url);
    if (data.length !== payloadSize || crc32Hex(data) !== chunkCrc32) return null;

    return {
      protocolVersion: PROTOCOL_VERSION,
      transferId,
      index,
      total,
      payloadSize,
      chunkCrc32,
      data,
    };
  } catch {
    return null;
  }
}

export function isBase64UrlLengthWithinPayloadLimit(payloadSize, encodedLength) {
  if (
    !Number.isSafeInteger(payloadSize) ||
    payloadSize < 0 ||
    !Number.isSafeInteger(encodedLength) ||
    encodedLength < 0
  ) {
    return false;
  }

  return encodedLength <= base64UrlLengthForBytes(payloadSize);
}

function validateInput(bytes, chunkBytes, transferId) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Veri Uint8Array olmalı.");
  }
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new RangeError("Girdi boyutu 50 MiB sınırını aşıyor.");
  }
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new RangeError("Parça boyutu pozitif güvenli tam sayı olmalı.");
  }
  if (transferId !== undefined && !TRANSFER_ID_PATTERN.test(transferId)) {
    throw new TypeError("Aktarım kimliği 12 alfanümerik karakter olmalı.");
  }
}

function parseNonNegativeSafeInteger(value) {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function parsePositiveSafeInteger(value) {
  const number = parseNonNegativeSafeInteger(value);
  return number === null || number === 0 ? null : number;
}

function base64UrlLengthForBytes(byteLength) {
  const remainingBytes = byteLength % 3;
  return Math.floor(byteLength / 3) * 4 + (remainingBytes === 0 ? 0 : remainingBytes + 1);
}

function createTransferId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const transferId = [];
  const randomBytes = new Uint8Array(24);

  while (transferId.length < 12) {
    globalThis.crypto.getRandomValues(randomBytes);
    for (const value of randomBytes) {
      if (value < 248) transferId.push(alphabet[value % alphabet.length]);
      if (transferId.length === 12) break;
    }
  }

  return transferId.join("");
}
