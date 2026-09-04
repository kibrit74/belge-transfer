import { describe, expect, it } from "vitest";
import { createStripeFountainEncoder } from "../live-qr/stripe-fountain-v2.js";
import { encodeLiveFrameV2, parseLiveFrameV2 } from "../live-qr/frame-v2.js";

describe("QRL2 canlı QR çerçevesi", () => {
  it("çerçeveyi tam on alanla kayıpsız kodlar ve ayrıştırır", async () => {
    const encoder = await createStripeFountainEncoder(new Uint8Array([1, 2, 3]), {
      transferId: "FrameV2Test1",
    });
    const symbol = encoder.symbol(0);
    const encoded = encodeLiveFrameV2(encoder.metadata, symbol);

    expect(encoded.split("|")).toHaveLength(10);
    expect(parseLiveFrameV2(encoded)).toMatchObject({
      protocolVersion: "QRL2",
      transferId: "FrameV2Test1",
      symbolId: 0,
      sourceCount: 1,
      blockBytes: 1000,
      stripeDataCount: 32,
      originalBytes: 3,
      sha256: encoder.metadata.sha256,
      data: symbol.data,
    });
  });

  it("CRC değeri veya alan sayısı değiştirilen çerçeveyi reddeder", async () => {
    const encoder = await createStripeFountainEncoder(new Uint8Array([4, 5, 6]), {
      transferId: "FrameV2Test2",
    });
    const encoded = encodeLiveFrameV2(encoder.metadata, encoder.symbol(0));
    const parts = encoded.split("|");
    parts[8] = parts[8] === "00000000" ? "ffffffff" : "00000000";

    expect(parseLiveFrameV2(parts.join("|"))).toBeNull();
    expect(parseLiveFrameV2(`${encoded}|extra`)).toBeNull();
  });

  it("canonical olmayan Base64URL verisini reddeder", async () => {
    const encoder = await createStripeFountainEncoder(new Uint8Array([7, 8, 9]), {
      transferId: "FrameV2Test3",
    });
    const parts = encodeLiveFrameV2(encoder.metadata, encoder.symbol(0)).split("|");
    parts[9] += "=";

    expect(parseLiveFrameV2(parts.join("|"))).toBeNull();
  });
});
