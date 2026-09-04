import { describe, expect, it } from "vitest";
import {
  createFountainDecoder,
  createFountainEncoder,
} from "../optical/fountain.js";

function seededBytes(length) {
  const bytes = new Uint8Array(length);
  let state = 0x12345678;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

describe("sistematik fountain kodlama", () => {
  it("aynı sembol kimliğinde aynı onarım verisini üretir", async () => {
    const bytes = seededBytes(8192);
    const first = await createFountainEncoder(bytes, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 256,
      emissionRatio: 1.5,
    });
    const second = await createFountainEncoder(bytes, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 256,
      emissionRatio: 1.5,
    });

    expect(first.symbol(first.metadata.sourceCount + 5)).toEqual(
      second.symbol(second.metadata.sourceCount + 5),
    );
  });

  it("yüzde 20 kayıp, tekrar ve ters sırada özgün baytları kurar", { timeout: 30000 }, async () => {
    const bytes = seededBytes(256 * 1024);
    const encoder = await createFountainEncoder(bytes, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 700,
      emissionRatio: 1.5,
    });
    const retained = encoder.symbols().filter((_, index) => index % 5 !== 0).reverse();
    const decoder = createFountainDecoder(encoder.metadata);

    for (const symbol of [...retained, retained[0]]) decoder.accept(symbol);

    expect(decoder.isComplete()).toBe(true);
    expect(decoder.bytes()).toEqual(bytes);
    expect(decoder.progress().duplicates).toBe(1);
  });

  it("bozuk sembol boyutunu ve başka aktarımı reddeder", async () => {
    const encoder = await createFountainEncoder(seededBytes(4096), {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 256,
    });
    const decoder = createFountainDecoder(encoder.metadata);

    expect(decoder.accept({ symbolId: 0, data: new Uint8Array(2) })).toEqual({
      accepted: false,
      reason: "invalid-symbol",
    });
    expect(decoder.accept({
      ...encoder.symbol(0),
      transferId: "Other123456",
    })).toEqual({ accepted: false, reason: "different-transfer" });
  });

  it("boş girdiyi tek kaynak sembolü olarak taşır", async () => {
    const encoder = await createFountainEncoder(new Uint8Array(), {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 256,
    });
    const decoder = createFountainDecoder(encoder.metadata);

    decoder.accept(encoder.symbol(0));

    expect(decoder.bytes()).toEqual(new Uint8Array());
  });
});
