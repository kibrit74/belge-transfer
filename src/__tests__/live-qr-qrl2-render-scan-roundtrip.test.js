import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { prepareZXingModule } from 'zxing-wasm/reader';
import { describe, expect, it } from 'vitest';
import { encodeLiveFrameV2, parseLiveFrameV2 } from '../live-qr/frame-v2.js';
import { selectLiveQrLayout } from '../live-qr/layout.js';
import { MAX_LIVE_QR_PACKAGE_BYTES } from '../live-qr/limits.js';
import { rasterizeLiveQrText } from '../live-qr/qr-raster.js';
import {
  LIVE_V2_BLOCK_BYTES,
  STRIPE_DATA_COUNT,
} from '../live-qr/stripe-fountain-v2.js';
import { createLiveQrDecodeWorkerMessageHandler } from '../workers/live-qr-decode.worker.js';

describe('gerçek QRL2 QR yerleşim turu', () => {
  it.each([
    ['tek QR', 500, 700, 1],
  ])('%s düzeninde azami QRL2 metnini gerçek tarayıcıyla geri okur', async (
    _name,
    width,
    height,
    expectedCount,
  ) => {
    const sourceCount = Math.ceil(MAX_LIVE_QR_PACKAGE_BYTES / LIVE_V2_BLOCK_BYTES);
    const metadata = {
      transferId: 'QrV2Render01',
      sourceCount,
      blockBytes: LIVE_V2_BLOCK_BYTES,
      stripeDataCount: STRIPE_DATA_COUNT,
      originalBytes: MAX_LIVE_QR_PACKAGE_BYTES,
      sha256: 'A'.repeat(43),
    };
    const texts = Array.from({ length: expectedCount }, (_, symbolId) => encodeLiveFrameV2(
      metadata,
      {
        transferId: metadata.transferId,
        symbolId,
        data: Uint8Array.from(
          { length: LIVE_V2_BLOCK_BYTES },
          (_value, index) => (index * 43 + symbolId) & 0xff,
        ),
      },
    ));
    const sample = rasterizeLiveQrText(texts[0]);
    const layout = selectLiveQrLayout({
      width,
      height,
      devicePixelRatio: 1,
      moduleCount: sample.moduleCount,
      maxCount: expectedCount,
    });
    const composite = new Uint8ClampedArray(width * height * 4).fill(255);
    const positions = Array.from({ length: expectedCount }, (_, index) => [
      10 + ((index % layout.columns) * (layout.qrPixelSize + layout.gap)),
      10 + (Math.floor(index / layout.columns) * (layout.qrPixelSize + layout.gap)),
    ]);

    texts.forEach((text, index) => {
      const raster = rasterizeLiveQrText(text);
      blit(composite, width, scale(raster, layout.qrPixelSize), positions[index][0], positions[index][1]);
    });

    const decoded = positions.map(([left, top]) => {
      const crop = cropImage(composite, width, left, top, layout.qrPixelSize, layout.qrPixelSize);
      return jsQR(crop.data, crop.width, crop.height, { inversionAttempts: 'dontInvert' })?.data;
    });

    expect(layout).toMatchObject({ supported: true, count: expectedCount });
    expect(layout.qrPixelSize / (sample.moduleCount + 4)).toBeGreaterThanOrEqual(3);
    expect(decoded).toEqual(texts);
    expect(decoded.map(parseLiveFrameV2).every((frame) => frame?.protocolVersion === 'QRL2')).toBe(true);
  });

  it('telefon kamerasında küçülen yoğun QRL2 karesini gerçek alıcıyla okur', async () => {
    prepareZXingModule({
      overrides: {
        wasmBinary: readFileSync('public/vendor/zxing_reader.wasm'),
      },
    });
    const metadata = {
      transferId: 'QrV2Render01',
      sourceCount: Math.ceil(MAX_LIVE_QR_PACKAGE_BYTES / LIVE_V2_BLOCK_BYTES),
      blockBytes: LIVE_V2_BLOCK_BYTES,
      stripeDataCount: STRIPE_DATA_COUNT,
      originalBytes: MAX_LIVE_QR_PACKAGE_BYTES,
      sha256: 'A'.repeat(43),
    };
    const text = encodeLiveFrameV2(metadata, {
      transferId: metadata.transferId,
      symbolId: 0,
      data: Uint8Array.from(
        { length: LIVE_V2_BLOCK_BYTES },
        (_value, index) => (index * 43) & 0xff,
      ),
    });
    const raster = rasterizeLiveQrText(text);
    const cameraFrame = placeQrInCameraFrame(raster, { width: 1280, height: 720, qrSize: 220 });
    const messages = [];
    const handleMessage = createLiveQrDecodeWorkerMessageHandler({
      postMessage: (message) => messages.push(message),
    });

    await handleMessage({ data: { id: 1, imageData: cameraFrame } });

    expect(messages).toEqual([{ id: 1, texts: [text] }]);
  });
});

function placeQrInCameraFrame(raster, { width, height, qrSize }) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const left = 100;
  const top = Math.floor((height - qrSize) / 2);
  for (let y = 0; y < qrSize; y += 1) {
    const sourceY = Math.floor((y * raster.height) / qrSize);
    for (let x = 0; x < qrSize; x += 1) {
      const sourceX = Math.floor((x * raster.width) / qrSize);
      const sourceOffset = ((sourceY * raster.width) + sourceX) * 4;
      const targetOffset = (((top + y) * width) + left + x) * 4;
      data.set(raster.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { data, width, height };
}

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
