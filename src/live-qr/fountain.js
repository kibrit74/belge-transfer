import { sha256Base64Url } from "../protocol/hash.js";
import { fromBase64Url, toBase64Url } from "../protocol/base64url.js";
import { MAX_LEGACY_LIVE_QR_PACKAGE_BYTES } from "./limits.js";

// 1.000 baytlık blok QRL1'i 141 modülde tutar ve dört QR düzenini okunabilir kılar.
export const LIVE_BLOCK_BYTES = 1000;
export const MAX_SYMBOL_ID = 0xffffffff;

const MAX_SOURCE_COUNT = Math.ceil(MAX_LEGACY_LIVE_QR_PACKAGE_BYTES / LIVE_BLOCK_BYTES);
const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const SHA256_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REPAIR_DEGREE = 32;
const MAX_INACTIVATION_SYMBOLS = 256;

export async function createLiveFountainEncoder(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Veri Uint8Array olmalı.");

  const transferId = options.transferId;
  if (options.blockBytes !== undefined && options.blockBytes !== LIVE_BLOCK_BYTES) {
    throw new RangeError("Canlı QR blok boyutu 1000 byte olmalı.");
  }
  if (!TRANSFER_ID_PATTERN.test(transferId ?? "")) {
    throw new RangeError("Aktarım kimliği 12 alfanümerik karakter olmalı.");
  }
  if (bytes.length > MAX_LEGACY_LIVE_QR_PACKAGE_BYTES) {
    throw new RangeError("Canlı QR paketi boyut sınırını aşıyor.");
  }

  const sourceCount = Math.max(1, Math.ceil(bytes.length / LIVE_BLOCK_BYTES));
  const metadata = Object.freeze({
    transferId,
    sourceCount,
    blockBytes: LIVE_BLOCK_BYTES,
    originalBytes: bytes.length,
    sha256: await sha256Base64Url(bytes),
  });
  validateMetadata(metadata);

  const blocks = Array.from({ length: sourceCount }, (_, index) => {
    const block = new Uint8Array(LIVE_BLOCK_BYTES);
    block.set(bytes.subarray(index * LIVE_BLOCK_BYTES, (index + 1) * LIVE_BLOCK_BYTES));
    return block;
  });
  const degreeDistribution = createRepairDegreeDistribution(sourceCount);

  function symbol(symbolId) {
    validateSymbolId(symbolId);
    if (symbolId < sourceCount) {
      return { transferId, symbolId, data: new Uint8Array(blocks[symbolId]) };
    }

    const data = new Uint8Array(LIVE_BLOCK_BYTES);
    for (const index of repairIndices(metadata, symbolId, degreeDistribution)) {
      xorBytes(data, blocks[index]);
    }
    return { transferId, symbolId, data };
  }

  return {
    metadata,
    symbol,
    symbols(count = Math.ceil(sourceCount * 3)) {
      if (!Number.isSafeInteger(count) || count < 0 || count > Math.ceil(sourceCount * 3)) {
        throw new RangeError("Sembol sayısı güvenli sınırlar içinde olmalı.");
      }
      return Array.from({ length: count }, (_, symbolId) => symbol(symbolId));
    },
  };
}

export function createLiveFountainDecoder(metadata) {
  validateMetadata(metadata);

  const snapshot = Object.freeze({ ...metadata });
  const symbolLimit = Math.ceil(snapshot.sourceCount * 3);
  const degreeDistribution = createRepairDegreeDistribution(snapshot.sourceCount);
  const acceptedIds = new Set();
  const known = new Map();
  const equations = new Map();
  const waitingBySource = new Map();
  const resolveQueue = [];
  let duplicates = 0;

  function accept(symbol) {
    if (
      !symbol ||
      typeof symbol !== "object" ||
      !isValidSymbolId(symbol.symbolId) ||
      !(symbol.data instanceof Uint8Array) ||
      symbol.data.length !== snapshot.blockBytes
    ) {
      return { accepted: false, reason: "invalid-symbol" };
    }
    if (symbol.transferId !== snapshot.transferId) {
      return { accepted: false, reason: "different-transfer" };
    }
    if (acceptedIds.has(symbol.symbolId)) {
      duplicates += 1;
      return { accepted: false, reason: "duplicate" };
    }
    if (acceptedIds.size >= symbolLimit) {
      return { accepted: false, reason: "symbol-limit" };
    }

    acceptedIds.add(symbol.symbolId);
    if (symbol.symbolId < snapshot.sourceCount) {
      enqueueKnown(symbol.symbolId, new Uint8Array(symbol.data));
    } else {
      addRepairEquation(symbol);
    }
    drainResolveQueue();
    return { accepted: true };
  }

  function addRepairEquation(symbol) {
    const bytes = new Uint8Array(symbol.data);
    const indices = new Set(repairIndices(snapshot, symbol.symbolId, degreeDistribution));
    for (const sourceIndex of [...indices]) {
      const knownBytes = known.get(sourceIndex);
      if (!knownBytes) continue;
      indices.delete(sourceIndex);
      xorBytes(bytes, knownBytes);
    }

    if (indices.size === 0) return;
    const equation = { bytes, indices };
    equations.set(symbol.symbolId, equation);
    for (const sourceIndex of indices) addWaitingEquation(sourceIndex, symbol.symbolId);
    if (indices.size === 1) enqueueEquationSolution(symbol.symbolId, equation);
  }

  function enqueueKnown(sourceIndex, bytes) {
    if (!known.has(sourceIndex)) resolveQueue.push({ sourceIndex, bytes });
  }

  function enqueueEquationSolution(equationId, equation) {
    const [sourceIndex] = equation.indices;
    removeEquation(equationId, equation);
    enqueueKnown(sourceIndex, equation.bytes);
  }

  function drainResolveQueue() {
    while (resolveQueue.length > 0) {
      const { sourceIndex, bytes } = resolveQueue.shift();
      if (known.has(sourceIndex)) continue;
      known.set(sourceIndex, bytes);

      const waiting = [...(waitingBySource.get(sourceIndex) ?? [])];
      waitingBySource.delete(sourceIndex);
      for (const equationId of waiting) {
        const equation = equations.get(equationId);
        if (!equation || !equation.indices.delete(sourceIndex)) continue;
        xorBytes(equation.bytes, bytes);
        if (equation.indices.size === 0) {
          removeEquation(equationId, equation);
        } else if (equation.indices.size === 1) {
          enqueueEquationSolution(equationId, equation);
        }
      }
    }
  }

  function addWaitingEquation(sourceIndex, equationId) {
    const waiting = waitingBySource.get(sourceIndex) ?? new Set();
    waiting.add(equationId);
    waitingBySource.set(sourceIndex, waiting);
  }

  function removeEquation(equationId, equation) {
    if (!equations.delete(equationId)) return;
    for (const sourceIndex of equation.indices) {
      const waiting = waitingBySource.get(sourceIndex);
      if (!waiting) continue;
      waiting.delete(equationId);
      if (waiting.size === 0) waitingBySource.delete(sourceIndex);
    }
  }

  return {
    accept,
    isComplete() {
      if (known.size === snapshot.sourceCount) return true;
      return completeSmallResidual();
    },
    bytes() {
      if (!completeSmallResidual()) return null;
      const padded = new Uint8Array(snapshot.sourceCount * snapshot.blockBytes);
      for (let sourceIndex = 0; sourceIndex < snapshot.sourceCount; sourceIndex += 1) {
        const bytes = known.get(sourceIndex);
        if (!bytes) return null;
        padded.set(bytes, sourceIndex * snapshot.blockBytes);
      }
      return padded.slice(0, snapshot.originalBytes);
    },
    progress() {
      return {
        solved: known.size,
        sourceCount: snapshot.sourceCount,
        accepted: acceptedIds.size,
        duplicates,
      };
    },
    metadata: snapshot,
  };

  function completeSmallResidual() {
    const missing = [];
    for (let sourceIndex = 0; sourceIndex < snapshot.sourceCount; sourceIndex += 1) {
      if (!known.has(sourceIndex)) missing.push(sourceIndex);
    }
    if (missing.length === 0) return true;
    if (missing.length > MAX_INACTIVATION_SYMBOLS) return false;

    const missingIndexes = new Map(missing.map((sourceIndex, index) => [sourceIndex, index]));
    const selected = selectIndependentEquations(equations, missingIndexes, missing.length);
    if (selected.length !== missing.length) return false;

    const inverse = invertBinaryMatrix(selected, missing.length);
    if (!inverse) return false;
    for (let index = 0; index < missing.length; index += 1) {
      known.set(missing[index], combineEquationBytes(inverse[index], selected, snapshot.blockBytes));
    }
    return true;
  }
}

function createRepairDegreeDistribution(sourceCount) {
  return [{ degree: Math.min(sourceCount, REPAIR_DEGREE), threshold: 1 }];
}

function repairIndices(metadata, symbolId, degreeDistribution) {
  const random = createRandom(seedFor(metadata.transferId, symbolId));
  const degree = chooseDegree(random(), degreeDistribution);
  const indices = new Set();
  while (indices.size < degree) indices.add(Math.floor(random() * metadata.sourceCount));
  return indices;
}

function chooseDegree(value, distribution) {
  return distribution.find(({ threshold }) => value < threshold)?.degree ?? distribution.at(-1).degree;
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

function xorBytes(target, source) {
  for (let index = 0; index < target.length; index += 1) target[index] ^= source[index];
}

function selectIndependentEquations(equations, missingIndexes, missingCount) {
  const wordCount = Math.ceil(missingCount / 32);
  const pivots = Array(missingCount).fill(null);
  const selected = [];

  for (const equation of equations.values()) {
    const variables = new Uint32Array(wordCount);
    for (const sourceIndex of equation.indices) {
      const index = missingIndexes.get(sourceIndex);
      if (index !== undefined) setVariable(variables, index);
    }
    if (firstVariable(variables) === -1) continue;

    const originalVariables = new Uint32Array(variables);
    if (!reduceVariables(variables, pivots)) continue;
    selected.push({ bytes: equation.bytes, variables: originalVariables });
    if (selected.length === missingCount) return selected;
  }
  return selected;
}

function reduceVariables(variables, pivots) {
  while (true) {
    const pivot = firstVariable(variables);
    if (pivot === -1) return false;
    if (!pivots[pivot]) {
      pivots[pivot] = variables;
      return true;
    }
    xorVariables(variables, pivots[pivot]);
  }
}

function invertBinaryMatrix(selected, size) {
  const coefficientWords = Math.ceil(size / 32);
  const rows = selected.map(({ variables }, rowIndex) => {
    const row = new Uint32Array(coefficientWords * 2);
    row.set(variables);
    setVariable(row.subarray(coefficientWords), rowIndex);
    return row;
  });

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    while (pivotRow < size && !hasVariable(rows[pivotRow], pivot)) pivotRow += 1;
    if (pivotRow === size) return null;
    if (pivotRow !== pivot) [rows[pivot], rows[pivotRow]] = [rows[pivotRow], rows[pivot]];
    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      if (rowIndex !== pivot && hasVariable(rows[rowIndex], pivot)) {
        xorVariables(rows[rowIndex], rows[pivot]);
      }
    }
  }
  return rows.map((row) => row.subarray(coefficientWords));
}

function combineEquationBytes(coefficients, selected, blockBytes) {
  const bytes = new Uint8Array(blockBytes);
  for (let wordIndex = 0; wordIndex < coefficients.length; wordIndex += 1) {
    let bits = coefficients[wordIndex];
    while (bits !== 0) {
      const lowBit = bits & -bits;
      const equationIndex = (wordIndex * 32) + (31 - Math.clz32(lowBit));
      if (equationIndex < selected.length) xorBytes(bytes, selected[equationIndex].bytes);
      bits ^= lowBit;
    }
  }
  return bytes;
}

function setVariable(variables, index) {
  variables[Math.floor(index / 32)] |= 1 << (index % 32);
}

function hasVariable(variables, index) {
  return (variables[Math.floor(index / 32)] & (1 << (index % 32))) !== 0;
}

function firstVariable(variables) {
  for (let wordIndex = 0; wordIndex < variables.length; wordIndex += 1) {
    const word = variables[wordIndex];
    if (word !== 0) return (wordIndex * 32) + (31 - Math.clz32(word & -word));
  }
  return -1;
}

function xorVariables(target, source) {
  for (let index = 0; index < target.length; index += 1) target[index] ^= source[index];
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
    metadata.originalBytes > MAX_LEGACY_LIVE_QR_PACKAGE_BYTES ||
    metadata.sourceCount !== Math.max(1, Math.ceil(metadata.originalBytes / metadata.blockBytes)) ||
    !isCanonicalSha256(metadata.sha256)
  ) {
    throw new RangeError("Canlı QR fountain üst bilgisi geçersiz.");
  }
}

function validateSymbolId(symbolId) {
  if (!isValidSymbolId(symbolId)) {
    throw new RangeError("Sembol kimliği 32 bit işaretsiz tamsayı olmalı.");
  }
}

function isValidSymbolId(symbolId) {
  return Number.isSafeInteger(symbolId) && symbolId >= 0 && symbolId <= MAX_SYMBOL_ID;
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
