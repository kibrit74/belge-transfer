import { describe, expect, it } from "vitest";
import { createLiveFountainEncoder } from "../live-qr/fountain.js";
import { encodeLiveFrame } from "../live-qr/frame-v1.js";
import { parseLiveFrame } from "../live-qr/frame.js";
import { createStripeFountainEncoder } from "../live-qr/stripe-fountain-v2.js";
import { encodeLiveFrameV2 } from "../live-qr/frame-v2.js";

describe("Canlı QR çerçeve yönlendiricisi", () => {
  it("QRL1 ve QRL2 çerçevelerini doğru parsera yönlendirir", async () => {
    const v1 = await createLiveFountainEncoder(new Uint8Array([1, 2, 3]), {
      transferId: "RouterTest01",
    });
    const v2 = await createStripeFountainEncoder(new Uint8Array([4, 5, 6]), {
      transferId: "RouterTest02",
    });

    expect(parseLiveFrame(encodeLiveFrame(v1.metadata, v1.symbol(0)))?.protocolVersion).toBe("QRL1");
    expect(parseLiveFrame(encodeLiveFrameV2(v2.metadata, v2.symbol(0)))?.protocolVersion).toBe("QRL2");
    expect(parseLiveFrame("QRL3|bilinmeyen")).toBeNull();
  });
});
