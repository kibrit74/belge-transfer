import { sha256Base64Url } from "../protocol/hash.js";

const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const MAX_SOURCE_COUNT = 100_000;

export async function createFountainEncoder(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Veri Uint8Array olmalı.");

  const transferId = options.transferId;
  const blockBytes = options.blockBytes ?? 1400;
  const emissionRatio = options.emissionRatio ?? 1.5;
  validateMetadata({ transferId, blockBytes, originalBytes: bytes.length });
  if (!Number.isFinite(emissionRatio) || emissionRatio < 1 || emissionRatio > 4) {
    throw new RangeError("Aktarım ek yükü 1 ile 4 arasında olmalı.");
  }

  const sourceCount = Math.max(1, Math.ceil(bytes.length / blockBytes));
  if (sourceCount > MAX_SOURCE_COUNT) throw new RangeError("Kaynak sembol sayısı sınırı aşıyor.");

  const blocks = Array.from({ length: sourceCount }, (_, index) => {
    const block = new Uint8Array(blockBytes);
    block.set(bytes.subarray(index * blockBytes, (index + 1) * blockBytes));
    return block;
  });
  const emittedSymbols = Math.ceil(sourceCount * emissionRatio);
  const metadata = Object.freeze({
    transferId,
    sourceCount,
    blockBytes,
    originalBytes: bytes.length,
    emittedSymbols,
    sha256: await sha256Base64Url(bytes),
  });

  function symbol(symbolId) {
    validateSymbolId(symbolId, sourceCount);
    if (symbolId < sourceCount) {
      return { transferId, symbolId, data: new Uint8Array(blocks[symbolId]) };
    }

    const data = new Uint8Array(blockBytes);
    for (const index of repairIndices(metadata, symbolId)) xorInto(data, blocks[index]);
    return { transferId, symbolId, data };
  }

  return {
    metadata,
    symbol,
    symbols: () => Array.from({ length: emittedSymbols }, (_, symbolId) => symbol(symbolId)),
  };
}

export function createFountainDecoder(metadata) {
  validateMetadata(metadata);
  const normalizedMetadata = Object.freeze({ ...metadata });
  const received = new Map();
  let duplicates = 0;
  let decoded = null;

  function accept(symbol) {
    if (!symbol || typeof symbol !== "object") {
      return { accepted: false, reason: "invalid-symbol" };
    }
    if (symbol.transferId !== undefined && symbol.transferId !== metadata.transferId) {
      return { accepted: false, reason: "different-transfer" };
    }
    if (
      !Number.isSafeInteger(symbol.symbolId) ||
      symbol.symbolId < 0 ||
      symbol.symbolId >= metadata.sourceCount * 4 ||
      !(symbol.data instanceof Uint8Array) ||
      symbol.data.length !== metadata.blockBytes
    ) {
      return { accepted: false, reason: "invalid-symbol" };
    }
    if (received.has(symbol.symbolId)) {
      duplicates += 1;
      return { accepted: false, reason: "duplicate" };
    }

    received.set(symbol.symbolId, new Uint8Array(symbol.data));
    decoded = null;
    return { accepted: true };
  }

  function solve() {
    if (decoded) return true;
    const known = new Map();
    for (const [symbolId, data] of received) {
      if (symbolId < metadata.sourceCount) known.set(symbolId, data);
    }

    const missing = [];
    for (let index = 0; index < metadata.sourceCount; index += 1) {
      if (!known.has(index)) missing.push(index);
    }
    if (missing.length === 0) return finish(known);

    const missingSet = new Set(missing);
    const pivots = new Map();
    for (const [symbolId, receivedData] of received) {
      if (symbolId < metadata.sourceCount) continue;
      const data = new Uint8Array(receivedData);
      const variables = new Set();
      for (const index of repairIndices(metadata, symbolId)) {
        const knownData = known.get(index);
        if (knownData) xorInto(data, knownData);
        else if (missingSet.has(index)) variables.add(index);
      }
      reduceIntoPivots({ variables, data }, pivots);
    }

    if (missing.some((index) => !pivots.has(index))) return false;
    const solutions = new Map();
    for (const pivot of [...missing].sort((a, b) => b - a)) {
      const row = pivots.get(pivot);
      const value = new Uint8Array(row.data);
      for (const index of row.variables) {
        if (index === pivot) continue;
        const solved = solutions.get(index);
        if (!solved) return false;
        xorInto(value, solved);
      }
      solutions.set(pivot, value);
      known.set(pivot, value);
    }
    return finish(known);
  }

  function finish(known) {
    const padded = new Uint8Array(metadata.sourceCount * metadata.blockBytes);
    for (let index = 0; index < metadata.sourceCount; index += 1) {
      const block = known.get(index);
      if (!block) return false;
      padded.set(block, index * metadata.blockBytes);
    }
    decoded = padded.slice(0, metadata.originalBytes);
    return true;
  }

  return {
    accept,
    isComplete: solve,
    bytes() {
      return solve() ? new Uint8Array(decoded) : null;
    },
    progress() {
      let systematic = 0;
      for (const symbolId of received.keys()) if (symbolId < metadata.sourceCount) systematic += 1;
      return {
        solved: decoded ? metadata.sourceCount : systematic,
        sourceCount: metadata.sourceCount,
        accepted: received.size,
        duplicates,
      };
    },
    metadata: normalizedMetadata,
  };
}

export function repairIndices(metadata, symbolId) {
  const { sourceCount, transferId } = metadata;
  if (symbolId < sourceCount) return [symbolId];
  const repairIndex = symbolId - sourceCount;
  const random = createRandom(seedFor(transferId, symbolId));
  const degree = Math.min(sourceCount, chooseDegree(random()));
  const indices = new Set([(repairIndex * Math.max(1, sourceCount - 1)) % sourceCount]);
  while (indices.size < degree) indices.add(Math.floor(random() * sourceCount));
  return [...indices].sort((a, b) => a - b);
}

function reduceIntoPivots(row, pivots) {
  while (row.variables.size > 0) {
    const pivot = Math.min(...row.variables);
    const existing = pivots.get(pivot);
    if (!existing) {
      pivots.set(pivot, row);
      return;
    }
    for (const index of existing.variables) {
      if (row.variables.has(index)) row.variables.delete(index);
      else row.variables.add(index);
    }
    xorInto(row.data, existing.data);
  }
}

function chooseDegree(value) {
  if (value < 0.05) return 1;
  if (value < 0.10) return 2;
  if (value < 0.20) return 4;
  if (value < 0.35) return 8;
  if (value < 0.55) return 16;
  if (value < 0.80) return 24;
  return 32;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function seedFor(transferId, symbolId) {
  let seed = (symbolId ^ 0x9e3779b9) >>> 0;
  for (const byte of new TextEncoder().encode(transferId)) {
    seed = Math.imul(seed ^ byte, 16777619) >>> 0;
  }
  return seed || 1;
}

function xorInto(target, source) {
  for (let index = 0; index < target.length; index += 1) target[index] ^= source[index];
}

function validateMetadata(metadata) {
  if (!metadata || !TRANSFER_ID_PATTERN.test(metadata.transferId ?? "")) {
    throw new TypeError("Aktarım kimliği 12 alfanümerik karakter olmalı.");
  }
  if (!Number.isSafeInteger(metadata.blockBytes) || metadata.blockBytes <= 0 || metadata.blockBytes > 4096) {
    throw new RangeError("Blok boyutu güvenli sınırlar içinde olmalı.");
  }
  if (!Number.isSafeInteger(metadata.originalBytes) || metadata.originalBytes < 0) {
    throw new RangeError("Özgün veri boyutu geçersiz.");
  }
  if (metadata.sourceCount !== undefined && (
    !Number.isSafeInteger(metadata.sourceCount) ||
    metadata.sourceCount <= 0 ||
    metadata.sourceCount > MAX_SOURCE_COUNT
  )) {
    throw new RangeError("Kaynak sembol sayısı geçersiz.");
  }
}

function validateSymbolId(symbolId, sourceCount) {
  if (!Number.isSafeInteger(symbolId) || symbolId < 0 || symbolId >= sourceCount * 4) {
    throw new RangeError("Sembol kimliği güvenli sınırı aşıyor.");
  }
}
