import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/client.js";
import {
  buildTransferPayload,
  createTransferCompletion,
  finalizeTransferActivity,
  reserveTransferActivity,
} from "../transfer/activity-client.js";

vi.mock("../api/client.js", () => ({ apiRequest: vi.fn() }));

describe("işlem geçmişi verisi", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    vi.unstubAllEnvs();
  });

  it("dosya adını ve içeriğini dışarı çıkarmaz", () => {
    const payload = buildTransferPayload({
      method: "secure_package",
      direction: "send",
      status: "completed",
      startedAt: new Date("2026-08-09T10:00:00.000Z"),
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
      files: [new File(["gizli"], "dava.dosyasi.PDF")],
    });

    expect(payload.items).toEqual([{ sizeBytes: 5 }]);
    expect(JSON.stringify(payload)).not.toContain("dava.dosyasi.PDF");
    expect(JSON.stringify(payload)).not.toContain('"extension"');
    expect(JSON.stringify(payload)).not.toContain("gizli");
  });

  it("giriş yapan kullanıcı için üretim varsayılanında aylık kota rezervasyonu ister", async () => {
    apiRequest.mockResolvedValue({ id: "reservation-1" });
    const startedAt = new Date("2026-08-09T10:00:00.000Z");
    await expect(reserveTransferActivity({
      user: { id: "user-1" },
      method: "secure_package",
      files: [new File(["x"], "belge.pdf")],
      startedAt,
    })).resolves.toEqual({ id: "reservation-1" });
    expect(apiRequest).toHaveBeenCalledWith("/api/transfers/reservations", expect.objectContaining({ method: "POST" }));
  });

  it("giriş yapan kullanıcıda kota API'sine erişilemezse paketi başlatmadan hatayı iletir", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Kota servisine ulaşılamadı."));
    await expect(reserveTransferActivity({
      user: { id: "user-1" },
      method: "secure_package",
      files: [new File(["x"], "belge.pdf")],
      startedAt: new Date("2026-08-09T10:00:00.000Z"),
    })).rejects.toThrow("Kota servisine ulaşılamadı.");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("misafir için sunucu rezervasyonu oluşturmaz", async () => {
    await expect(reserveTransferActivity({ user: null, method: "qr_video", files: [], startedAt: new Date() }))
      .resolves.toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("yerel kalıcı depolar yazılamazsa doğrudan sunucu başarısıyla devam eder", async () => {
    const directFinalize = vi.fn().mockResolvedValue({ id: "reservation-1", status: "completed" });
    const complete = createTransferCompletion({
      outbox: { enqueueAndFlush: vi.fn().mockRejectedValue(new Error("depolar kapalı")) },
      finalize: directFinalize,
    });
    await expect(complete({
      user: { id: "user-1" }, reservationId: "reservation-1", status: "completed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    })).resolves.toEqual({ id: "reservation-1", status: "completed" });
  });

  it("yerel kalıcı depolar ve doğrudan sunucu başarısızsa güvence hatası verir", async () => {
    const complete = createTransferCompletion({
      outbox: { enqueueAndFlush: vi.fn().mockRejectedValue(new Error("depolar kapalı")) },
      finalize: vi.fn().mockResolvedValue(null),
    });
    await expect(complete({
      user: { id: "user-1" }, reservationId: "reservation-1", status: "completed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    })).rejects.toMatchObject({ code: "FINALIZATION_NOT_SECURED" });
  });

  it("rezervasyonu belirtilen durumla kapatır", async () => {
    apiRequest.mockResolvedValue({ id: "reservation-1", status: "completed" });
    await finalizeTransferActivity({
      user: { id: "user-1" },
      reservationId: "reservation-1",
      status: "completed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    });
    expect(apiRequest).toHaveBeenCalledWith("/api/transfers/reservation-1", expect.objectContaining({ method: "PATCH" }));
  });

  it("kota kesinleştirmeyi geçici ağ hatasında yeniden dener", async () => {
    apiRequest
      .mockRejectedValueOnce(new Error("geçici ağ"))
      .mockResolvedValueOnce({ id: "transfer-1", status: "completed" });

    await expect(finalizeTransferActivity({
      user: { id: "user-1" },
      reservationId: "transfer-1",
      status: "completed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    })).resolves.toEqual({ id: "transfer-1", status: "completed" });
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it("kota kesinleştirmesi üç başarısız denemeden sonra durur", async () => {
    apiRequest.mockRejectedValue(new Error("geçici ağ"));

    await expect(finalizeTransferActivity({
      user: { id: "user-1" },
      reservationId: "transfer-1",
      status: "completed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    })).resolves.toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });

});
