import { describe, expect, it } from "vitest";
import {
  encodeChunkFrame,
  encodeControlMessage,
  parseChunkFrame,
  parseControlMessage,
} from "../nearby/protocol-v1.js";

const MIB = 1024 * 1024;
const TRANSFER_ID = "abcdefghijklmnop";
const SHA256 = "A".repeat(43);

function offerFile(overrides = {}) {
  return {
    version: "NDP1",
    type: "offer-file",
    transferId: TRANSFER_ID,
    name: "rapor.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 1024,
    sha256: SHA256,
    ...overrides,
  };
}

describe("Yakındaki Cihazlar NDP1 kontrol mesajları", () => {
  it("offer-file yalnız tam ve güvenli anahtar kümesini kabul eder", () => {
    const text = encodeControlMessage(offerFile());

    expect(parseControlMessage(text)).toEqual(offerFile());
    expect(parseControlMessage(text.replace(/}$/, ',"extra":true}'))).toBeNull();
    expect(parseControlMessage(JSON.stringify({ ...offerFile(), mime: undefined }))).toBeNull();
  });

  it.each([
    { version: "NDP1", type: "accept-file", transferId: TRANSFER_ID },
    { version: "NDP1", type: "reject-file", transferId: TRANSFER_ID, reason: "Kullanıcı reddetti" },
    { version: "NDP1", type: "complete", transferId: TRANSFER_ID, totalBytes: 1024, sha256: SHA256 },
    { version: "NDP1", type: "cancel", transferId: TRANSFER_ID, reason: "Gönderen iptal etti" },
    { version: "NDP1", type: "error", code: "CONNECTION_LOST" },
  ])("$type mesajını tam şemayla tur dönüşünde korur", (message) => {
    expect(parseControlMessage(encodeControlMessage(message))).toEqual(message);
  });

  it("dosya adı, MIME, boyut, kimlik ve SHA sınırlarını uygular", () => {
    expect(parseControlMessage(JSON.stringify(offerFile({ name: "" })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ name: "a".repeat(256) })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ name: "a/b.pdf" })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ name: "a\\b.pdf" })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ name: "a\u0000b.pdf" })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ mime: "" })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ mime: "a".repeat(128) })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ size: -1 })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ size: 100 * MIB + 1 })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ transferId: "short" })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ transferId: "abcdefghijklmno+" })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ sha256: `${"A".repeat(42)}B` })))).toBeNull();
    expect(parseControlMessage(JSON.stringify(offerFile({ size: 100 * MIB })))).toMatchObject({ size: 100 * MIB });
  });

  it("prototipli, aşırı büyük ve geçersiz JSON değerlerini reddeder", () => {
    expect(() => encodeControlMessage(Object.create({ type: "offer-file" }))).toThrow();
    expect(parseControlMessage("{" )).toBeNull();
    expect(parseControlMessage(JSON.stringify({ ...offerFile(), name: "a".repeat(255), mime: "b".repeat(127), padding: "x".repeat(2048) }))).toBeNull();
    expect(parseControlMessage("x".repeat(2049))).toBeNull();
  });
});

describe("Yakındaki Cihazlar NDP1 dosya parçaları", () => {
  it("sıra ve offset alanını big-endian taşır", () => {
    const bytes = new Uint8Array([7, 8, 9]);

    expect(parseChunkFrame(encodeChunkFrame({ sequence: 12, offset: 64, bytes }))).toEqual({
      sequence: 12,
      offset: 64,
      bytes,
    });
  });

  it("32 KiB parçayı kabul eder ve sınırı aşanı reddeder", () => {
    const bytes = new Uint8Array(32 * 1024);
    expect(parseChunkFrame(encodeChunkFrame({ sequence: 0, offset: 0, bytes }))).toMatchObject({ bytes });
    expect(() => encodeChunkFrame({ sequence: 0, offset: 0, bytes: new Uint8Array(32 * 1024 + 1) })).toThrow();
  });

  it("bozuk tür, başlık ve sayı alanlarını reddeder", () => {
    expect(parseChunkFrame(new Uint8Array(8))).toBeNull();
    expect(parseChunkFrame(new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(() => encodeChunkFrame({ sequence: -1, offset: 0, bytes: new Uint8Array([1]) })).toThrow();
    expect(() => encodeChunkFrame({ sequence: 0, offset: 2 ** 32, bytes: new Uint8Array([1]) })).toThrow();
  });
});
