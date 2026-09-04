import { describe, expect, it } from "vitest";
import { createFountainDecoder, createFountainEncoder } from "../optical/fountain.js";
import { scaleQrRegions } from "../optical/frame-layout.js";
import { estimateOpticalVideo, getOpticalProfile } from "../optical/profiles.js";

describe("5 MiB QRF1 kabul sınaması", () => {
  it("%20 sembol kaybı, sıra değişimi ve tekrarlarla veriyi eksiksiz kurar", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (index * 31 + (index >>> 8) * 17) & 0xff;
    }
    const encoder = await createFountainEncoder(bytes, {
      transferId: "Qr5MiBTest01",
      blockBytes: 1400,
      emissionRatio: 1.5,
    });
    const kept = encoder.symbols().filter((symbol) => symbol.symbolId % 5 !== 4);
    const reordered = [];
    for (let index = 0; index < kept.length; index += 100) {
      reordered.push(...kept.slice(index, index + 100).reverse());
    }
    const withDuplicates = reordered.flatMap((symbol, index) => (
      index % 250 === 0 ? [symbol, symbol] : [symbol]
    ));

    const decoder = createFountainDecoder(encoder.metadata);
    for (const symbol of withDuplicates) decoder.accept(symbol);

    expect(kept.length).toBe(Math.ceil(encoder.metadata.emittedSymbols * 0.8));
    expect(decoder.isComplete()).toBe(true);
    const recovered = decoder.bytes();
    expect(recovered).toHaveLength(bytes.length);
    expect(recovered.every((byte, index) => byte === bytes[index])).toBe(true);
    const profile = getOpticalProfile("balanced");
    expect(profile).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 24,
      qrCount: 2,
    });
    expect(scaleQrRegions(profile, 1280, 720)).toEqual([
      { x: 40, y: 60, width: 600, height: 600 },
      { x: 640, y: 60, width: 600, height: 600 },
    ]);
    expect(estimateOpticalVideo({ byteLength: bytes.length }).durationSeconds).toBeLessThanOrEqual(120);
  }, 120_000);
});
