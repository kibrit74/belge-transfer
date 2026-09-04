import { describe, expect, it, vi } from "vitest";
import {
  confirmNearbyChannelReady,
  createNearbyPeerSession,
} from "../nearby/peer-session.js";

const FP_A = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join(":");
const FP_B = Array.from({ length: 32 }, (_, index) => (255 - index).toString(16).padStart(2, "0")).join(":");
const LOCAL_SDP = `v=0\r\na=fingerprint:sha-256 ${FP_A}\r\n`;
const REMOTE_SDP = `v=0\r\na=fingerprint:sha-256 ${FP_B}\r\n`;

class FakeChannel extends EventTarget {
  constructor() {
    super();
    this.readyState = "connecting";
  }

  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  close = vi.fn(() => {
    this.readyState = "closed";
  });
}

class PairedChannel extends EventTarget {
  readyState = "open";
  peer = null;
  sent = [];

  send(value) {
    this.sent.push(value);
    queueMicrotask(() => {
      this.peer?.dispatchEvent(new MessageEvent("message", { data: value }));
    });
  }
}

class FakePeer extends EventTarget {
  constructor(channel) {
    super();
    this.channel = channel;
    this.localDescription = null;
    this.remoteDescription = null;
  }

  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi.fn(async () => ({ type: "offer", sdp: LOCAL_SDP }));
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: LOCAL_SDP }));
  setLocalDescription = vi.fn(async (description) => {
    this.localDescription = description;
  });
  setRemoteDescription = vi.fn(async (description) => {
    this.remoteDescription = description;
  });
  addIceCandidate = vi.fn(async () => {});
  close = vi.fn();
}

function abortError() {
  return Object.assign(new Error("İptal"), { code: "ABORTED" });
}

describe("Yakındaki Cihazlar WebRTC oturumu", () => {
  it("iki açık veri kanalı karşılıklı READY ve ACK görmeden tamamlanmaz", async () => {
    const host = new PairedChannel();
    const guest = new PairedChannel();
    host.peer = guest;
    guest.peer = host;

    await Promise.all([
      confirmNearbyChannelReady(host),
      confirmNearbyChannelReady(guest),
    ]);

    expect(host.sent).toContain("VDN1|READY");
    expect(host.sent).toContain("VDN1|ACK");
    expect(guest.sent).toContain("VDN1|READY");
    expect(guest.sent).toContain("VDN1|ACK");
  });

  it("host sıralı kanal açar, answer alır ve kanal açılınca bağlanır", async () => {
    const channel = new FakeChannel();
    const peer = new FakePeer(channel);
    const peerFactory = vi.fn(() => peer);
    const signaling = {
      publish: vi.fn(async () => {}),
      poll: vi.fn(async ({ signal, onSignal }) => {
        onSignal({ sequence: 1, kind: "answer", payload: { type: "answer", sdp: REMOTE_SDP } });
        await Promise.resolve();
        channel.open();
        return new Promise((_, reject) => signal.addEventListener("abort", () => reject(abortError()), { once: true }));
      }),
      close: vi.fn(async () => {}),
    };
    const session = createNearbyPeerSession({
      role: "host", code: "ABC234", token: "secret", signaling, peerFactory,
      readyHandshake: vi.fn(async () => {}),
    });

    await expect(session.connect({ timeoutMs: 1000 })).resolves.toBe(channel);
    expect(peerFactory).toHaveBeenCalledWith({ iceServers: [] });
    expect(peer.createDataChannel).toHaveBeenCalledWith("vaultdrop-nearby-v1", { ordered: true });
    expect(signaling.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: "offer" }));
    expect(signaling.close).toHaveBeenCalledTimes(1);
    await expect(session.getVerificationPhrase()).resolves.toMatch(/ · /);
    await session.close();
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(signaling.close).toHaveBeenCalledTimes(1);
  });

  it("kanal açılınca sorguyu durdurur ve READY/ACK sonrasında odayı kapatır", async () => {
    const channel = new FakeChannel();
    const peer = new FakePeer(channel);
    let pollSignal;
    const signaling = {
      publish: vi.fn(async ({ kind }) => {
        if (kind === "offer") channel.open();
      }),
      poll: vi.fn(({ signal }) => {
        pollSignal = signal;
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(abortError()), { once: true }));
      }),
      close: vi.fn(async () => {}),
    };
    const session = createNearbyPeerSession({
      role: "host", code: "ABC234", token: "secret", signaling, peerFactory: () => peer,
      readyHandshake: vi.fn(async () => {}),
    });

    await session.connect({ timeoutMs: 1_000 });

    expect(pollSignal.aborted).toBe(true);
    expect(signaling.close).toHaveBeenCalledTimes(1);
    expect(channel.close).not.toHaveBeenCalled();

    await session.close();
    expect(signaling.close).toHaveBeenCalledTimes(1);
  });

  it("yerel ICE adayını teklif yayınlandıktan sonra gönderir", async () => {
    const channel = new FakeChannel();
    const peer = new FakePeer(channel);
    peer.setLocalDescription = vi.fn(async (description) => {
      peer.localDescription = description;
      peer.onicecandidate?.({ candidate: { candidate: "candidate-local" } });
    });
    const signaling = {
      publish: vi.fn(async ({ kind }) => {
        if (kind === "offer") channel.open();
      }),
      poll: vi.fn(({ signal }) => new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(abortError()), { once: true }))),
      close: vi.fn(async () => {}),
    };
    const session = createNearbyPeerSession({
      role: "host", code: "ABC234", token: "secret", signaling, peerFactory: () => peer,
      readyHandshake: vi.fn(async () => {}),
    });

    await session.connect({ timeoutMs: 1000 });

    expect(signaling.publish.mock.calls.map(([message]) => message.kind)).toEqual(["offer", "ice"]);
    await session.close();
  });

  it("uzak açıklama gelmeden alınan ICE adayını sıraya alıp teklif sonrasında uygular", async () => {
    const channel = new FakeChannel();
    const peer = new FakePeer(channel);
    peer.addIceCandidate = vi.fn(async () => {
      if (!peer.remoteDescription) throw new Error("Uzak açıklama henüz yok");
    });
    const signaling = {
      publish: vi.fn(async () => {}),
      poll: vi.fn(async ({ signal, onSignal }) => {
        await onSignal({ sequence: 1, kind: "ice", payload: { candidate: "candidate-remote" } });
        await onSignal({ sequence: 2, kind: "offer", payload: { type: "offer", sdp: REMOTE_SDP } });
        peer.ondatachannel?.({ channel });
        channel.open();
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(abortError()), { once: true }));
      }),
      close: vi.fn(async () => {}),
    };
    const session = createNearbyPeerSession({
      role: "guest", code: "ABC234", token: "secret", signaling, peerFactory: () => peer,
      readyHandshake: vi.fn(async () => {}),
    });

    await expect(session.connect({ timeoutMs: 1000 })).resolves.toBe(channel);

    expect(peer.setRemoteDescription).toHaveBeenCalledBefore(peer.addIceCandidate);
    expect(peer.addIceCandidate).toHaveBeenCalledWith({ candidate: "candidate-remote" });
    await session.close();
  });

  it("çağıranın verdiği beş dakikalık bağlantı süresi aşılırsa kaynakları kapatır", async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const peer = new FakePeer(channel);
    const signaling = {
      publish: vi.fn(async () => {}),
      poll: vi.fn(({ signal }) => new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(abortError()), { once: true }))),
      close: vi.fn(async () => {}),
    };
    const session = createNearbyPeerSession({
      role: "host", code: "ABC234", token: "secret", signaling, peerFactory: () => peer,
      readyHandshake: vi.fn(async () => {}),
    });

    const pending = expect(session.connect({ timeoutMs: 300_000 }))
      .rejects.toMatchObject({ code: "DIRECT_CONNECTION_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(300_000);
    await pending;
    expect(peer.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("önceden iptal edilmiş bağlantıda peer üretmez", async () => {
    const controller = new AbortController();
    controller.abort();
    const peerFactory = vi.fn();
    const session = createNearbyPeerSession({
      role: "guest", code: "ABC234", token: "secret", signaling: {}, peerFactory,
    });

    await expect(session.connect({ signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    expect(peerFactory).not.toHaveBeenCalled();
  });

  it("polling rate limit hatasını kullanıcı iptali gibi ABORTED koduna dönüştürmez", async () => {
    const channel = new FakeChannel();
    const peer = new FakePeer(channel);
    const rateLimitError = Object.assign(new Error("Çok fazla bağlantı denemesi"), {
      code: "RATE_LIMITED",
      status: 429,
    });
    let rejectPoll;
    const signaling = {
      publish: vi.fn().mockResolvedValue(),
      poll: vi.fn(() => new Promise((_, reject) => {
        rejectPoll = reject;
      })),
      close: vi.fn().mockResolvedValue(),
    };
    const session = createNearbyPeerSession({
      role: "host",
      code: "ABC234",
      token: "secret",
      signaling,
      peerFactory: () => peer,
      readyHandshake: vi.fn().mockResolvedValue(),
    });

    const connection = session.connect({ timeoutMs: 1_000 });
    await Promise.resolve();
    rejectPoll(rateLimitError);

    await expect(connection).rejects.toBe(rateLimitError);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it("signaling oda kapatma ilk kez başarısız olursa yeniden dener ve başarıdan sonra idempotent kalır", async () => {
    const signaling = {
      close: vi.fn()
        .mockRejectedValueOnce(new Error("Geçici ağ hatası"))
        .mockResolvedValueOnce(),
    };
    const session = createNearbyPeerSession({
      role: "host",
      code: "ABC234",
      token: "secret",
      signaling,
    });

    await session.close();
    expect(signaling.close).toHaveBeenCalledTimes(2);

    await session.close();
    expect(signaling.close).toHaveBeenCalledTimes(2);
  });

  it("signaling kapatma isteği yanıt vermese de oturum kapatmayı sınırlı sürede bitirir", async () => {
    const signaling = { close: vi.fn(() => new Promise(() => {})) };
    const session = createNearbyPeerSession({
      role: "host",
      code: "ABC234",
      token: "secret",
      signaling,
      closeTimeoutMs: 10,
    });

    const outcome = await Promise.race([
      session.close().then(() => "closed"),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 100)),
    ]);

    expect(outcome).toBe("closed");
    expect(signaling.close).toHaveBeenCalledTimes(2);
  });
});
