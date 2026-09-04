import { describe, expect, it, vi } from "vitest";
import { createNearbySignalingClient } from "../nearby/signaling-client.js";

const ROOM = { code: "ABC234", token: "secret-token", expiresAt: "2026-08-14T01:00:00.000Z" };

describe("Yakındaki Cihazlar tanıştırma istemcisi", () => {
  it("oda oluşturma ve katılma yanıtını döndürür", async () => {
    const apiRequest = vi.fn()
      .mockResolvedValueOnce(ROOM)
      .mockResolvedValueOnce({ ...ROOM, token: "guest-token" });
    const client = createNearbySignalingClient({ apiRequest });

    await expect(client.createRoom()).resolves.toEqual(ROOM);
    await expect(client.joinRoom("abc234")).resolves.toEqual({ ...ROOM, token: "guest-token" });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/nearby/rooms/ABC234/join", expect.objectContaining({
      method: "POST",
      body: "{}",
    }));
  });

  it("katılma isteğine verilen iptal sinyalini HTTP sınırına taşır", async () => {
    const apiRequest = vi.fn().mockResolvedValue(ROOM);
    const client = createNearbySignalingClient({ apiRequest });
    const controller = new AbortController();

    await client.joinRoom("abc234", { signal: controller.signal });

    expect(apiRequest).toHaveBeenCalledWith("/api/nearby/rooms/ABC234/join", {
      method: "POST",
      body: "{}",
      signal: controller.signal,
    });
  });

  it("iptal edilen katılma isteğini ABORTED olarak eşler", async () => {
    const sourceError = new DOMException("İstek iptal edildi", "AbortError");
    const client = createNearbySignalingClient({
      apiRequest: vi.fn().mockRejectedValue(sourceError),
    });

    await expect(client.joinRoom("ABC234", {
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "ABORTED", message: "İşlem iptal edildi." });
  });

  it("tokenı URL veya istek gövdesine koymaz", async () => {
    const apiRequest = vi.fn().mockResolvedValue({ accepted: true });
    const client = createNearbySignalingClient({ apiRequest });

    await client.publish({
      code: ROOM.code,
      token: ROOM.token,
      kind: "ready",
      sequence: 3,
      payload: {},
    });

    const [path, options] = apiRequest.mock.calls[0];
    expect(path).not.toContain(ROOM.token);
    expect(options.body).not.toContain(ROOM.token);
    expect(options.headers).toEqual({ "X-Nearby-Token": ROOM.token });
  });

  it("pollOnce yalnız yeni sıra değerlerini bir kez yayınlar", async () => {
    const apiRequest = vi.fn().mockResolvedValue({
      signals: [
        { sequence: 2, kind: "offer", payload: {} },
        { sequence: 2, kind: "offer", payload: {} },
        { sequence: 3, kind: "ice", payload: {} },
      ],
    });
    const client = createNearbySignalingClient({ apiRequest });
    const seen = [];

    const next = await client.pollOnce({
      code: ROOM.code,
      token: ROOM.token,
      after: 1,
      onSignal: (item) => seen.push(item),
    });

    expect(seen.map((item) => item.sequence)).toEqual([2, 3]);
    expect(next).toBe(3);
  });

  it("önceden iptal edilen sinyalde ağ isteği başlatmaz", async () => {
    const apiRequest = vi.fn();
    const client = createNearbySignalingClient({ apiRequest });
    const controller = new AbortController();
    controller.abort();

    await expect(client.poll({
      code: ROOM.code,
      token: ROOM.token,
      signal: controller.signal,
      onSignal: vi.fn(),
    })).rejects.toMatchObject({ code: "ABORTED" });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("oda sona erdiğinde kullanıcıya anlaşılır hata kodu verir", async () => {
    const sourceError = Object.assign(new Error("Bitti"), { status: 410 });
    const client = createNearbySignalingClient({ apiRequest: vi.fn().mockRejectedValue(sourceError) });

    await expect(client.pollOnce({
      code: ROOM.code,
      token: ROOM.token,
      after: 0,
      onSignal: vi.fn(),
    })).rejects.toMatchObject({ code: "ROOM_EXPIRED", status: 410 });
  });

  it.each(["ROOM_EXPIRED", "ROOM_CANCELLED", "ROOM_ALREADY_JOINED", "RATE_LIMITED"])(
    "sunucunun %s hata kodunu değiştirmeden korur",
    async (code) => {
      const sourceError = Object.assign(new Error("Ham sunucu ayrıntısı"), { code, status: 409 });
      const client = createNearbySignalingClient({ apiRequest: vi.fn().mockRejectedValue(sourceError) });

      await expect(client.joinRoom("ABC234")).rejects.toBe(sourceError);
    },
  );

  it("sunucu kod vermeyen 409 yanıtını ROOM_CONFLICT olarak eşler", async () => {
    const sourceError = Object.assign(new Error("Çakışma ayrıntısı"), { status: 409 });
    const client = createNearbySignalingClient({ apiRequest: vi.fn().mockRejectedValue(sourceError) });

    await expect(client.joinRoom("ABC234")).rejects.toMatchObject({
      code: "ROOM_CONFLICT",
      status: 409,
    });
  });

  it("poll ilk geçici hatadan sonra yeniden dener ve iptalde durur", async () => {
    const controller = new AbortController();
    const apiRequest = vi.fn()
      .mockRejectedValueOnce(new Error("Geçici ağ hatası"))
      .mockResolvedValueOnce({ signals: [{ sequence: 1, kind: "ready", payload: {} }] });
    const client = createNearbySignalingClient({ apiRequest, pollIntervalMs: 1 });
    const seen = [];

    await expect(client.poll({
      code: ROOM.code,
      token: ROOM.token,
      after: 0,
      signal: controller.signal,
      onSignal(item) {
        seen.push(item);
        controller.abort();
      },
    })).rejects.toMatchObject({ code: "ABORTED" });

    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(seen).toHaveLength(1);
  });

  it("odayı doğru token başlığıyla kapatır", async () => {
    const apiRequest = vi.fn().mockResolvedValue(null);
    const client = createNearbySignalingClient({ apiRequest });

    await client.close(ROOM);

    expect(apiRequest).toHaveBeenCalledWith("/api/nearby/rooms/ABC234", {
      method: "DELETE",
      headers: { "X-Nearby-Token": ROOM.token },
      signal: expect.any(AbortSignal),
    });
  });

  it("yanıt vermeyen DELETE isteğini timeout sinyaliyle sınırlar", async () => {
    const apiRequest = vi.fn((_path, options) => new Promise((_, reject) => {
      options.signal?.addEventListener("abort", () => {
        reject(new DOMException("İstek iptal edildi", "AbortError"));
      }, { once: true });
    }));
    const client = createNearbySignalingClient({ apiRequest });

    const outcome = await Promise.race([
      client.close({ ...ROOM, timeoutMs: 10 }).catch((error) => error.code),
      new Promise((resolve) => setTimeout(() => resolve("HUNG"), 100)),
    ]);

    expect(outcome).toBe("ABORTED");
    expect(apiRequest.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(apiRequest.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
