import { describe, expect, it, vi } from "vitest";
import { encodeControlMessage, parseChunkFrame } from "../nearby/protocol-v1.js";
import { createNearbySendController } from "../nearby/send-controller.js";
import { createNearbySignalingClient } from "../nearby/signaling-client.js";

class Channel extends EventTarget {
  readyState = "open";
  bufferedAmount = 0;
  sent = [];
  send(value) {
    this.sent.push(value);
  }
  receive(value) {
    this.dispatchEvent(new MessageEvent("message", { data: value }));
  }
}

describe("Yakındaki Cihazlar ağ izolasyonu", () => {
  it("dosya bilgisi HTTP'ye çıkmaz, dosya baytı yalnız veri kanalına gider", async () => {
    const requests = [];
    const apiRequest = vi.fn(async (path, options = {}) => {
      requests.push({ path, options });
      return { accepted: true };
    });
    const signaling = createNearbySignalingClient({ apiRequest });
    await signaling.publish({
      code: "ABC234", token: "oda-tokeni", kind: "offer", sequence: 1,
      payload: { type: "offer", sdp: "v=0\r\n" },
    });

    const marker = "DOSYA-ICERIK-MARKERI";
    const fileName = "gizli-rapor.xlsx";
    const sha256 = "A".repeat(43);
    const channel = new Channel();
    const sender = createNearbySendController({
      channel, hashFile: async () => sha256, createTransferId: () => "abcdefghijklmnop",
    });
    const pending = sender.send(new File([marker], fileName, { type: "application/xlsx" }));
    await vi.waitFor(() => expect(channel.sent).toHaveLength(1));
    channel.receive(encodeControlMessage({
      version: "NDP1", type: "accept-file", transferId: "abcdefghijklmnop",
    }));
    await vi.waitFor(() => expect(channel.sent.filter((value) => typeof value === "string")).toHaveLength(2));
    channel.receive(channel.sent.filter((value) => typeof value === "string")[1]);
    await pending;

    const serializedRequests = JSON.stringify(requests.map(({ path, options }) => ({ path, body: options.body })));
    expect(serializedRequests).not.toContain(marker);
    expect(serializedRequests).not.toContain(fileName);
    expect(serializedRequests).not.toContain(sha256);
    expect(serializedRequests).not.toContain("oda-tokeni");
    expect(requests[0].options.headers).toEqual({ "X-Nearby-Token": "oda-tokeni" });

    const binaryFrame = channel.sent.find((value) => value instanceof ArrayBuffer);
    const decoded = parseChunkFrame(binaryFrame);
    expect(new TextDecoder().decode(decoded.bytes)).toBe(marker);
  });
});
