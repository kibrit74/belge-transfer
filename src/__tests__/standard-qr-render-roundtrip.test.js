import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { createFountainEncoder } from "../optical/fountain.js";
import { encodeFrameV4, parseFrameV4 } from "../optical/frame-v4.js";
import { rasterizeQrText } from "../video/qr-raster.js";

describe("standart QR raster roundtrip", () => {
  it("gerçek QRF1 karesini 900 piksele büyüttükten sonra eksiksiz okur", async () => {
    const bytes = Uint8Array.from({ length: 1400 }, (_, index) => (index * 37) & 0xff);
    const fountain = await createFountainEncoder(bytes, {
      transferId: "QrRenderTst1",
      blockBytes: 1400,
      emissionRatio: 1.5,
    });
    const frameText = encodeFrameV4(fountain.metadata, fountain.symbol(0));
    const raster = rasterizeQrText(frameText);
    const scaled = scaleNearestNeighbor(raster, 900, 900);

    const decoded = jsQR(scaled.data, scaled.width, scaled.height, {
      inversionAttempts: "dontInvert",
    });

    expect(decoded?.data).toBe(frameText);
    expect(parseFrameV4(decoded.data)).toEqual(expect.objectContaining({
      protocolVersion: "QRF1",
      transferId: "QrRenderTst1",
      symbolId: 0,
    }));
  });
});

function scaleNearestNeighbor(source, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.floor((y * source.height) / height);
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.floor((x * source.width) / width);
      const sourceOffset = ((sourceY * source.width) + sourceX) * 4;
      const targetOffset = ((y * width) + x) * 4;
      data[targetOffset] = source.pixels[sourceOffset];
      data[targetOffset + 1] = source.pixels[sourceOffset + 1];
      data[targetOffset + 2] = source.pixels[sourceOffset + 2];
      data[targetOffset + 3] = source.pixels[sourceOffset + 3];
    }
  }
  return { data, width, height };
}
