import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHUNK_BYTES,
  MAX_FRAME_COUNT,
  MAX_INPUT_BYTES,
  encodeFramesV3,
  isBase64UrlLengthWithinPayloadLimit,
  parseFrameV3,
} from "../protocol/frame-v3";
import { parseFrame } from "../protocol";

describe("QRT3", () => {
  it("tüm parçaları sıra bağımsız doğrular", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(2_048));
    const encoded = await encodeFramesV3({
      bytes,
      transferId: "abc123def456",
      chunkBytes: 450,
    });
    const parsed = encoded.frames.map(parseFrameV3);

    expect(parsed.every(Boolean)).toBe(true);
    expect(new Set(parsed.map((frame) => frame.index)).size).toBe(encoded.total);
    expect(encoded.total).toBe(5);
  });

  it("verilmemiş aktarım kimliği için güvenli 12 karakterlik kimlik üretir", async () => {
    const encoded = await encodeFramesV3({ bytes: new Uint8Array([1]) });

    expect(encoded.transferId).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(encoded.frames).toHaveLength(1);
  });

  it("boş veriyi tek boş kare olarak kodlar", async () => {
    const encoded = await encodeFramesV3({
      bytes: new Uint8Array(),
      transferId: "abc123def456",
    });
    const parsed = parseFrameV3(encoded.frames[0]);

    expect(encoded.total).toBe(1);
    expect(parsed).toMatchObject({
      index: 0,
      total: 1,
      payloadSize: 0,
      data: new Uint8Array(),
    });
  });

  it("CRC32 ile bozulmuş kareyi reddeder", async () => {
    const encoded = await encodeFramesV3({
      bytes: new Uint8Array([1, 2, 3]),
      transferId: "abc123def456",
    });
    const corrupted = encoded.frames[0].replace(/.$/, "A");

    expect(parseFrameV3(corrupted)).toBeNull();
  });

  it("bildirilen payload boyutunu aşan base64url metnini çözmeden reddeder", () => {
    const oversizedDataBase64Url = "A".repeat(1_000_000);
    const frame = `QRT3|abc123def456|0|1|0|00000000|${oversizedDataBase64Url}`;

    expect(isBase64UrlLengthWithinPayloadLimit(0, oversizedDataBase64Url.length)).toBe(false);
    expect(parseFrameV3(frame)).toBeNull();
  });

  it.each([
    "QRT3|x|-1|3|0|x|x",
    "QRT3|x|3|3|0|x|x",
    "QRT3|x|0|999999999|0|x|x",
    "QRT3|abc123def456|0|1|1|00000000|",
    "QRT3|abc123def456|0|1|0|0000000A|",
  ])("geçersiz kareyi reddeder: %s", (text) => {
    expect(parseFrameV3(text)).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "geçersiz parça boyutunu reddeder: %s",
    async (chunkBytes) => {
      await expect(
        encodeFramesV3({
          bytes: new Uint8Array([1]),
          transferId: "abc123def456",
          chunkBytes,
        }),
      ).rejects.toThrow();
    },
  );

  it("girdi ve kare sınırlarının aşılmasını reddeder", async () => {
    await expect(
      encodeFramesV3({
        bytes: new Uint8Array(MAX_INPUT_BYTES + 1),
        transferId: "abc123def456",
      }),
    ).rejects.toThrow();
    await expect(
      encodeFramesV3({
        bytes: new Uint8Array([1]),
        transferId: "abc123def456",
        chunkBytes: 1 / (MAX_FRAME_COUNT + 1),
      }),
    ).rejects.toThrow();
  });

  it("string olmayan genel ayrıştırma girdisini reddeder", () => {
    expect(parseFrame(null)).toBeNull();
  });

  it("QRT1 ve QRT2 ayrıştırmasını korur", () => {
    const qrt1 = "QRT1|old123|0|1|dGVzdA|text/plain|1|QQ";
    const paddedQrt1 = "QRT1|old789|0|1|dGVzdA==|text/plain|1|QQ==";
    const qrt2 = "QRT2|old456|0|1|dGVzdA|text/plain|1|0|QQ";

    expect(parseFrame(qrt1)).toMatchObject({ transferId: "old123", isCompressed: false });
    expect(parseFrame(paddedQrt1)).toMatchObject({ transferId: "old789", isCompressed: false });
    expect(parseFrame(qrt2)).toMatchObject({ transferId: "old456", isCompressed: false });
  });
});

describe("QRT3 sabitleri", () => {
  it("varsayılan parça boyutunu destekler", async () => {
    const encoded = await encodeFramesV3({
      bytes: new Uint8Array(DEFAULT_CHUNK_BYTES + 1),
      transferId: "abc123def456",
    });

    expect(encoded.total).toBe(2);
  });
});
