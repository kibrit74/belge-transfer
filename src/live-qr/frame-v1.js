import { fromBase64Url, toBase64Url } from "../protocol/base64url.js";
import { crc32Hex } from "../protocol/crc32.js";
import { LIVE_BLOCK_BYTES, MAX_SYMBOL_ID } from "./fountain.js";
import { MAX_LEGACY_LIVE_QR_PACKAGE_BYTES } from "./limits.js";

export const LIVE_FRAME_VERSION = "QRL1";

const MAX_SOURCE_COUNT = 10_000;
const MAX_ORIGINAL_BYTES = MAX_LEGACY_LIVE_QR_PACKAGE_BYTES;
const MAX_FRAME_TEXT_LENGTH = 2048;
const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const SHA256_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CRC32_PATTERN = /^[0-9a-f]{8}$/;

export function encodeLiveFrame(metadata, symbol) {
  validateMetadata(metadata);
  validateSymbol(metadata, symbol);

  return [
    LIVE_FRAME_VERSION,
    metadata.transferId,
    symbol.symbolId,
    metadata.sourceCount,
    metadata.blockBytes,
    metadata.originalBytes,
    metadata.sha256,
    symbol.data.length,
    crc32Hex(symbol.data),
    toBase64Url(symbol.data),
  ].join("|");
}

export function parseLiveFrame(text) {
  if (
    typeof text !== "string" ||
    !text.startsWith(`${LIVE_FRAME_VERSION}|`) ||
    text.length > MAX_FRAME_TEXT_LENGTH
  ) {
    return null;
  }

  const parts = text.split("|");
  if (parts.length !== 10) return null;

  const [
    , transferId, symbolIdText, sourceCountText, blockBytesText,
    originalBytesText, sha256, dataLengthText, crc32, encoded,
  ] = parts;
  const symbolId = parseInteger(symbolIdText, true);
  const sourceCount = parseInteger(sourceCountText);
  const blockBytes = parseInteger(blockBytesText);
  const originalBytes = parseInteger(originalBytesText, true);
  const dataLength = parseInteger(dataLengthText);

  if (
    !TRANSFER_ID_PATTERN.test(transferId) ||
    !isCanonicalSha256(sha256) ||
    !CRC32_PATTERN.test(crc32) ||
    symbolId === null ||
    symbolId > MAX_SYMBOL_ID ||
    sourceCount === null ||
    sourceCount > MAX_SOURCE_COUNT ||
    blockBytes !== LIVE_BLOCK_BYTES ||
    originalBytes === null ||
    originalBytes > MAX_ORIGINAL_BYTES ||
    sourceCount !== Math.max(1, Math.ceil(originalBytes / blockBytes)) ||
    dataLength === null ||
    dataLength > blockBytes ||
    encoded.length !== base64UrlLength(dataLength)
  ) {
    return null;
  }

  try {
    const data = fromBase64Url(encoded);
    if (data.length !== dataLength || toBase64Url(data) !== encoded || crc32Hex(data) !== crc32) {
      return null;
    }
    return {
      protocolVersion: LIVE_FRAME_VERSION,
      transferId,
      symbolId,
      sourceCount,
      blockBytes,
      originalBytes,
      sha256,
      dataLength,
      crc32,
      data,
    };
  } catch {
    return null;
  }
}

function validateMetadata(metadata) {
  if (
    !metadata ||
    !TRANSFER_ID_PATTERN.test(metadata.transferId ?? "") ||
    !Number.isSafeInteger(metadata.sourceCount) ||
    metadata.sourceCount < 1 ||
    metadata.sourceCount > MAX_SOURCE_COUNT ||
    metadata.blockBytes !== LIVE_BLOCK_BYTES ||
    !Number.isSafeInteger(metadata.originalBytes) ||
    metadata.originalBytes < 0 ||
    metadata.originalBytes > MAX_ORIGINAL_BYTES ||
    metadata.sourceCount !== Math.max(1, Math.ceil(metadata.originalBytes / metadata.blockBytes)) ||
    !isCanonicalSha256(metadata.sha256)
  ) {
    throw new RangeError("Canlı QR çerçeve üst bilgisi geçersiz.");
  }
}

function validateSymbol(metadata, symbol) {
  if (
    !symbol ||
    !Number.isSafeInteger(symbol.symbolId) ||
    symbol.symbolId < 0 ||
    symbol.symbolId > MAX_SYMBOL_ID ||
    !(symbol.data instanceof Uint8Array) ||
    symbol.data.length < 1 ||
    symbol.data.length > metadata.blockBytes
  ) {
    throw new RangeError("Canlı QR sembolü geçersiz.");
  }
}

function parseInteger(value, allowZero = false) {
  if (!/^(?:0|[1-9]\d*)$/.test(value ?? "")) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (!allowZero && number === 0)) return null;
  return number;
}

function base64UrlLength(byteLength) {
  const remainder = byteLength % 3;
  return Math.floor(byteLength / 3) * 4 + (remainder === 0 ? 0 : remainder + 1);
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
