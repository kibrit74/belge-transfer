import { describe, expect, it } from "vitest";
import { parseFrame } from "../protocol/index.js";
import {
  encodeFrameV4,
  parseFrameV4,
} from "../optical/frame-v4.js";

const metadata = {
  transferId: "Ab12Cd34Ef56",
  sourceCount: 4,
  blockBytes: 1400,
  originalBytes: 5000,
  sha256: "A".repeat(43),
};

describe("QRF1 optik çerçevesi", () => {
  it("sembolü metne çevirip aynı alanlarla okur", () => {
    const text = encodeFrameV4(metadata, {
      symbolId: 7,
      data: new Uint8Array([1, 2, 3]),
    });

    expect(parseFrameV4(text)).toEqual({
      protocolVersion: "QRF1",
      ...metadata,
      symbolId: 7,
      payloadBytes: 3,
      chunkCrc32: expect.stringMatching(/^[0-9a-f]{8}$/),
      data: new Uint8Array([1, 2, 3]),
    });
    expect(parseFrame(text)).toEqual(parseFrameV4(text));
  });

  it("yükü değiştirilmiş çerçeveyi reddeder", () => {
    const text = encodeFrameV4(metadata, {
      symbolId: 7,
      data: new Uint8Array([1, 2, 3]),
    });
    const parts = text.split("|");
    parts[9] = "AQIE";

    expect(parseFrameV4(parts.join("|"))).toBeNull();
  });

  it("güvenlik sınırlarını aşan veya biçimi bozuk çerçeveyi reddeder", () => {
    expect(parseFrameV4(`QRF1|${"x".repeat(50_000)}`)).toBeNull();
    expect(parseFrameV4(
      `QRF1|Ab12Cd34Ef56|0|4|1400|52428801|${"A".repeat(43)}|1|00000000|AA`,
    )).toBeNull();
    expect(parseFrameV4(
      `QRF1|bad|0|4|1400|10|${"A".repeat(43)}|1|00000000|AA`,
    )).toBeNull();
  });
});
