import { describe, expect, it, vi } from "vitest";
import { encodeControlMessage } from "../nearby/protocol-v1.js";
import { createNearbyReceiveController } from "../nearby/receive-controller.js";
import { createNearbySendController } from "../nearby/send-controller.js";

const TRANSFER_ID = "abcdefghijklmnop";
const SHA256 = "A".repeat(43);

class FakeChannel extends EventTarget {
  constructor() {
    super();
    this.readyState = "open";
    this.bufferedAmount = 0;
    this.sent = [];
    this.listenersByType = new Map();
  }

  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    const listeners = this.listenersByType.get(type) ?? new Set();
    listeners.add(listener);
    this.listenersByType.set(type, listeners);
  }

  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    this.listenersByType.get(type)?.delete(listener);
  }

  listenerCount(type) {
    return this.listenersByType.get(type)?.size ?? 0;
  }

  send(value) {
    this.sent.push(value);
  }

  receive(value) {
    this.dispatchEvent(new MessageEvent("message", { data: value }));
  }

  emitBufferedAmountLow() {
    this.bufferedAmount = 0;
    this.dispatchEvent(new Event("bufferedamountlow"));
  }

  close = vi.fn(() => {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  });
}

function parseSentControl(channel, index = 0) {
  return JSON.parse(channel.sent.filter((value) => typeof value === "string")[index]);
}

async function acknowledgeCompletion(channel) {
  await vi.waitFor(() => expect(parseSentControl(channel, 1)).toMatchObject({ type: "complete" }));
  channel.receive(encodeControlMessage(parseSentControl(channel, 1)));
}

describe("Yakındaki Cihazlar göndericisi", () => {
  it("alıcı kabul etmeden dosya parçası göndermez", async () => {
    const channel = new FakeChannel();
    const sender = createNearbySendController({
      channel,
      hashFile: vi.fn().mockResolvedValue(SHA256),
      createTransferId: () => TRANSFER_ID,
    });
    const file = new File([new Uint8Array([1, 2, 3])], "rapor.pdf", { type: "application/pdf" });

    const pending = sender.send(file);
    await vi.waitFor(() => expect(parseSentControl(channel)).toMatchObject({ type: "offer-file" }));
    channel.receive("VDN1|VERIFIED");
    expect(channel.sent.filter((value) => value instanceof ArrayBuffer)).toHaveLength(0);
    channel.receive(encodeControlMessage({ version: "NDP1", type: "accept-file", transferId: TRANSFER_ID }));
    await acknowledgeCompletion(channel);
    await expect(pending).resolves.toEqual({ bytesSent: 3, sha256: SHA256 });
    expect(channel.sent.filter((value) => value instanceof ArrayBuffer)).toHaveLength(1);
    expect(parseSentControl(channel, 1)).toMatchObject({ type: "complete", totalBytes: 3 });
  });

  it("kanal doluyken düşük su olayını bekler", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 2 * 1024 * 1024;
    const sender = createNearbySendController({
      channel,
      hashFile: vi.fn().mockResolvedValue(SHA256),
      createTransferId: () => TRANSFER_ID,
    });
    const pending = sender.send(new File([new Uint8Array([1, 2, 3])], "a.bin"));
    await vi.waitFor(() => expect(channel.sent).toHaveLength(1));
    channel.receive(encodeControlMessage({ version: "NDP1", type: "accept-file", transferId: TRANSFER_ID }));
    await Promise.resolve();
    expect(channel.sent.filter((value) => value instanceof ArrayBuffer)).toHaveLength(0);

    channel.emitBufferedAmountLow();
    await acknowledgeCompletion(channel);
    await pending;
    expect(channel.sent.filter((value) => value instanceof ArrayBuffer)).toHaveLength(1);
  });

  it("backpressure beklerken kanal kapanırsa CONNECTION_LOST ile durur ve listenerları temizler", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 2 * 1024 * 1024;
    const sender = createNearbySendController({
      channel,
      hashFile: vi.fn().mockResolvedValue(SHA256),
      createTransferId: () => TRANSFER_ID,
    });
    const pending = sender.send(new File([new Uint8Array([1, 2, 3])], "a.bin"));
    await vi.waitFor(() => expect(channel.sent).toHaveLength(1));
    channel.receive(encodeControlMessage({ version: "NDP1", type: "accept-file", transferId: TRANSFER_ID }));
    await vi.waitFor(() => expect(channel.listenerCount("bufferedamountlow")).toBe(1));

    channel.close();
    const outcome = await Promise.race([
      pending.catch((error) => error.code),
      new Promise((resolve) => setTimeout(() => resolve("HUNG"), 100)),
    ]);

    expect(outcome).toBe("CONNECTION_LOST");
    expect(channel.listenerCount("bufferedamountlow")).toBe(0);
    expect(channel.listenerCount("close")).toBe(0);
  });

  it("backpressure listenerı kurulurken kapanan kanalı yeniden kontrol eder", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 2 * 1024 * 1024;
    const addEventListener = channel.addEventListener.bind(channel);
    let closeListenerAdds = 0;
    channel.addEventListener = (type, listener, options) => {
      addEventListener(type, listener, options);
      if (type === "close" && ++closeListenerAdds === 2) channel.readyState = "closed";
    };
    const sender = createNearbySendController({
      channel,
      hashFile: vi.fn().mockResolvedValue(SHA256),
      createTransferId: () => TRANSFER_ID,
    });
    const pending = sender.send(new File([new Uint8Array([1, 2, 3])], "a.bin"));
    await vi.waitFor(() => expect(channel.sent).toHaveLength(1));
    channel.receive(encodeControlMessage({ version: "NDP1", type: "accept-file", transferId: TRANSFER_ID }));

    const outcome = await Promise.race([
      pending.catch((error) => error.code),
      new Promise((resolve) => setTimeout(() => resolve("HUNG"), 100)),
    ]);

    expect(outcome).toBe("CONNECTION_LOST");
    expect(channel.listenerCount("bufferedamountlow")).toBe(0);
    expect(channel.listenerCount("close")).toBe(0);
  });

  it("alıcı reddederse dosya göndermeden durur", async () => {
    const channel = new FakeChannel();
    const sender = createNearbySendController({
      channel, hashFile: async () => SHA256, createTransferId: () => TRANSFER_ID,
    });
    const pending = sender.send(new File(["x"], "a.txt"));
    await vi.waitFor(() => expect(channel.sent).toHaveLength(1));
    channel.receive(encodeControlMessage({
      version: "NDP1", type: "reject-file", transferId: TRANSFER_ID, reason: "İstenmedi",
    }));

    await expect(pending).rejects.toMatchObject({ code: "FILE_REJECTED" });
    expect(channel.sent.filter((value) => value instanceof ArrayBuffer)).toHaveLength(0);
  });
});

describe("Yakındaki Cihazlar alıcısı", () => {
  it("kabul, sıralı parçalar ve doğru SHA sonrası dosya üretir", async () => {
    const channel = new FakeChannel();
    const receiver = createNearbyReceiveController({ channel, hashBytes: async () => SHA256 });
    const states = [];
    receiver.subscribe((state) => states.push(state));
    channel.receive("VDN1|READY");
    channel.receive("VDN1|ACK");
    channel.receive("VDN1|VERIFIED");
    expect(channel.close).not.toHaveBeenCalled();
    channel.receive(encodeControlMessage({
      version: "NDP1", type: "offer-file", transferId: TRANSFER_ID,
      name: "rapor.txt", mime: "text/plain", size: 3, sha256: SHA256,
    }));
    receiver.accept();

    // Alıcı offer'ı zaten aldığı için yalnız gerçek parçayı ve tamamlamayı besle.
    const { encodeChunkFrame } = await import("../nearby/protocol-v1.js");
    channel.receive(encodeChunkFrame({ sequence: 0, offset: 0, bytes: new Uint8Array([1, 2, 3]) }));
    channel.receive(encodeControlMessage({
      version: "NDP1", type: "complete", transferId: TRANSFER_ID, totalBytes: 3, sha256: SHA256,
    }));

    const result = await receiver.result();
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toBe("rapor.txt");
    expect(new Uint8Array(await result.file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.sha256).toBe(SHA256);
    expect(states).toContainEqual(expect.objectContaining({ state: "offered" }));
  });

  it("kabulden önce parça gelirse oturumu kapatır", async () => {
    const channel = new FakeChannel();
    const receiver = createNearbyReceiveController({ channel, hashBytes: async () => SHA256 });
    channel.receive(encodeControlMessage({
      version: "NDP1", type: "offer-file", transferId: TRANSFER_ID,
      name: "a.bin", mime: "application/octet-stream", size: 1, sha256: SHA256,
    }));
    const { encodeChunkFrame } = await import("../nearby/protocol-v1.js");
    channel.receive(encodeChunkFrame({ sequence: 0, offset: 0, bytes: new Uint8Array([1]) }));

    await expect(receiver.result()).rejects.toMatchObject({ code: "UNEXPECTED_CHUNK" });
    expect(channel.close).toHaveBeenCalled();
  });

  it("yanlış offset veya SHA için indirme dosyası üretmez", async () => {
    const channel = new FakeChannel();
    const receiver = createNearbyReceiveController({ channel, hashBytes: async () => "B".repeat(43) });
    channel.receive(encodeControlMessage({
      version: "NDP1", type: "offer-file", transferId: TRANSFER_ID,
      name: "a.bin", mime: "application/octet-stream", size: 1, sha256: SHA256,
    }));
    receiver.accept();
    const { encodeChunkFrame } = await import("../nearby/protocol-v1.js");
    channel.receive(encodeChunkFrame({ sequence: 0, offset: 0, bytes: new Uint8Array([1]) }));
    channel.receive(encodeControlMessage({
      version: "NDP1", type: "complete", transferId: TRANSFER_ID, totalBytes: 1, sha256: SHA256,
    }));

    await expect(receiver.result()).rejects.toMatchObject({ code: "FILE_HASH_MISMATCH" });
  });
});
