import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { encodeLiveFrame } from '../live-qr/frame-v1.js';
import { createLiveFountainEncoder } from '../live-qr/fountain.js';
import { selectLiveQrLayout } from '../live-qr/layout.js';
import { rasterizeLiveQrText } from '../live-qr/qr-raster.js';

describe('gerçek dört QRL1 QR turu', () => {
  it('1600×900 karedeki dört QRL1 QR metnini kayıpsız geri okur', async () => {
    const bytes = Uint8Array.from({ length: 1_000 }, (_, index) => (index * 29) & 0xff);
    const encoder = await createLiveFountainEncoder(bytes, { transferId: 'QrRenderTst1' });
    const texts = [0, 1, 2, 3].map((symbolId) => encodeLiveFrame(encoder.metadata, encoder.symbol(symbolId)));
    const sample = rasterizeLiveQrText(texts[0]);
    expect(sample.moduleCount).toBe(141);
    const layout = selectLiveQrLayout({ width: 1600, height: 900, devicePixelRatio: 1, moduleCount: sample.moduleCount });
    const composite = new Uint8ClampedArray(1600 * 900 * 4).fill(255);
    const positions = [
      [10, 10],
      [10 + layout.qrPixelSize + layout.gap, 10],
      [10, 10 + layout.qrPixelSize + layout.gap],
      [10 + layout.qrPixelSize + layout.gap, 10 + layout.qrPixelSize + layout.gap],
    ];

    texts.forEach((text, index) => {
      const raster = rasterizeLiveQrText(text);
      blit(composite, 1600, scale(raster, layout.qrPixelSize), positions[index][0], positions[index][1]);
    });

    const decoded = positions.map(([x, y]) => {
      const crop = cropImage(composite, 1600, x, y, layout.qrPixelSize, layout.qrPixelSize);
      return jsQR(crop.data, crop.width, crop.height, { inversionAttempts: 'dontInvert' })?.data;
    });

    expect(layout).toMatchObject({ supported: true, count: 4 });
    expect(new Set(decoded)).toEqual(new Set(texts));
  });
});

function scale(source, size) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.floor((y * source.height) / size);
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.floor((x * source.width) / size);
      const sourceOffset = ((sourceY * source.width) + sourceX) * 4;
      const targetOffset = ((y * size) + x) * 4;
      data.set(source.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { data, width: size, height: size };
}

function blit(target, targetWidth, source, left, top) {
  for (let y = 0; y < source.height; y += 1) {
    const targetOffset = (((top + y) * targetWidth) + left) * 4;
    const sourceOffset = y * source.width * 4;
    target.set(source.data.subarray(sourceOffset, sourceOffset + (source.width * 4)), targetOffset);
  }
}

function cropImage(source, sourceWidth, left, top, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = (((top + y) * sourceWidth) + left) * 4;
    data.set(source.subarray(sourceOffset, sourceOffset + (width * 4)), y * width * 4);
  }
  return { data, width, height };
}
