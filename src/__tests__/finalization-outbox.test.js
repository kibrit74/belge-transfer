import { describe, expect, it, vi } from "vitest";
import {
  createFallbackFinalizationStore,
  createFinalizationOutbox,
  createLocalStorageFinalizationStore,
} from "../transfer/finalization-outbox.js";

function createMemoryStore() {
  const records = new Map();
  const writes = [];
  return {
    async put(record) {
      const copy = structuredClone(record);
      writes.push(copy);
      records.set(copy.key, copy);
    },
    async delete(key) { records.delete(key); },
    async listByUser(userId) {
      return [...records.values()].filter((record) => record.userId === userId);
    },
    values() { return [...records.values()]; },
    writes() { return writes; },
  };
}

describe("kesinleştirme kalıcı kuyruğu", () => {
  it("IndexedDB yazımı reddedilince yalnız izinli alanları localStorage yedeğine yazar", async () => {
    const primary = {
      put: vi.fn().mockRejectedValue(new Error("idb kapalı")),
      delete: vi.fn().mockRejectedValue(new Error("idb kapalı")),
      listByUser: vi.fn().mockRejectedValue(new Error("idb kapalı")),
    };
    const values = new Map();
    const storage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
      removeItem: vi.fn((key) => values.delete(key)),
    };
    const fallback = createLocalStorageFinalizationStore(storage);
    const store = createFallbackFinalizationStore(primary, fallback);
    const outbox = createFinalizationOutbox({ store, finalize: vi.fn().mockResolvedValue(null) });

    await outbox.enqueueAndFlush({
      user: { id: "user-1", token: "yasak-token" }, reservationId: "reservation-1",
      status: "completed", completedAt: new Date("2026-08-09T10:00:02.000Z"),
      keyText: "yasak-anahtar", fileName: "gizli.pdf", content: "yasak-icerik",
    });

    const serialized = [...values.values()].join("");
    expect(JSON.parse(serialized)).toEqual([{
      key: "user-1:reservation-1:completed", userId: "user-1", reservationId: "reservation-1",
      status: "completed", completedAt: "2026-08-09T10:00:02.000Z", attempts: 1,
    }]);
    expect(serialized).not.toContain("yasak-token");
    expect(serialized).not.toContain("yasak-anahtar");
    expect(serialized).not.toContain("gizli.pdf");
    expect(serialized).not.toContain("yasak-icerik");
  });

  it("sunucu kesinleştirmesi başarılı olunca aynı kaydı iki kalıcı depodan da temizler", async () => {
    const primary = createMemoryStore();
    const fallback = createMemoryStore();
    const record = {
      key: "user-1:reservation-1:completed", userId: "user-1", reservationId: "reservation-1",
      status: "completed", completedAt: "2026-08-09T10:00:02.000Z", attempts: 1,
    };
    await primary.put(record);
    await fallback.put(record);
    const outbox = createFinalizationOutbox({
      store: createFallbackFinalizationStore(primary, fallback),
      finalize: vi.fn().mockResolvedValue({ id: "reservation-1", status: "completed" }),
    });

    await outbox.flush({ id: "user-1" });

    expect(primary.values()).toEqual([]);
    expect(fallback.values()).toEqual([]);
  });
  it("başarılı paket kaydını hassas veri olmadan kalıcılaştırır ve başarılı gönderimde siler", async () => {
    const store = createMemoryStore();
    const finalize = vi.fn().mockResolvedValue({ id: "reservation-1", status: "completed" });
    const outbox = createFinalizationOutbox({ store, finalize });

    await expect(outbox.enqueueAndFlush({
      user: { id: "user-1", token: "asla-yazilmaz" },
      reservationId: "reservation-1",
      status: "completed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    })).resolves.toEqual({ id: "reservation-1", status: "completed" });

    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      user: { id: "user-1", token: "asla-yazilmaz" },
      reservationId: "reservation-1",
      status: "completed",
    }));
    expect(store.writes()[0]).toEqual({
      key: "user-1:reservation-1:completed",
      userId: "user-1",
      reservationId: "reservation-1",
      status: "completed",
      completedAt: "2026-08-09T10:00:02.000Z",
      attempts: 0,
    });
    expect(store.values()).toEqual([]);
  });

  it("başarısız kesinleştirmeyi sonraki aynı kullanıcı oturumunda yeniden dener", async () => {
    const store = createMemoryStore();
    const finalize = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "reservation-1", status: "completed" });
    const outbox = createFinalizationOutbox({ store, finalize });

    await outbox.enqueueAndFlush({
      user: { id: "user-1" }, reservationId: "reservation-1", status: "completed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    });
    expect(store.values()).toEqual([{
      key: "user-1:reservation-1:completed",
      userId: "user-1",
      reservationId: "reservation-1",
      status: "completed",
      completedAt: "2026-08-09T10:00:02.000Z",
      attempts: 1,
    }]);

    await outbox.flush({ id: "user-1" });
    expect(store.values()).toEqual([]);
  });

  it("başka kullanıcının kalmış kaydını göndermez", async () => {
    const store = createMemoryStore();
    const finalize = vi.fn().mockResolvedValue({ id: "reservation-1", status: "completed" });
    const outbox = createFinalizationOutbox({ store, finalize });
    await store.put({
      key: "user-1:reservation-1:completed", userId: "user-1", reservationId: "reservation-1",
      status: "completed", completedAt: "2026-08-09T10:00:02.000Z", attempts: 1,
    });

    await outbox.flush({ id: "user-2" });

    expect(finalize).not.toHaveBeenCalled();
    expect(store.values()).toHaveLength(1);
  });
});
