import { fromBase64Url, toBase64Url } from "../protocol/base64url.js";
import { crc32Hex } from "../protocol/crc32.js";

export const OPTICAL_PROTOCOL_VERSION = "QRF1";
export const MAX_OPTICAL_BLOCK_BYTES = 4096;
export const MAX_OPTICAL_SOURCE_COUNT = 100_000;
const MAX_INPUT_BYTES = 50 * 1024 * 1024;

const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const SHA256_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CRC32_PATTERN = /^[0-9a-f]{8}$/;
const MAX_FRAME_TEXT_LENGTH = 8_192;

export function encodeFrameV4(metadata, symbol) {
  validateMetadata(metadata);
  if (
    !symbol ||
    !Number.isSafeInteger(symbol.symbolId) ||
    symbol.symbolId < 0 ||
    symbol.symbolId >= metadata.sourceCount * 4 ||
    !(symbol.data instanceof Uint8Array) ||
    symbol.data.length === 0 ||
    symbol.data.length > metadata.blockBytes
  ) {
    throw new RangeError("Optik sembol güvenli sınırlar içinde olmalı.");
  }

  return [
    OPTICAL_PROTOCOL_VERSION,
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

export function parseFrameV4(text) {
  if (
    typeof text !== "string" ||
    !text.startsWith(`${OPTICAL_PROTOCOL_VERSION}|`) ||
    text.length > MAX_FRAME_TEXT_LENGTH
  ) {
    return null;
  }

  const parts = text.split("|");
  if (parts.length !== 10) return null;
  const [
    , transferId, symbolIdText, sourceCountText, blockBytesText,
    originalBytesText, sha256, payloadBytesText, chunkCrc32, encoded,
  ] = parts;
  const symbolId = parseInteger(symbolIdText, true);
  const sourceCount = parseInteger(sourceCountText);
  const blockBytes = parseInteger(blockBytesText);
  const originalBytes = parseInteger(originalBytesText, true);
  const payloadBytes = parseInteger(payloadBytesText);

  if (
    !TRANSFER_ID_PATTERN.test(transferId) ||
    !SHA256_PATTERN.test(sha256) ||
    !CRC32_PATTERN.test(chunkCrc32) ||
    symbolId === null ||
    sourceCount === null ||
    sourceCount > MAX_OPTICAL_SOURCE_COUNT ||
    symbolId >= sourceCount * 4 ||
    blockBytes === null ||
    blockBytes > MAX_OPTICAL_BLOCK_BYTES ||
    originalBytes === null ||
    originalBytes > MAX_INPUT_BYTES ||
    payloadBytes === null ||
    payloadBytes > blockBytes ||
    encoded.length > base64UrlLength(blockBytes)
  ) {
    return null;
  }

  try {
    const data = fromBase64Url(encoded);
    if (data.length !== payloadBytes || crc32Hex(data) !== chunkCrc32) return null;
    return {
      protocolVersion: OPTICAL_PROTOCOL_VERSION,
      transferId,
      symbolId,
      sourceCount,
      blockBytes,
      originalBytes,
      sha256,
      payloadBytes,
      chunkCrc32,
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
    metadata.sourceCount <= 0 ||
    metadata.sourceCount > MAX_OPTICAL_SOURCE_COUNT ||
    !Number.isSafeInteger(metadata.blockBytes) ||
    metadata.blockBytes <= 0 ||
    metadata.blockBytes > MAX_OPTICAL_BLOCK_BYTES ||
    !Number.isSafeInteger(metadata.originalBytes) ||
    metadata.originalBytes < 0 ||
    metadata.originalBytes > MAX_INPUT_BYTES ||
    !SHA256_PATTERN.test(metadata.sha256 ?? "")
  ) {
    throw new RangeError("Optik çerçeve üst bilgisi geçersiz.");
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
