import { fromBase64Url, toBase64Url } from '../protocol/base64url.js';
import { crc32Hex } from '../protocol/crc32.js';
import { isTransferId } from '../protocol/transfer-id.js';

const MAGIC = new TextEncoder().encode('CRF2');
export const COLOR_FRAME_HEADER_BYTES = 67;
const FLAG_REPAIR = 1;
const TRANSFER_ID_OFFSET = 5;
const TRANSFER_ID_BYTES = 12;
const SYMBOL_ID_OFFSET = 17;
const SOURCE_COUNT_OFFSET = 21;
const BLOCK_BYTES_OFFSET = 25;
const ORIGINAL_BYTES_OFFSET = 27;
const SHA256_OFFSET = 31;
const SHA256_BYTES = 32;
const CRC32_OFFSET = 63;
const MAX_SOURCE_COUNT = 100_000;
const MAX_BLOCK_BYTES = 4_096;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export class ColorFrameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ColorFrameError';
    this.code = code;
  }
}

function frameError(code = 'INVALID_COLOR_FRAME') {
  return new ColorFrameError(code, 'Renkli aktarım karesi geçersiz.');
}

function toUint8Array(value) {
  if (Object.prototype.toString.call(value) !== '[object Uint8Array]') return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function isValidMetadata({ transferId, sourceCount, blockBytes, originalBytes, sha256 }) {
  if (!isTransferId(transferId)
    || !Number.isSafeInteger(sourceCount) || sourceCount < 1 || sourceCount > MAX_SOURCE_COUNT
    || !Number.isSafeInteger(blockBytes) || blockBytes < 1 || blockBytes > MAX_BLOCK_BYTES
    || !Number.isSafeInteger(originalBytes) || originalBytes < 0 || originalBytes > sourceCount * blockBytes
    || typeof sha256 !== 'string' || sha256.length !== 43) {
    return false;
  }

  try {
    return fromBase64Url(sha256).length === SHA256_BYTES;
  } catch {
    return false;
  }
}

function validateMetadataAndSymbol(metadata, symbol) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
    || !symbol || typeof symbol !== 'object' || Array.isArray(symbol)
    || !isValidMetadata(metadata)
    || symbol.transferId !== metadata.transferId
    || !Number.isSafeInteger(symbol.symbolId) || symbol.symbolId < 0
    || symbol.symbolId >= metadata.sourceCount * 4
    || !toUint8Array(symbol.data) || symbol.data.length !== metadata.blockBytes) {
    throw frameError();
  }
}

export function encodeColorFrameV2(metadata, symbol) {
  validateMetadataAndSymbol(metadata, symbol);
  const output = new Uint8Array(COLOR_FRAME_HEADER_BYTES + metadata.blockBytes);
  const view = new DataView(output.buffer);

  output.set(MAGIC, 0);
  output[4] = symbol.symbolId >= metadata.sourceCount ? FLAG_REPAIR : 0;
  output.set(textEncoder.encode(metadata.transferId), TRANSFER_ID_OFFSET);
  view.setUint32(SYMBOL_ID_OFFSET, symbol.symbolId, false);
  view.setUint32(SOURCE_COUNT_OFFSET, metadata.sourceCount, false);
  view.setUint16(BLOCK_BYTES_OFFSET, metadata.blockBytes, false);
  view.setUint32(ORIGINAL_BYTES_OFFSET, metadata.originalBytes, false);
  output.set(fromBase64Url(metadata.sha256), SHA256_OFFSET);
  view.setUint32(CRC32_OFFSET, Number.parseInt(crc32Hex(symbol.data), 16), false);
  output.set(symbol.data, COLOR_FRAME_HEADER_BYTES);

  return output;
}

export function parseColorFrameV2(frameBytes) {
  const bytes = toUint8Array(frameBytes);
  if (!bytes || bytes.length < COLOR_FRAME_HEADER_BYTES) throw frameError();
  if (!MAGIC.every((value, index) => bytes[index] === value)) throw frameError();

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = bytes[4];
  let transferId;
  try {
    transferId = textDecoder.decode(bytes.subarray(TRANSFER_ID_OFFSET, TRANSFER_ID_OFFSET + TRANSFER_ID_BYTES));
  } catch {
    throw frameError();
  }

  const symbolId = view.getUint32(SYMBOL_ID_OFFSET, false);
  const sourceCount = view.getUint32(SOURCE_COUNT_OFFSET, false);
  const blockBytes = view.getUint16(BLOCK_BYTES_OFFSET, false);
  const originalBytes = view.getUint32(ORIGINAL_BYTES_OFFSET, false);
  const sha256 = toBase64Url(bytes.subarray(SHA256_OFFSET, SHA256_OFFSET + SHA256_BYTES));
  const metadata = { transferId, sourceCount, blockBytes, originalBytes, sha256 };

  if (!isValidMetadata(metadata)
    || symbolId >= sourceCount * 4
    || (flags !== 0 && flags !== FLAG_REPAIR)
    || flags !== (symbolId >= sourceCount ? FLAG_REPAIR : 0)
    || bytes.length !== COLOR_FRAME_HEADER_BYTES + blockBytes) {
    throw frameError();
  }

  const data = bytes.subarray(COLOR_FRAME_HEADER_BYTES);
  const expectedCrc = view.getUint32(CRC32_OFFSET, false);
  const actualCrc = Number.parseInt(crc32Hex(data), 16);
  if (actualCrc !== expectedCrc) throw frameError('FRAME_CRC_MISMATCH');

  return {
    protocolVersion: 'CRF2',
    transferId,
    symbolId,
    sourceCount,
    blockBytes,
    originalBytes,
    sha256,
    data: new Uint8Array(data),
  };
}
