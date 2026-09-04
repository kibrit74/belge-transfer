import {
  COLOR_CELL,
  COLOR_MATRIX_QUIET_ZONE,
  buildColorMatrixV2,
  getCalibrationCells,
  getOrientationCells,
  readColorMatrixV2,
} from './color-matrix-v2.js';

const RGB = Object.freeze([
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 255],
]);
const FINDER_SIZE = 5;
const CRF2_MAGIC = [67, 82, 70, 50];

function colorMatrixError(code, message) {
  const error = new Error(message);
  error.name = 'ColorMatrixError';
  error.code = code;
  return error;
}

function rgbToCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function validateImageData(imageData) {
  return Boolean(imageData
    && Number.isSafeInteger(imageData.width) && imageData.width > 0
    && Number.isSafeInteger(imageData.height) && imageData.height > 0
    && imageData.data && imageData.data.length === imageData.width * imageData.height * 4);
}

function pixelRgb(imageData, x, y) {
  const safeX = Math.max(0, Math.min(imageData.width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(imageData.height - 1, Math.round(y)));
  const offset = (safeY * imageData.width + safeX) * 4;
  return [imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2]];
}

function colorDistanceSquared(first, second) {
  const red = first[0] - second[0];
  const green = first[1] - second[1];
  const blue = first[2] - second[2];
  return red * red + green * green + blue * blue;
}

export function classifyWithCalibration(rgb, palette) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((reference, index) => {
    const distance = colorDistanceSquared(rgb, reference);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function pixelLuminance(imageData, x, y) {
  const [red, green, blue] = pixelRgb(imageData, x, y);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function luminanceThreshold(imageData) {
  let darkest = 255;
  let lightest = 0;
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const luminance = pixelLuminance(imageData, x, y);
      darkest = Math.min(darkest, luminance);
      lightest = Math.max(lightest, luminance);
    }
  }
  if (lightest - darkest < 80) return null;
  return darkest + (lightest - darkest) * 0.5;
}

function buildRuns(length, isDarkAt) {
  const runs = [];
  let start = 0;
  let dark = isDarkAt(0);
  for (let index = 1; index < length; index += 1) {
    const currentDark = isDarkAt(index);
    if (currentDark === dark) continue;
    runs.push({ start, length: index - start, dark });
    start = index;
    dark = currentDark;
  }
  runs.push({ start, length: length - start, dark });
  return runs;
}

function finderRuns(runs) {
  const matches = [];
  for (let index = 0; index <= runs.length - 5; index += 1) {
    const window = runs.slice(index, index + 5);
    if (!window[0].dark || window[1].dark || !window[2].dark
      || window[3].dark || !window[4].dark) continue;
    const coreLengths = [window[1].length, window[2].length, window[3].length];
    const cellSize = coreLengths.reduce((sum, length) => sum + length, 0) / 3;
    const coreTolerance = Math.max(1, cellSize * 0.25);
    if (cellSize < 3
      || coreLengths.some((length) => Math.abs(length - cellSize) > coreTolerance)
      || window[0].length < cellSize * 0.75
      || window[4].length < cellSize * 0.75) continue;
    matches.push({
      center: window[2].start + window[2].length / 2,
      cellSize,
      centerRunStart: window[2].start,
      centerRunEnd: window[2].start + window[2].length,
    });
  }
  return matches;
}

function finderPatternMatches(imageData, candidate, threshold) {
  const startX = candidate.centerX - candidate.cellSize * FINDER_SIZE / 2;
  const startY = candidate.centerY - candidate.cellSize * FINDER_SIZE / 2;
  for (let row = 0; row < FINDER_SIZE; row += 1) {
    for (let column = 0; column < FINDER_SIZE; column += 1) {
      const ring = Math.min(row, column, FINDER_SIZE - 1 - row, FINDER_SIZE - 1 - column);
      const shouldBeDark = ring !== 1;
      const isDark = pixelLuminance(
        imageData,
        startX + (column + 0.5) * candidate.cellSize,
        startY + (row + 0.5) * candidate.cellSize,
      ) < threshold;
      if (isDark !== shouldBeDark) return false;
    }
  }
  return true;
}

function hasQuietCorner(imageData, candidate, threshold) {
  const distance = candidate.cellSize * 3.5;
  const probes = [
    pixelLuminance(imageData, candidate.centerX, candidate.centerY - distance) >= threshold,
    pixelLuminance(imageData, candidate.centerX + distance, candidate.centerY) >= threshold,
    pixelLuminance(imageData, candidate.centerX, candidate.centerY + distance) >= threshold,
    pixelLuminance(imageData, candidate.centerX - distance, candidate.centerY) >= threshold,
  ];
  return probes.some((isLight, index) => isLight && probes[(index + 1) % probes.length]);
}

function findFinderCandidates(imageData, threshold) {
  const verticalCache = new Map();
  const candidates = [];
  for (let y = 0; y < imageData.height; y += 1) {
    const horizontalRuns = buildRuns(
      imageData.width,
      (x) => pixelLuminance(imageData, x, y) < threshold,
    );
    for (const horizontal of finderRuns(horizontalRuns)) {
      const x = Math.round(horizontal.center);
      if (!verticalCache.has(x)) {
        const verticalRuns = buildRuns(
          imageData.height,
          (row) => pixelLuminance(imageData, x, row) < threshold,
        );
        verticalCache.set(x, finderRuns(verticalRuns));
      }
      for (const vertical of verticalCache.get(x)) {
        if (y < vertical.centerRunStart || y >= vertical.centerRunEnd
          || Math.abs(vertical.cellSize - horizontal.cellSize) > horizontal.cellSize * 0.25) {
          continue;
        }
        const candidate = {
          centerX: horizontal.center,
          centerY: vertical.center,
          cellSize: (horizontal.cellSize + vertical.cellSize) / 2,
        };
        if (!finderPatternMatches(imageData, candidate, threshold)
          || !hasQuietCorner(imageData, candidate, threshold)) continue;
        const duplicate = candidates.some((current) => (
          Math.abs(current.centerX - candidate.centerX) < candidate.cellSize / 2
          && Math.abs(current.centerY - candidate.centerY) < candidate.cellSize / 2
        ));
        if (!duplicate) candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function relativeDifference(first, second) {
  return Math.abs(first - second) / Math.max(first, second);
}

function squareTriplet(first, second, third) {
  const points = [first, second, third];
  const distances = [];
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const deltaX = points[a].centerX - points[b].centerX;
      const deltaY = points[a].centerY - points[b].centerY;
      distances.push(deltaX * deltaX + deltaY * deltaY);
    }
  }
  distances.sort((a, b) => a - b);
  return distances[0] > 0
    && relativeDifference(distances[0], distances[1]) <= 0.05
    && relativeDifference(distances[2], distances[0] * 2) <= 0.05;
}

function quietZoneMatches(imageData, bounds, threshold) {
  const halfCell = bounds.cellSize / 2;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return [
    [centerX, bounds.y - halfCell],
    [bounds.x + bounds.width + halfCell, centerY],
    [centerX, bounds.y + bounds.height + halfCell],
    [bounds.x - halfCell, centerY],
  ].every(([x, y]) => pixelLuminance(imageData, x, y) >= threshold);
}

function selectFinderBounds(imageData, candidates, threshold) {
  let selected = null;
  let selectedSpan = -1;
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      for (let third = second + 1; third < candidates.length; third += 1) {
        const triplet = [candidates[first], candidates[second], candidates[third]];
        if (!squareTriplet(...triplet)) continue;
        const cellSize = Math.round(
          triplet.reduce((sum, candidate) => sum + candidate.cellSize, 0) / triplet.length,
        );
        if (triplet.some((candidate) => Math.abs(candidate.cellSize - cellSize) > cellSize * 0.25)) {
          continue;
        }
        const minCenterX = Math.min(...triplet.map((candidate) => candidate.centerX));
        const maxCenterX = Math.max(...triplet.map((candidate) => candidate.centerX));
        const minCenterY = Math.min(...triplet.map((candidate) => candidate.centerY));
        const maxCenterY = Math.max(...triplet.map((candidate) => candidate.centerY));
        const width = Math.round(maxCenterX - minCenterX + FINDER_SIZE * cellSize);
        const height = Math.round(maxCenterY - minCenterY + FINDER_SIZE * cellSize);
        if (width !== height || width % cellSize !== 0) continue;
        const bounds = {
          x: Math.round(minCenterX - FINDER_SIZE * cellSize / 2),
          y: Math.round(minCenterY - FINDER_SIZE * cellSize / 2),
          width,
          height,
          imageWidth: imageData.width,
          imageHeight: imageData.height,
          cellSize,
        };
        if (!quietZoneMatches(imageData, bounds, threshold) || width <= selectedSpan) continue;
        const cornerFor = (candidate) => {
          const vertical = Math.abs(candidate.centerY - minCenterY) < cellSize ? 'top' : 'bottom';
          const horizontal = Math.abs(candidate.centerX - minCenterX) < cellSize ? 'left' : 'right';
          return `${vertical}-${horizontal}`;
        };
        bounds.finderCandidates = triplet.map((candidate) => ({
          ...candidate,
          cellSize,
          corner: cornerFor(candidate),
        }));
        selected = bounds;
        selectedSpan = width;
      }
    }
  }
  return selected;
}

export function locateMatrixBounds(imageData) {
  if (!validateImageData(imageData)) return null;
  const threshold = luminanceThreshold(imageData);
  if (threshold === null) return null;
  const candidates = findFinderCandidates(imageData, threshold);
  return selectFinderBounds(imageData, candidates, threshold);
}

export function inferGrid(bounds, finderCandidates = bounds?.finderCandidates) {
  if (!bounds || !Array.isArray(finderCandidates) || finderCandidates.length !== 3) return null;
  const cellSize = bounds.cellSize;
  if (!Number.isSafeInteger(cellSize) || cellSize < 3) return null;

  const alignedDistances = [];
  for (let first = 0; first < finderCandidates.length; first += 1) {
    for (let second = first + 1; second < finderCandidates.length; second += 1) {
      const a = finderCandidates[first];
      const b = finderCandidates[second];
      if (Math.abs(a.centerX - b.centerX) < cellSize / 2) {
        alignedDistances.push(Math.abs(a.centerY - b.centerY));
      }
      if (Math.abs(a.centerY - b.centerY) < cellSize / 2) {
        alignedDistances.push(Math.abs(a.centerX - b.centerX));
      }
    }
  }
  if (alignedDistances.length < 2) return null;
  const innerDimension = Math.round(Math.max(...alignedDistances) / cellSize) + FINDER_SIZE;
  if (innerDimension < 19 || innerDimension % 2 !== 1
    || bounds.width !== innerDimension * cellSize) return null;

  const dimension = innerDimension + COLOR_MATRIX_QUIET_ZONE * 2;
  const originX = bounds.x - COLOR_MATRIX_QUIET_ZONE * cellSize;
  const originY = bounds.y - COLOR_MATRIX_QUIET_ZONE * cellSize;
  if (originX < 0 || originY < 0
    || originX + dimension * cellSize > bounds.imageWidth
    || originY + dimension * cellSize > bounds.imageHeight) return null;

  return { originX, originY, cellSize, dimension };
}

function mapOriginalToObserved(row, column, dimension, rotation) {
  if (rotation === 90) return [column, dimension - 1 - row];
  if (rotation === 180) return [dimension - 1 - row, dimension - 1 - column];
  if (rotation === 270) return [dimension - 1 - column, row];
  return [row, column];
}

function cellSamplePoints(geometry, row, column) {
  const centerX = geometry.originX + (column + 0.5) * geometry.cellSize;
  const centerY = geometry.originY + (row + 0.5) * geometry.cellSize;
  const offset = geometry.cellSize * 0.22;
  return [[centerX, centerY], [centerX - offset, centerY - offset],
    [centerX + offset, centerY - offset], [centerX - offset, centerY + offset],
    [centerX + offset, centerY + offset]];
}

function averageCellRgb(imageData, geometry, row, column) {
  const total = cellSamplePoints(geometry, row, column)
    .map(([x, y]) => pixelRgb(imageData, x, y))
    .reduce((sum, rgb) => sum.map((value, index) => value + rgb[index]), [0, 0, 0]);
  return total.map((value) => value / 5);
}

export function sampleGrid(imageData, geometry, palette) {
  const cells = new Uint8Array(geometry.dimension * geometry.dimension);
  let winningVotes = 0;
  for (let row = 0; row < geometry.dimension; row += 1) {
    for (let column = 0; column < geometry.dimension; column += 1) {
      const votes = new Uint8Array(palette.length);
      for (const [x, y] of cellSamplePoints(geometry, row, column)) {
        votes[classifyWithCalibration(pixelRgb(imageData, x, y), palette)] += 1;
      }
      let winner = 0;
      for (let index = 1; index < votes.length; index += 1) {
        if (votes[index] > votes[winner]) winner = index;
      }
      cells[row * geometry.dimension + column] = winner;
      winningVotes += votes[winner];
    }
  }
  return {
    cells,
    dimension: geometry.dimension,
    confidence: winningVotes / (geometry.dimension * geometry.dimension * 5),
  };
}

function normalizedCells(sampledCells, rotation) {
  const normalized = new Uint8Array(sampledCells.cells.length);
  const { dimension } = sampledCells;
  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      const [observedRow, observedColumn] = mapOriginalToObserved(row, column, dimension, rotation);
      normalized[row * dimension + column]
        = sampledCells.cells[observedRow * dimension + observedColumn];
    }
  }
  return normalized;
}

function finderScore(cells, dimension, startRow, startColumn) {
  let score = 0;
  for (let row = 0; row < FINDER_SIZE; row += 1) {
    for (let column = 0; column < FINDER_SIZE; column += 1) {
      const ring = Math.min(row, column, FINDER_SIZE - 1 - row, FINDER_SIZE - 1 - column);
      const expected = ring === 1 ? COLOR_CELL.WHITE : COLOR_CELL.BLACK;
      if (cells[(startRow + row) * dimension + startColumn + column] === expected) score += 1;
    }
  }
  return score;
}

export function detectRotation(sampledCells) {
  const rotations = [0, 90, 180, 270];
  let bestRotation = null;
  let bestScore = -1;
  for (const rotation of rotations) {
    const cells = normalizedCells(sampledCells, rotation);
    const dimension = sampledCells.dimension;
    const quietZone = COLOR_MATRIX_QUIET_ZONE;
    const far = dimension - quietZone - FINDER_SIZE;
    let score = finderScore(cells, dimension, quietZone, quietZone)
      + finderScore(cells, dimension, quietZone, far)
      + finderScore(cells, dimension, far, quietZone);
    const orientationColors = [COLOR_CELL.RED, COLOR_CELL.BLUE, COLOR_CELL.GREEN];
    getOrientationCells(dimension).forEach(([row, column], index) => {
      if (cells[row * dimension + column] === orientationColors[index]) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      bestRotation = rotation;
    }
  }
  return bestScore === 78 ? bestRotation : null;
}

export function readCalibration(imageData, geometry, rotation) {
  return getCalibrationCells().map(([row, column]) => {
    const [observedRow, observedColumn] = mapOriginalToObserved(
      row, column, geometry.dimension, rotation,
    );
    return averageCellRgb(imageData, geometry, observedRow, observedColumn);
  });
}

function rotationFromFinderCandidates(finderCandidates) {
  const corners = new Set(finderCandidates.map((candidate) => candidate.corner));
  if (!corners.has('bottom-right')) return 0;
  if (!corners.has('bottom-left')) return 90;
  if (!corners.has('top-left')) return 180;
  if (!corners.has('top-right')) return 270;
  return null;
}

function readQuietZoneWhite(imageData, geometry) {
  return averageCellRgb(imageData, geometry, 1, 1);
}

export function renderColorMatrixV2(canvas, frameBytes, {
  cellSize = 8,
  maxCanvasSize = 1080,
} = {}) {
  const matrix = buildColorMatrixV2(frameBytes);
  const maxCellSize = Math.floor(maxCanvasSize / matrix.dimension);
  if (maxCellSize < 8) {
    throw colorMatrixError('COLOR_UNSUPPORTED', 'Renkli matris güvenli hücre boyutuna sığmıyor.');
  }
  const requestedCellSize = Number.isFinite(cellSize) ? Math.floor(cellSize) : 8;
  const safeCellSize = Math.max(8, Math.min(requestedCellSize, maxCellSize));
  const size = matrix.dimension * safeCellSize;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw colorMatrixError('COLOR_UNSUPPORTED', 'Renkli QR tuvali hazırlanamadı.');
  }
  context.imageSmoothingEnabled = false;
  for (let row = 0; row < matrix.dimension; row += 1) {
    for (let column = 0; column < matrix.dimension; column += 1) {
      context.fillStyle = rgbToCss(RGB[matrix.cells[row * matrix.dimension + column]]);
      context.fillRect(column * safeCellSize, row * safeCellSize, safeCellSize, safeCellSize);
    }
  }
  return { ...matrix, cellSize: safeCellSize, size };
}

export function rasterizeColorMatrixForTest(matrix, {
  cellSize = 10,
  rotation = 0,
  transformRgb = (rgb) => rgb,
} = {}) {
  if (![0, 90, 180, 270].includes(rotation)
    || !Number.isSafeInteger(cellSize) || cellSize <= 0) {
    throw new TypeError('Sentetik renk matrisi ayarları geçersiz.');
  }
  const size = matrix.dimension * cellSize;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let row = 0; row < matrix.dimension; row += 1) {
    for (let column = 0; column < matrix.dimension; column += 1) {
      const [outputRow, outputColumn] = mapOriginalToObserved(
        row, column, matrix.dimension, rotation,
      );
      const transformed = transformRgb([...RGB[matrix.cells[row * matrix.dimension + column]]]);
      const rgb = transformed.map(clampByte);
      for (let y = outputRow * cellSize; y < (outputRow + 1) * cellSize; y += 1) {
        for (let x = outputColumn * cellSize; x < (outputColumn + 1) * cellSize; x += 1) {
          const offset = (y * size + x) * 4;
          data.set([...rgb, 255], offset);
        }
      }
    }
  }
  return { data, width: size, height: size };
}

export function scanColorMatrixV2(imageData) {
  try {
    const bounds = locateMatrixBounds(imageData);
    const geometry = inferGrid(bounds, bounds?.finderCandidates);
    if (!geometry) return null;

    const geometricRotation = rotationFromFinderCandidates(bounds.finderCandidates);
    if (geometricRotation === null) return null;
    const palette = [
      ...readCalibration(imageData, geometry, geometricRotation),
      readQuietZoneWhite(imageData, geometry),
    ];
    const sampled = sampleGrid(imageData, geometry, palette);
    if (sampled.confidence < 0.70) return null;
    const rotation = detectRotation(sampled);
    if (rotation === null || rotation !== geometricRotation) return null;

    const cells = normalizedCells(sampled, rotation);
    const frameBytes = readColorMatrixV2({
      dimension: geometry.dimension,
      quietZone: COLOR_MATRIX_QUIET_ZONE,
      cells,
    });
    if (!CRF2_MAGIC.every((value, index) => frameBytes[index] === value)) return null;
    return { frameBytes, dimension: geometry.dimension, rotation, confidence: sampled.confidence };
  } catch {
    return null;
  }
}
