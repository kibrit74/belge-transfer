import { COLOR_PALETTE, bytesToColorIndices, colorIndicesToBytes } from "./color-matrix.js";

export const COLOR_PROTOCOL_VERSION = "CRF1";

/**
 * Renkli QR Kare Paketleyici (Color Frame Header)
 * CRF1:[transferId]:[symbolId]:[totalSymbols]:[dataHex]
 */
export function encodeColorFrameV1(metadata, symbol) {
  const transferId = metadata.transferId;
  const symbolId = symbol.symbolId;
  const totalSymbols = metadata.emittedSymbols || metadata.sourceCount;

  // Header metin formatında ilk kısma eklenir, ardından ham veri hex/color olarak yerleşir
  return `${COLOR_PROTOCOL_VERSION}:${transferId}:${symbolId}:${totalSymbols}:${bytesToHex(symbol.data)}`;
}

export function parseColorFrameV1(frameText) {
  if (typeof frameText !== "string" || !frameText.startsWith(`${COLOR_PROTOCOL_VERSION}:`)) {
    return null;
  }

  const parts = frameText.split(":");
  if (parts.length < 5) return null;

  const [, transferId, symbolIdStr, totalSymbolsStr, hexData] = parts;
  const symbolId = parseInt(symbolIdStr, 10);
  const totalSymbols = parseInt(totalSymbolsStr, 10);
  const data = hexToBytes(hexData);

  if (isNaN(symbolId) || isNaN(totalSymbols) || !data) return null;

  return {
    protocolVersion: COLOR_PROTOCOL_VERSION,
    transferId,
    symbolId,
    totalSymbols,
    data,
  };
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
