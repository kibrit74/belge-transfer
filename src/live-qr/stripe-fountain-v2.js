import { sha256Base64Url } from "../protocol/hash.js";
import { MAX_LIVE_QR_PACKAGE_BYTES } from "./limits.js";

export const LIVE_V2_BLOCK_BYTES = 1465;
export const STRIPE_DATA_COUNT = 32;
export const MAX_PARITY_ROWS = 32;
export const MAX_V2_SYMBOL_ID = 0xffffffff;

const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const SHA256_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_SOURCE_COUNT = Math.ceil(MAX_LIVE_QR_PACKAGE_BYTES / LIVE_V2_BLOCK_BYTES);
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
const GF_MUL = new Uint8Array(256 * 256);

initializeGaloisField();

export async function createStripeFountainEncoder(bytes, { transferId } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Veri Uint8Array olmalı.");
  if (bytes.length > MAX_LIVE_QR_PACKAGE_BYTES) {
    throw new RangeError("Canlı QR paketi boyut sınırını aşıyor.");
  }
  if (!TRANSFER_ID_PATTERN.test(transferId ?? "")) {
    throw new RangeError("Aktarım kimliği 12 alfanümerik karakter olmalı.");
  }

  const sourceCount = Math.max(1, Math.ceil(bytes.length / LIVE_V2_BLOCK_BYTES));
  const metadata = Object.freeze({
    transferId,
    sourceCount,
    blockBytes: LIVE_V2_BLOCK_BYTES,
    stripeDataCount: STRIPE_DATA_COUNT,
    originalBytes: bytes.length,
    sha256: await sha256Base64Url(bytes),
  });
  validateMetadata(metadata);

  const blocks = Array.from({ length: sourceCount }, (_, index) => {
    const block = new Uint8Array(LIVE_V2_BLOCK_BYTES);
    block.set(bytes.subarray(index * LIVE_V2_BLOCK_BYTES, (index + 1) * LIVE_V2_BLOCK_BYTES));
    return block;
  });
  const stripeCount = Math.ceil(sourceCount / STRIPE_DATA_COUNT);
  const symbolLimit = sourceCount + (stripeCount * MAX_PARITY_ROWS);

  function symbol(symbolId) {
    validateSymbolId(symbolId, symbolLimit);
    if (symbolId < sourceCount) {
      return { transferId, symbolId, data: new Uint8Array(blocks[symbolId]) };
    }

    const { stripeIndex, parityRow } = repairLocation(sourceCount, symbolId);
    const firstSourceIndex = stripeIndex * STRIPE_DATA_COUNT;
    const dataCount = Math.min(STRIPE_DATA_COUNT, sourceCount - firstSourceIndex);
    const data = new Uint8Array(LIVE_V2_BLOCK_BYTES);
    for (let dataIndex = 0; dataIndex < dataCount; dataIndex += 1) {
      xorScaled(data, blocks[firstSourceIndex + dataIndex], coefficient(parityRow, dataIndex));
    }
    return { transferId, symbolId, data };
  }

  return { metadata, symbol };
}

export function createStripeFountainDecoder(metadata) {
  validateMetadata(metadata);
  const snapshot = Object.freeze({ ...metadata });
  const stripeCount = Math.ceil(snapshot.sourceCount / STRIPE_DATA_COUNT);
  const symbolLimit = snapshot.sourceCount + (stripeCount * MAX_PARITY_ROWS);
  const acceptedIds = new Set();
  const known = new Array(snapshot.sourceCount);
  const stripes = Array.from({ length: stripeCount }, (_, stripeIndex) => {
    const firstSourceIndex = stripeIndex * STRIPE_DATA_COUNT;
    return {
      firstSourceIndex,
      dataCount: Math.min(STRIPE_DATA_COUNT, snapshot.sourceCount - firstSourceIndex),
      knownCount: 0,
      parity: new Map(),
      recovered: false,
    };
  });
  let solved = 0;
  let duplicates = 0;

  function accept(symbol) {
    if (!isValidSymbol(symbol, snapshot, symbolLimit)) {
      return { accepted: false, reason: "invalid-symbol" };
    }
    if (symbol.transferId !== snapshot.transferId) {
      return { accepted: false, reason: "different-transfer" };
    }
    if (acceptedIds.has(symbol.symbolId)) {
      duplicates += 1;
      return { accepted: false, reason: "duplicate" };
    }
    acceptedIds.add(symbol.symbolId);

    if (symbol.symbolId < snapshot.sourceCount) {
      storeKnown(symbol.symbolId, symbol.data);
    } else {
      const location = repairLocation(snapshot.sourceCount, symbol.symbolId);
      stripes[location.stripeIndex].parity.set(location.parityRow, new Uint8Array(symbol.data));
    }
    tryRecoverStripe(stripes[symbol.symbolId < snapshot.sourceCount
      ? Math.floor(symbol.symbolId / STRIPE_DATA_COUNT)
      : repairLocation(snapshot.sourceCount, symbol.symbolId).stripeIndex]);
    return { accepted: true };
  }

  function storeKnown(sourceIndex, bytes) {
    if (known[sourceIndex]) return;
    known[sourceIndex] = new Uint8Array(bytes);
    solved += 1;
    stripes[Math.floor(sourceIndex / STRIPE_DATA_COUNT)].knownCount += 1;
  }

  function tryRecoverStripe(stripe) {
    if (stripe.recovered || stripe.knownCount === stripe.dataCount) {
      stripe.recovered = true;
      stripe.parity.clear();
      return;
    }
    const missingLocalIndexes = [];
    for (let localIndex = 0; localIndex < stripe.dataCount; localIndex += 1) {
      if (!known[stripe.firstSourceIndex + localIndex]) missingLocalIndexes.push(localIndex);
    }
    if (stripe.parity.size < missingLocalIndexes.length) return;

    const parityRows = selectIndependentParityRows(
      stripe.parity.keys(),
      missingLocalIndexes,
    );
    if (!parityRows) return;
    const matrix = parityRows.map((parityRow) => (
      missingLocalIndexes.map((localIndex) => coefficient(parityRow, localIndex))
    ));
    const inverse = invertGf256Matrix(matrix);
    if (!inverse) return;

    const rightSides = parityRows.map((parityRow) => {
      const bytes = new Uint8Array(stripe.parity.get(parityRow));
      for (let localIndex = 0; localIndex < stripe.dataCount; localIndex += 1) {
        const source = known[stripe.firstSourceIndex + localIndex];
        if (source) xorScaled(bytes, source, coefficient(parityRow, localIndex));
      }
      return bytes;
    });

    for (let missingIndex = 0; missingIndex < missingLocalIndexes.length; missingIndex += 1) {
      const bytes = new Uint8Array(snapshot.blockBytes);
      for (let rowIndex = 0; rowIndex < rightSides.length; rowIndex += 1) {
        xorScaled(bytes, rightSides[rowIndex], inverse[missingIndex][rowIndex]);
      }
      storeKnown(stripe.firstSourceIndex + missingLocalIndexes[missingIndex], bytes);
    }
    stripe.recovered = true;
    stripe.parity.clear();
  }

  return {
    accept,
    isComplete: () => solved === snapshot.sourceCount,
    bytes() {
      if (solved !== snapshot.sourceCount) return null;
      const padded = new Uint8Array(snapshot.sourceCount * snapshot.blockBytes);
      for (let sourceIndex = 0; sourceIndex < snapshot.sourceCount; sourceIndex += 1) {
        padded.set(known[sourceIndex], sourceIndex * snapshot.blockBytes);
      }
      return padded.slice(0, snapshot.originalBytes);
    },
    progress: () => ({ solved, sourceCount: snapshot.sourceCount, accepted: acceptedIds.size, duplicates }),
    metadata: snapshot,
  };
}

function repairLocation(sourceCount, symbolId) {
  const stripeCount = Math.ceil(sourceCount / STRIPE_DATA_COUNT);
  const repairOrdinal = symbolId - sourceCount;
  const parityRow = Math.floor(repairOrdinal / stripeCount);
  const column = repairOrdinal % stripeCount;
  return {
    stripeIndex: (column + parityRow) % stripeCount,
    parityRow,
  };
}

function selectIndependentParityRows(parityRows, missingLocalIndexes) {
  const basis = [];
  for (const parityRow of parityRows) {
    const row = Uint8Array.from(
      missingLocalIndexes,
      (localIndex) => coefficient(parityRow, localIndex),
    );
    for (const item of basis) {
      if (row[item.pivot] !== 0) addScaledRow(row, item.row, row[item.pivot]);
    }
    const pivot = row.findIndex((value) => value !== 0);
    if (pivot === -1) continue;
    scaleRow(row, gfInverse(row[pivot]));
    basis.push({ pivot, row, parityRow });
    basis.sort((left, right) => left.pivot - right.pivot);
    if (basis.length === missingLocalIndexes.length) {
      return basis.map((item) => item.parityRow);
    }
  }
  return null;
}

function coefficient(parityRow, dataIndex) {
  return gfInverse(dataIndex ^ (STRIPE_DATA_COUNT + parityRow));
}

function invertGf256Matrix(matrix) {
  const size = matrix.length;
  const rows = matrix.map((values, rowIndex) => {
    const row = new Uint8Array(size * 2);
    row.set(values, 0);
    row[size + rowIndex] = 1;
    return row;
  });

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    while (pivot < size && rows[pivot][column] === 0) pivot += 1;
    if (pivot === size) return null;
    if (pivot !== column) [rows[pivot], rows[column]] = [rows[column], rows[pivot]];

    const scale = gfInverse(rows[column][column]);
    scaleRow(rows[column], scale);
    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      if (rowIndex === column || rows[rowIndex][column] === 0) continue;
      addScaledRow(rows[rowIndex], rows[column], rows[rowIndex][column]);
    }
  }
  return rows.map((row) => row.slice(size));
}

function scaleRow(row, factor) {
  for (let index = 0; index < row.length; index += 1) row[index] = gfMultiply(row[index], factor);
}

function addScaledRow(target, source, factor) {
  for (let index = 0; index < target.length; index += 1) {
    target[index] ^= gfMultiply(source[index], factor);
  }
}

function xorScaled(target, source, factor) {
  const factorOffset = factor << 8;
  for (let index = 0; index < target.length; index += 1) {
    target[index] ^= GF_MUL[factorOffset | source[index]];
  }
}

function gfMultiply(left, right) {
  return GF_MUL[(left << 8) | right];
}

function gfInverse(value) {
  if (value === 0) throw new RangeError("GF(256) sıfırının tersi yoktur.");
  return GF_EXP[255 - GF_LOG[value]];
}

function initializeGaloisField() {
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < GF_EXP.length; index += 1) GF_EXP[index] = GF_EXP[index - 255];
  for (let left = 1; left < 256; left += 1) {
    for (let right = 1; right < 256; right += 1) {
      GF_MUL[(left << 8) | right] = GF_EXP[GF_LOG[left] + GF_LOG[right]];
    }
  }
}

function validateMetadata(metadata) {
  if (
    !metadata ||
    !TRANSFER_ID_PATTERN.test(metadata.transferId ?? "") ||
    !Number.isSafeInteger(metadata.sourceCount) ||
    metadata.sourceCount < 1 ||
    metadata.sourceCount > MAX_SOURCE_COUNT ||
    metadata.blockBytes !== LIVE_V2_BLOCK_BYTES ||
    metadata.stripeDataCount !== STRIPE_DATA_COUNT ||
    !Number.isSafeInteger(metadata.originalBytes) ||
    metadata.originalBytes < 0 ||
    metadata.originalBytes > MAX_LIVE_QR_PACKAGE_BYTES ||
    metadata.sourceCount !== Math.max(1, Math.ceil(metadata.originalBytes / metadata.blockBytes)) ||
    !SHA256_PATTERN.test(metadata.sha256 ?? "")
  ) {
    throw new RangeError("QRL2 fountain üst bilgisi geçersiz.");
  }
}

function validateSymbolId(symbolId, symbolLimit) {
  if (!Number.isSafeInteger(symbolId) || symbolId < 0 || symbolId > MAX_V2_SYMBOL_ID || symbolId >= symbolLimit) {
    throw new RangeError("QRL2 sembol kimliği güvenli sınırı aşıyor.");
  }
}

function isValidSymbol(symbol, metadata, symbolLimit) {
  return Boolean(
    symbol &&
    typeof symbol === "object" &&
    Number.isSafeInteger(symbol.symbolId) &&
    symbol.symbolId >= 0 &&
    symbol.symbolId <= MAX_V2_SYMBOL_ID &&
    symbol.symbolId < symbolLimit &&
    symbol.data instanceof Uint8Array &&
    symbol.data.length === metadata.blockBytes
  );
}
