import { describe, expect, it } from "vitest";
import { crc32Hex } from "../protocol/crc32.js";
import { LIVE_FRAME_VERSION, encodeLiveFrame, parseLiveFrame } from "../live-qr/frame-v1.js";

const metadata = {
  transferId: "Ab12Cd34Ef56",
  sourceCount: 5,
  blockBytes: 1_000,
  originalBytes: 5_000,
  sha256: "A".repeat(43),
};

describe("QRL1 canlı QR çerçevesi", () => {
  it("sembolü tam 10 alanla canonical base64url metnine çevirip okur", () => {
    const data = new Uint8Array([251, 255, 0]);
    const text = encodeLiveFrame(metadata, { symbolId: 7, data });

    expect(text.split("|")).toHaveLength(10);
    expect(text).toBe(`QRL1|Ab12Cd34Ef56|7|5|1000|5000|${"A".repeat(43)}|3|${crc32Hex(data)}|-_8A`);
    expect(parseLiveFrame(text)).toEqual({
      protocolVersion: LIVE_FRAME_VERSION,
      ...metadata,
      symbolId: 7,
      dataLength: 3,
      crc32: crc32Hex(data),
      data,
    });
  });

  it("CRC uyuşmazlığını ve canonical olmayan base64url biçimini reddeder", () => {
    const good = encodeLiveFrame(metadata, { symbolId: 0, data: new Uint8Array([1, 2, 3]) });
    const crcTampered = good.replace("55bc801d", "00000000");
    const parts = good.split("|");
    parts[9] = "AQI=";

    expect(parseLiveFrame(crcTampered)).toBeNull();
    expect(parseLiveFrame(parts.join("|"))).toBeNull();
  });

  it("alan, kimlik, boyut ve paket sınırları dışında kalan kareleri çözmeden reddeder", () => {
    const validData = "AA";
    const validCrc = crc32Hex(new Uint8Array([0]));
    const prefix = `QRL1|Ab12Cd34Ef56|0|1|1000|0|${"A".repeat(43)}|1|${validCrc}|${validData}`;

    expect(parseLiveFrame(`${prefix}|extra`)).toBeNull();
    expect(parseLiveFrame(prefix.replace("Ab12Cd34Ef56", "short"))).toBeNull();
    expect(parseLiveFrame(prefix.replace("|1|1000|0|", "|10001|1000|0|"))).toBeNull();
    expect(parseLiveFrame(prefix.replace("|1|1000|0|", "|1|500|0|"))).toBeNull();
    expect(parseLiveFrame(prefix.replace("|1|1000|0|", "|1|1001|0|"))).toBeNull();
    expect(parseLiveFrame(prefix.replace("|1|1000|0|", "|1|1000|1064969|"))).toBeNull();
    expect(parseLiveFrame(prefix.replace("|0|1|1000|0|", "|4294967296|1|1000|0|"))).toBeNull();
    expect(parseLiveFrame(prefix.replace("A".repeat(43), `${"A".repeat(42)}B`))).toBeNull();
    expect(parseLiveFrame(`${prefix}${"A".repeat(10_000)}`)).toBeNull();
  });

  it("üretimde doğrulanmamış üst bilgi ve sembolü reddeder", () => {
    expect(() => encodeLiveFrame({ ...metadata, sourceCount: 10_001 }, {
      symbolId: 0,
      data: new Uint8Array([1]),
    })).toThrow(RangeError);
    expect(() => encodeLiveFrame(metadata, {
      symbolId: 0x1_0000_0000,
      data: new Uint8Array([1]),
    })).toThrow(RangeError);
  });

  it("canonical olan fakat A ile bitmeyen SHA-256 değerini kabul eder", () => {
    const metadataWithCanonicalSha = { ...metadata, sha256: `${"A".repeat(42)}E` };

    expect(parseLiveFrame(encodeLiveFrame(metadataWithCanonicalSha, {
      symbolId: 0,
      data: new Uint8Array([1]),
    }))).toMatchObject({ sha256: metadataWithCanonicalSha.sha256 });
  });
});
