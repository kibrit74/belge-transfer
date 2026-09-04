import { describe, expect, it } from "vitest";
import { createRuntimeRepositories } from "../runtime.js";

describe("API çalışma zamanı", () => {
  it("üretimde DATABASE_URL yoksa geçici bellek deposuna sessizce düşmez", () => {
    expect(() => createRuntimeRepositories({ databaseUrl: "", isProduction: true }))
      .toThrow("Üretim ortamında DATABASE_URL zorunludur.");
  });

  it("DATABASE_URL olmadan bellek deposuyla API'nin başlamasına izin verir", async () => {
    const repositories = createRuntimeRepositories({ databaseUrl: "", isProduction: false });

    await expect(repositories.findUserBySessionHash("hash")).resolves.toBeNull();
    await expect(repositories.listTransfers("user-1")).resolves.toEqual([]);
  });

  it("geliştirme bellek deposunda admin listesi, kısıt ve audit akışını çalıştırır", async () => {
    const repositories = createRuntimeRepositories({ databaseUrl: "", isProduction: false });
    const actor = await repositories.upsertGoogleUser({
      googleSubject: "admin", email: "admin@example.com", displayName: "Admin", avatarUrl: null,
    });
    actor.role = "admin";
    const target = await repositories.upsertGoogleUser({
      googleSubject: "target", email: "target@example.com", displayName: "Target", avatarUrl: null,
    });

    await expect(repositories.listAdminUsers({ search: "target" }))
      .resolves.toMatchObject({ total: 1, users: [{ id: target.id }] });
    await repositories.updateUserRestriction({
      actor, targetUserId: target.id, status: "suspended",
      restrictedUntil: new Date("2026-08-25T12:00:00Z"), reason: "Test kısıtı", transfersBlocked: true,
    });

    await expect(repositories.getAdminUser(target.id)).resolves.toMatchObject({ status: "suspended" });
    await expect(repositories.listAuditLogs()).resolves.toMatchObject({
      logs: [expect.objectContaining({ actor_email: "admin@example.com", action: "USER_RESTRICTION_CHANGED" })],
    });
  });

  it("yeni Free kullanıcının aylık kotasını rezerve eder ve başarısız işlemde serbest bırakır", async () => {
    const repositories = createRuntimeRepositories({ databaseUrl: "" });
    const user = await repositories.upsertGoogleUser({
      googleSubject: "google-1",
      email: "uye@example.com",
      displayName: "Üye",
      avatarUrl: null,
    });
    const tenMiB = 10 * 1024 * 1024;

    const reservation = await repositories.reserveTransfer({
      userId: user.id,
      method: "secure_package",
      items: [{ extension: "bin", sizeBytes: tenMiB }],
      startedAt: new Date().toISOString(),
    });
    expect(reservation).toEqual({ id: expect.any(String) });
    await expect(repositories.reserveTransfer({
      userId: user.id,
      method: "secure_package",
      items: [{ extension: "bin", sizeBytes: 1 }],
      startedAt: new Date().toISOString(),
    })).resolves.toBeNull();

    await repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "failed",
      completedAt: new Date().toISOString(),
    });
    await expect(repositories.reserveTransfer({
      userId: user.id,
      method: "secure_package",
      items: [{ extension: "bin", sizeBytes: 1 }],
      startedAt: new Date().toISOString(),
    })).resolves.toEqual({ id: expect.any(String) });
  });

  it("aynı rezervasyonu aynı durumla ikinci kez kesinleştirince ilk sonucu döndürür", async () => {
    const repositories = createRuntimeRepositories({ databaseUrl: "" });
    const user = await repositories.upsertGoogleUser({
      googleSubject: "google-2",
      email: "uye2@example.com",
      displayName: "Üye 2",
      avatarUrl: null,
    });
    const reservation = await repositories.reserveTransfer({
      userId: user.id,
      method: "secure_package",
      items: [{ sizeBytes: 1 }],
      startedAt: "2026-08-09T10:00:00.000Z",
    });
    const completedAt = new Date("2026-08-09T10:00:02.000Z");

    const first = await repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "completed",
      completedAt,
    });
    const second = await repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "completed",
      completedAt,
    });

    expect(first).toMatchObject({ id: reservation.id, status: "completed" });
    expect(second).toEqual(first);
  });

  it("terminal rezervasyon durumlarını tek yönlü ve aynı durumda idempotent tutar", async () => {
    const repositories = createRuntimeRepositories({ databaseUrl: "" });
    const user = await repositories.upsertGoogleUser({
      googleSubject: "google-3",
      email: "uye3@example.com",
      displayName: "Üye 3",
      avatarUrl: null,
    });
    const tenMiB = 10 * 1024 * 1024;
    const reservation = await repositories.reserveTransfer({
      userId: user.id,
      method: "secure_package",
      items: [{ sizeBytes: tenMiB }],
      startedAt: "2026-08-09T10:00:00.000Z",
    });

    await expect(repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "completed",
      completedAt: "2026-08-09T10:00:02.000Z",
    })).resolves.toMatchObject({ id: reservation.id, status: "completed" });
    await expect(repositories.reserveTransfer({
      userId: user.id,
      method: "secure_package",
      items: [{ sizeBytes: 1 }],
      startedAt: "2026-08-09T10:00:03.000Z",
    })).resolves.toBeNull();

    const cancelled = await repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "failed",
      completedAt: "2026-08-09T10:00:04.000Z",
    });
    const repeatedCompletion = await repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "completed",
      completedAt: "2026-08-09T10:00:05.000Z",
    });

    expect(cancelled).toBeNull();
    expect(repeatedCompletion).toEqual({ id: reservation.id, status: "completed" });
    await expect(repositories.reserveTransfer({
      userId: user.id,
      method: "secure_package",
      items: [{ sizeBytes: tenMiB }],
      startedAt: "2026-08-09T10:00:06.000Z",
    })).resolves.toBeNull();
  });

  it("başarısız terminal rezervasyonu sonradan tamamlanmış duruma çevirmeyi reddeder", async () => {
    const repositories = createRuntimeRepositories({ databaseUrl: "" });
    const user = await repositories.upsertGoogleUser({
      googleSubject: "google-4",
      email: "uye4@example.com",
      displayName: "Üye 4",
      avatarUrl: null,
    });
    const reservation = await repositories.reserveTransfer({
      userId: user.id,
      method: "nearby",
      items: [{ sizeBytes: 1 }],
      startedAt: "2026-08-09T10:00:00.000Z",
    });

    await expect(repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "failed",
      completedAt: "2026-08-09T10:00:01.000Z",
    })).resolves.toMatchObject({ id: reservation.id, status: "failed" });
    await expect(repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "completed",
      completedAt: "2026-08-09T10:00:02.000Z",
    })).resolves.toBeNull();
    await expect(repositories.finalizeTransfer({
      userId: user.id,
      transferId: reservation.id,
      status: "failed",
      completedAt: "2026-08-09T10:00:03.000Z",
    })).resolves.toMatchObject({ id: reservation.id, status: "failed" });
  });
});
