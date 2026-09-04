import { describe, expect, it } from "vitest";
import { sha256Base64Url } from "../protocol/hash.js";
import {
  createStripeFountainDecoder,
  createStripeFountainEncoder,
  LIVE_V2_BLOCK_BYTES,
} from "../live-qr/stripe-fountain-v2.js";

const MIB = 1024 * 1024;

function seededBytes(length, seed) {
  const bytes = new Uint8Array(length);
  let state = seed >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

describe("QRL2 şeritli fountain motoru", () => {
  it("her QR karesinde 1465 bayt veri taşır", () => {
    expect(LIVE_V2_BLOCK_BYTES).toBe(1465);
  });

  it("2 MiB paketi 1,5x aday içinde her beşinci kare kaybıyla çözer", async () => {
    const bytes = seededBytes(2 * MIB, 0x51a7);
    const encoder = await createStripeFountainEncoder(bytes, { transferId: "Qr10MiBTest1" });
    const decoder = createStripeFountainDecoder(encoder.metadata);
    const candidateCount = Math.ceil(encoder.metadata.sourceCount * 1.5);

    for (let symbolId = 0; symbolId < candidateCount; symbolId += 1) {
      if (symbolId % 5 !== 0) decoder.accept(encoder.symbol(symbolId));
    }

    expect(decoder.isComplete()).toBe(true);
    const restored = decoder.bytes();
    expect(restored).toBeInstanceOf(Uint8Array);
    expect(restored).toHaveLength(bytes.length);
    expect(await sha256Base64Url(restored)).toBe(await sha256Base64Url(bytes));
  }, 30_000);

  it("aynı sembolü ikinci kez belleğe almaz", async () => {
    const encoder = await createStripeFountainEncoder(new Uint8Array(64_000), {
      transferId: "Duplicate001",
    });
    const decoder = createStripeFountainDecoder(encoder.metadata);
    const symbol = encoder.symbol(7);

    expect(decoder.accept(symbol)).toEqual({ accepted: true });
    expect(decoder.accept(symbol)).toEqual({ accepted: false, reason: "duplicate" });
    expect(decoder.progress()).toMatchObject({ accepted: 1, duplicates: 1 });
  });

  it("oluşturulduktan sonra değiştirilen metadata nesnesinden etkilenmez", async () => {
    const encoder = await createStripeFountainEncoder(new Uint8Array(64_000), {
      transferId: "Snapshot0001",
    });
    const mutableMetadata = { ...encoder.metadata };
    const decoder = createStripeFountainDecoder(mutableMetadata);
    mutableMetadata.transferId = "Changed00001";
    mutableMetadata.sourceCount = 1;

    expect(decoder.accept(encoder.symbol(0))).toEqual({ accepted: true });
    expect(decoder.metadata).toEqual(encoder.metadata);
  });
});
