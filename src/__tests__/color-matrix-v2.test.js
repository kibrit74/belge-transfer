import { describe, expect, it } from 'vitest';
import {
  COLOR_CELL,
  buildColorMatrixV2,
  isReservedCell,
  readColorMatrixV2,
} from '../optical/color-matrix-v2.js';
import {
  rasterizeColorMatrixForTest,
  renderColorMatrixV2,
  scanColorMatrixV2,
} from '../optical/color-matrix-canvas.js';

function createCrf2Frame(blockBytes = 380, payloadByte = 7) {
  const frameBytes = new Uint8Array(67 + blockBytes).fill(payloadByte);
  frameBytes.set([67, 82, 70, 50], 0);
  frameBytes[25] = (blockBytes >>> 8) & 0xff;
  frameBytes[26] = blockBytes & 0xff;
  return frameBytes;
}

function createPixelCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    pixels: new Uint8ClampedArray(0),
  };

  const context = {
    fillStyle: 'rgb(0, 0, 0)',
    imageSmoothingEnabled: true,
    fillRect(x, y, width, height) {
      const [r, g, b] = context.fillStyle.match(/\d+/g).map(Number);
      if (canvas.pixels.length !== canvas.width * canvas.height * 4) {
        canvas.pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
      }
      for (let row = y; row < y + height; row += 1) {
        for (let column = x; column < x + width; column += 1) {
          const offset = (row * canvas.width + column) * 4;
          canvas.pixels.set([r, g, b, 255], offset);
        }
      }
    },
  };

  canvas.getContext = () => context;
  return canvas;
}

function placeOnFlatBackground(imageData, cellSize) {
  const margins = {
    left: cellSize * 6,
    top: cellSize * 5,
    right: cellSize * 8,
    bottom: cellSize * 7,
  };
  const width = margins.left + imageData.width + margins.right;
  const height = margins.top + imageData.height + margins.bottom;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data.set([118, 137, 153, 255], offset);
  }
  for (let row = 0; row < imageData.height; row += 1) {
    const sourceStart = row * imageData.width * 4;
    const targetStart = ((row + margins.top) * width + margins.left) * 4;
    data.set(imageData.data.subarray(sourceStart, sourceStart + imageData.width * 4), targetStart);
  }
  return { data, width, height };
}

const TEST_RGB = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]];

function lowerSampleConfidence(imageData, matrix, cellSize) {
  const center = cellSize * 0.5;
  const diagonalOffset = cellSize * 0.22;
  const sampleOffsets = [
    [center, center],
    [center - diagonalOffset, center - diagonalOffset],
    [center + diagonalOffset, center - diagonalOffset],
    [center - diagonalOffset, center + diagonalOffset],
    [center + diagonalOffset, center + diagonalOffset],
  ].map(([x, y]) => [Math.round(x), Math.round(y)]);
  for (let row = 0; row < matrix.dimension; row += 1) {
    for (let column = 0; column < matrix.dimension; column += 1) {
      if (isReservedCell(row, column, matrix.dimension)) continue;
      const correct = matrix.cells[row * matrix.dimension + column];
      const wrong = TEST_RGB.map((_, index) => index).filter((index) => index !== correct);
      const colors = [correct, correct, ...wrong];
      sampleOffsets.forEach(([offsetX, offsetY], index) => {
        const x = column * cellSize + offsetX;
        const y = row * cellSize + offsetY;
        const pixelOffset = (y * imageData.width + x) * 4;
        imageData.data.set([...TEST_RGB[colors[index]], 255], pixelOffset);
      });
    }
  }
}

describe('renk matrisi V2', () => {
  it('CRF2 baytlarını yön ve kalibrasyon hücreleriyle kayıpsız taşır', () => {
    const frameBytes = Uint8Array.from({ length: 447 }, (_, index) => index & 0xff);
    const matrix = buildColorMatrixV2(frameBytes);

    expect(matrix.quietZone).toBe(4);
    expect(matrix.dimension % 2).toBe(1);
    expect(readColorMatrixV2(matrix)).toEqual(frameBytes);
  });

  it('üç finder desenini ve sağ alt yön işaretini sabit hücrelere yerleştirir', () => {
    const matrix = buildColorMatrixV2(createCrf2Frame());
    const { cells, dimension, quietZone } = matrix;
    const at = (row, column) => cells[row * dimension + column];
    const innerEnd = dimension - quietZone - 1;

    const finderOrigins = [
      [quietZone, quietZone],
      [quietZone, innerEnd - 4],
      [innerEnd - 4, quietZone],
    ];
    finderOrigins.forEach(([startRow, startColumn]) => {
      for (let row = 0; row < 5; row += 1) {
        for (let column = 0; column < 5; column += 1) {
          const ring = Math.min(row, column, 4 - row, 4 - column);
          expect(at(startRow + row, startColumn + column)).toBe(
            ring === 1 ? COLOR_CELL.WHITE : COLOR_CELL.BLACK,
          );
        }
      }
    });
    expect([
      at(innerEnd, innerEnd - 2),
      at(innerEnd, innerEnd - 1),
      at(innerEnd, innerEnd),
    ]).toEqual([COLOR_CELL.RED, COLOR_CELL.BLUE, COLOR_CELL.GREEN]);
  });

  it.each([0, 90, 180, 270])('%i derece döndürülmüş sentetik görüntüyü çözer', (rotation) => {
    const frameBytes = createCrf2Frame();
    const matrix = buildColorMatrixV2(frameBytes);
    const imageData = rasterizeColorMatrixForTest(matrix, { cellSize: 10, rotation });

    expect(scanColorMatrixV2(imageData)).toMatchObject({ frameBytes, rotation });
  });

  it.each([0, 90, 180, 270])(
    '%i derece matrisi farklı düz arka planın ortasında bulur',
    (rotation) => {
      const cellSize = 10;
      const frameBytes = createCrf2Frame();
      const raster = rasterizeColorMatrixForTest(buildColorMatrixV2(frameBytes), {
        cellSize,
        rotation,
      });
      const imageData = placeOnFlatBackground(raster, cellSize);

      expect(scanColorMatrixV2(imageData)).toMatchObject({ frameBytes, rotation });
    },
  );

  it('parlaklık kaydırılmış RGB örneklerini kalibrasyon hücreleriyle çözer', () => {
    const frameBytes = createCrf2Frame(380, 0b01101100);
    const imageData = rasterizeColorMatrixForTest(buildColorMatrixV2(frameBytes), {
      cellSize: 10,
      transformRgb: ([r, g, b]) => [
        Math.min(255, r * 0.72 + 30),
        Math.min(255, g * 0.72 + 30),
        Math.min(255, b * 0.72 + 30),
      ],
    });

    expect(scanColorMatrixV2(imageData)?.frameBytes).toEqual(frameBytes);
  });

  it('kırmızı kanalı güçlü kaydırılmış hücreleri ölçülen kalibrasyon paletiyle çözer', () => {
    const frameBytes = createCrf2Frame(380, 0b01101100);
    const imageData = rasterizeColorMatrixForTest(buildColorMatrixV2(frameBytes), {
      cellSize: 10,
      transformRgb: ([r, g, b]) => [Math.min(255, r * 0.5 + 150), g, b],
    });

    const result = scanColorMatrixV2(imageData);
    expect(result?.confidence).toBeGreaterThanOrEqual(0.70);
    expect(result?.frameBytes).toEqual(frameBytes);
  });

  it('çoğunluk doğru olsa bile güveni 0,70 altındaki örneklemeyi reddeder', () => {
    const frameBytes = createCrf2Frame();
    const matrix = buildColorMatrixV2(frameBytes);
    const imageData = rasterizeColorMatrixForTest(matrix, { cellSize: 10 });
    lowerSampleConfidence(imageData, matrix, 10);

    expect(scanColorMatrixV2(imageData)).toBeNull();
  });

  it('CRF2 olmayan görüntüyü ve 3 pikselden küçük hücreleri reddeder', () => {
    const wrongMagic = createCrf2Frame();
    wrongMagic[0] = 0;

    expect(scanColorMatrixV2(rasterizeColorMatrixForTest(buildColorMatrixV2(wrongMagic), {
      cellSize: 10,
    }))).toBeNull();
    expect(scanColorMatrixV2(rasterizeColorMatrixForTest(buildColorMatrixV2(createCrf2Frame()), {
      cellSize: 2,
    }))).toBeNull();
  });

  it('Canvas üzerine gerçek pikselleri güvenli hücre boyutuyla çizer', () => {
    const canvas = createPixelCanvas();
    const result = renderColorMatrixV2(canvas, createCrf2Frame(1), {
      cellSize: 4,
      maxCanvasSize: 1080,
    });
    const finderCenter = (result.quietZone * result.cellSize) + Math.floor(result.cellSize / 2);
    const pixelOffset = (finderCenter * canvas.width + finderCenter) * 4;

    expect(result.cellSize).toBe(8);
    expect(canvas.pixels.slice(pixelOffset, pixelOffset + 4)).toEqual(
      Uint8ClampedArray.from([0, 0, 0, 255]),
    );
    expect(() => renderColorMatrixV2(createPixelCanvas(), createCrf2Frame(), {
      maxCanvasSize: 100,
    })).toThrow(expect.objectContaining({ code: 'COLOR_UNSUPPORTED' }));
  });
});
