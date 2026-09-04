import { describe, expect, it } from "vitest";
import {
  LIVE_BLOCK_BYTES,
  MAX_SYMBOL_ID,
  createLiveFountainDecoder,
  createLiveFountainEncoder,
} from "../live-qr/fountain.js";
import { sha256Base64Url } from "../protocol/hash.js";
import { MAX_LEGACY_LIVE_QR_PACKAGE_BYTES } from "../live-qr/limits.js";

function seededBytes(length) {
  const bytes = new Uint8Array(length);
  let state = 0x12345678;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

function lostIds(count, seed) {
  const ids = Array.from({ length: count }, (_, id) => id);
  let state = seed >>> 0;
  for (let index = ids.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return new Set(ids.slice(0, Math.floor(count / 5)));
}

describe("Canlı QR fountain motoru", () => {
  it("1 MiB dosyanın en büyük paketini 1,5 kat adayda düzenli ve sabit rastgele yüzde 20 kayıpla 60 saniye altında kurar", { timeout: 60_000 }, async () => {
    const bytes = seededBytes(MAX_LEGACY_LIVE_QR_PACKAGE_BYTES);
    const transferIds = ["Qr1MiBTest01", "Qr1MiBTest02", "Qr1MiBTest03"];

    for (const transferId of transferIds) {
      const encoder = await createLiveFountainEncoder(bytes, { transferId });
      const candidateCount = Math.ceil(encoder.metadata.sourceCount * 1.5);
      const lossPatterns = [
        new Set(Array.from({ length: candidateCount }, (_, id) => id).filter((id) => id % 5 === 0)),
        lostIds(candidateCount, 0x1234),
        lostIds(candidateCount, 0x5678),
      ];

      for (const lost of lossPatterns) {
        const decoder = createLiveFountainDecoder(encoder.metadata);
        const retained = Array.from({ length: candidateCount }, (_, symbolId) => encoder.symbol(symbolId))
          .filter((_, symbolId) => !lost.has(symbolId))
          .reverse();

        for (const symbol of retained) decoder.accept(symbol);

        expect(decoder.isComplete()).toBe(true);
        const decoded = decoder.bytes();
        expect(decoded).toBeInstanceOf(Uint8Array);
        await expect(sha256Base64Url(decoded)).resolves.toBe(encoder.metadata.sha256);
      }
    }
  });

  it("varsayılan 1.000 bayt bloklarla yüzde 20 kayıp ve ters sırada paketi kurar", async () => {
    const bytes = seededBytes(120 * 1024);
    const encoder = await createLiveFountainEncoder(bytes, { transferId: "Ab12Cd34Ef56" });
    const decoder = createLiveFountainDecoder(encoder.metadata);
    const retained = Array.from(
      { length: encoder.metadata.sourceCount * 2 },
      (_, symbolId) => encoder.symbol(symbolId),
    ).filter((_, index) => index % 5 !== 0).reverse();

    for (const symbol of retained) decoder.accept(symbol);

    expect(encoder.metadata.blockBytes).toBe(LIVE_BLOCK_BYTES);
    expect(decoder.isComplete()).toBe(true);
    expect(decoder.bytes()).toEqual(bytes);
  });

  it("1.000 bayt veriyi tek kaynakta taşır", async () => {
    const encoder = await createLiveFountainEncoder(seededBytes(1_000), {
      transferId: "Ab12Cd34Ef56",
    });

    expect(encoder.metadata).toMatchObject({ blockBytes: 1_000, sourceCount: 1 });
  });

  it("sekiz kat kaynak sayısına kadar yüksek sembol kimliği üretir", async () => {
    const encoder = await createLiveFountainEncoder(seededBytes(3_000), {
      transferId: "Ab12Cd34Ef56",
    });
    const symbolId = encoder.metadata.sourceCount * 8;

    expect(encoder.symbol(symbolId)).toMatchObject({
      transferId: "Ab12Cd34Ef56",
      symbolId,
      data: expect.any(Uint8Array),
    });
  });

  it("yalnızca 32 bit işaretsiz sembol kimliğini kabul eder", async () => {
    const encoder = await createLiveFountainEncoder(seededBytes(1), {
      transferId: "Ab12Cd34Ef56",
    });
    const decoder = createLiveFountainDecoder(encoder.metadata);

    expect(encoder.symbol(MAX_SYMBOL_ID).symbolId).toBe(MAX_SYMBOL_ID);
    expect(() => encoder.symbol(MAX_SYMBOL_ID + 1)).toThrow(RangeError);
    expect(decoder.accept({ symbolId: -1, data: new Uint8Array(LIVE_BLOCK_BYTES) })).toEqual({
      accepted: false,
      reason: "invalid-symbol",
    });
    expect(decoder.accept({ symbolId: MAX_SYMBOL_ID + 1, data: new Uint8Array(LIVE_BLOCK_BYTES) })).toEqual({
      accepted: false,
      reason: "invalid-symbol",
    });
  });

  it("aynı sembolü tekrar saklamaz ve çözüm tamamlanmadan bayt vermez", async () => {
    const encoder = await createLiveFountainEncoder(seededBytes(2_000), {
      transferId: "Ab12Cd34Ef56",
    });
    const decoder = createLiveFountainDecoder(encoder.metadata);
    const first = encoder.symbol(0);

    expect(decoder.bytes()).toBeNull();
    expect(decoder.accept(first)).toEqual({ accepted: true });
    expect(decoder.accept(first)).toEqual({ accepted: false, reason: "duplicate" });
    expect(decoder.progress()).toMatchObject({ accepted: 1, duplicates: 1 });
  });

  it("en fazla kaynak sayısının üç katı farklı sembol saklar", async () => {
    const encoder = await createLiveFountainEncoder(seededBytes(3_000), {
      transferId: "Ab12Cd34Ef56",
    });
    const decoder = createLiveFountainDecoder(encoder.metadata);
    const limit = Math.ceil(encoder.metadata.sourceCount * 3);

    for (let symbolId = 0; symbolId < limit; symbolId += 1) {
      expect(decoder.accept(encoder.symbol(symbolId))).toEqual({ accepted: true });
    }

    expect(decoder.accept(encoder.symbol(limit))).toEqual({
      accepted: false,
      reason: "symbol-limit",
    });
  });

  it("oluşturulduktan sonra değiştirilen metadata nesnesinden etkilenmez", async () => {
    const encoder = await createLiveFountainEncoder(seededBytes(2_000), {
      transferId: "Ab12Cd34Ef56",
    });
    const externalMetadata = { ...encoder.metadata };
    const decoder = createLiveFountainDecoder(externalMetadata);

    externalMetadata.transferId = "Mu12Ta34Te56";
    externalMetadata.sourceCount = 10_000;
    externalMetadata.blockBytes = 1;

    expect(decoder.metadata).toEqual(encoder.metadata);
    expect(decoder.accept(encoder.symbol(0))).toEqual({ accepted: true });
    expect(decoder.progress().sourceCount).toBe(encoder.metadata.sourceCount);
  });
});
