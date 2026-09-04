export const COLOR_CELL = Object.freeze({
  BLACK: 0,
  RED: 1,
  GREEN: 2,
  BLUE: 3,
  WHITE: 4,
});

export const COLOR_MATRIX_QUIET_ZONE = 4;
const FINDER_SIZE = 5;
const MIN_INNER_DIMENSION = 19;
const CRF2_HEADER_BYTES = 67;
const BLOCK_BYTES_OFFSET = 25;

function isUint8Array(value) {
  return Object.prototype.toString.call(value) === '[object Uint8Array]';
}

function chooseOddDimension(requiredCells) {
  let dimension = Math.max(MIN_INNER_DIMENSION, Math.ceil(Math.sqrt(requiredCells)));
  if (dimension % 2 === 0) dimension += 1;
  return dimension;
}

function finderOrigins(dimension) {
  const quietZone = COLOR_MATRIX_QUIET_ZONE;
  const far = dimension - quietZone - FINDER_SIZE;
  return [[quietZone, quietZone], [quietZone, far], [far, quietZone]];
}

export function getOrientationCells(dimension) {
  const end = dimension - COLOR_MATRIX_QUIET_ZONE - 1;
  return [[end, end - 2], [end, end - 1], [end, end]];
}

export function getCalibrationCells() {
  const start = COLOR_MATRIX_QUIET_ZONE;
  return [[start + FINDER_SIZE, start], [start + FINDER_SIZE, start + 1],
    [start + FINDER_SIZE, start + 2], [start + FINDER_SIZE, start + 3]];
}

function isInsideFinder(row, column, dimension) {
  return finderOrigins(dimension).some(([startRow, startColumn]) => (
    row >= startRow
    && row < startRow + FINDER_SIZE
    && column >= startColumn
    && column < startColumn + FINDER_SIZE
  ));
}

export function isReservedCell(row, column, dimension) {
  const quietZone = COLOR_MATRIX_QUIET_ZONE;
  if (row < quietZone || column < quietZone
    || row >= dimension - quietZone || column >= dimension - quietZone) {
    return true;
  }

  if (isInsideFinder(row, column, dimension)) return true;
  return getOrientationCells(dimension).some(([cellRow, cellColumn]) => (
    row === cellRow && column === cellColumn
  )) || getCalibrationCells().some(([cellRow, cellColumn]) => (
    row === cellRow && column === cellColumn
  ));
}

function reservedCellCount(innerDimension) {
  const dimension = innerDimension + COLOR_MATRIX_QUIET_ZONE * 2;
  let count = 0;
  for (let row = COLOR_MATRIX_QUIET_ZONE; row < dimension - COLOR_MATRIX_QUIET_ZONE; row += 1) {
    for (let column = COLOR_MATRIX_QUIET_ZONE; column < dimension - COLOR_MATRIX_QUIET_ZONE; column += 1) {
      if (isReservedCell(row, column, dimension)) count += 1;
    }
  }
  return count;
}

function chooseInnerDimension(dataSymbolCount) {
  let dimension = chooseOddDimension(dataSymbolCount + 82);
  while ((dimension * dimension) - reservedCellCount(dimension) < dataSymbolCount) {
    dimension += 2;
  }
  return dimension;
}

function setCell(cells, dimension, row, column, value) {
  cells[row * dimension + column] = value;
}

function drawFinder(cells, dimension, startRow, startColumn) {
  for (let row = 0; row < FINDER_SIZE; row += 1) {
    for (let column = 0; column < FINDER_SIZE; column += 1) {
      const ring = Math.min(row, column, FINDER_SIZE - 1 - row, FINDER_SIZE - 1 - column);
      setCell(cells, dimension, startRow + row, startColumn + column,
        ring === 1 ? COLOR_CELL.WHITE : COLOR_CELL.BLACK);
    }
  }
}

function drawOrientationMark(cells, dimension) {
  const colors = [COLOR_CELL.RED, COLOR_CELL.BLUE, COLOR_CELL.GREEN];
  getOrientationCells(dimension).forEach(([row, column], index) => {
    setCell(cells, dimension, row, column, colors[index]);
  });
}

function drawCalibrationStrip(cells, dimension) {
  const colors = [COLOR_CELL.BLACK, COLOR_CELL.RED, COLOR_CELL.GREEN, COLOR_CELL.BLUE];
  getCalibrationCells().forEach(([row, column], index) => {
    setCell(cells, dimension, row, column, colors[index]);
  });
}

function bytesToTwoBitSymbols(bytes) {
  const symbols = new Uint8Array(bytes.length * 4);
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    symbols[index * 4] = (value >>> 6) & 0x03;
    symbols[index * 4 + 1] = (value >>> 4) & 0x03;
    symbols[index * 4 + 2] = (value >>> 2) & 0x03;
    symbols[index * 4 + 3] = value & 0x03;
  }
  return symbols;
}

function twoBitSymbolsToBytes(symbols) {
  const bytes = new Uint8Array(Math.floor(symbols.length / 4));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (symbols[index * 4] << 6)
      | (symbols[index * 4 + 1] << 4)
      | (symbols[index * 4 + 2] << 2)
      | symbols[index * 4 + 3];
  }
  return bytes;
}

function writePayloadCells(cells, dimension, symbols) {
  let symbolIndex = 0;
  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      if (isReservedCell(row, column, dimension)) continue;
      setCell(cells, dimension, row, column,
        symbolIndex < symbols.length ? symbols[symbolIndex] : COLOR_CELL.BLACK);
      symbolIndex += 1;
    }
  }
}

function readPayloadCells(matrix) {
  const symbols = [];
  for (let row = 0; row < matrix.dimension; row += 1) {
    for (let column = 0; column < matrix.dimension; column += 1) {
      if (isReservedCell(row, column, matrix.dimension)) continue;
      const value = matrix.cells[row * matrix.dimension + column];
      if (value < COLOR_CELL.BLACK || value > COLOR_CELL.BLUE) {
        throw new TypeError('Renk matrisi veri hücresi geçersiz.');
      }
      symbols.push(value);
    }
  }
  return Uint8Array.from(symbols);
}

function validateMatrix(matrix) {
  if (!matrix || !Number.isSafeInteger(matrix.dimension) || matrix.dimension < MIN_INNER_DIMENSION
    || matrix.dimension % 2 !== 1 || !isUint8Array(matrix.cells)
    || matrix.cells.length !== matrix.dimension * matrix.dimension) {
    throw new TypeError('Renk matrisi geçersiz.');
  }
}

export function buildColorMatrixV2(frameBytes) {
  if (!isUint8Array(frameBytes) || frameBytes.length === 0) {
    throw new TypeError('Renk matrisi için kare baytları gerekir.');
  }

  const innerDimension = chooseInnerDimension(frameBytes.length * 4);
  const dimension = innerDimension + COLOR_MATRIX_QUIET_ZONE * 2;
  const cells = new Uint8Array(dimension * dimension).fill(COLOR_CELL.WHITE);

  for (const [row, column] of finderOrigins(dimension)) {
    drawFinder(cells, dimension, row, column);
  }
  drawOrientationMark(cells, dimension);
  drawCalibrationStrip(cells, dimension);
  writePayloadCells(cells, dimension, bytesToTwoBitSymbols(frameBytes));

  return {
    dimension,
    quietZone: COLOR_MATRIX_QUIET_ZONE,
    cells,
    frameByteLength: frameBytes.length,
  };
}

export function readColorMatrixV2(matrix) {
  validateMatrix(matrix);
  const availableBytes = twoBitSymbolsToBytes(readPayloadCells(matrix));
  let frameByteLength = matrix.frameByteLength;

  if (!Number.isSafeInteger(frameByteLength) || frameByteLength <= 0) {
    if (availableBytes.length < CRF2_HEADER_BYTES) {
      throw new TypeError('Renk matrisi CRF2 başlığı taşımıyor.');
    }
    const blockBytes = (availableBytes[BLOCK_BYTES_OFFSET] << 8)
      | availableBytes[BLOCK_BYTES_OFFSET + 1];
    frameByteLength = CRF2_HEADER_BYTES + blockBytes;
  }

  if (frameByteLength > availableBytes.length) {
    throw new TypeError('Renk matrisi kare uzunluğu geçersiz.');
  }
  return availableBytes.slice(0, frameByteLength);
}
