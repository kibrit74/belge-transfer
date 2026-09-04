import { describe, expect, it, vi } from "vitest";
import { createRepositories } from "../repositories.js";

describe("transfer repositories", () => {
  it("kullanıcıyı Google kimliğiyle güvenli parametreler kullanarak günceller", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "user-1" }] });
    const repositories = createRepositories(query);

    await repositories.upsertGoogleUser({
      googleSubject: "google-123",
      email: "kullanici@example.com",
      displayName: "VaultDrop Kullanıcısı",
      avatarUrl: "https://example.com/avatar.png",
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (google_subject)");
    expect(query.mock.calls[0][1]).toEqual([
      "google-123",
      "kullanici@example.com",
      "VaultDrop Kullanıcısı",
      "https://example.com/avatar.png",
    ]);
  });

  it("transfer geçmişine dosya adı ve içerik göndermeden özet kaydeder", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "batch-1" }] })
      .mockResolvedValue({ rows: [] });
    const repositories = createRepositories(query);

    await repositories.recordTransfer({
      userId: "user-1",
      method: "secure_package",
      direction: "send",
      status: "completed",
      startedAt: "2026-08-09T10:00:00.000Z",
      completedAt: "2026-08-09T10:00:02.000Z",
      items: [
        { sizeBytes: 1200 },
        { sizeBytes: 800 },
      ],
    });

    expect(query).toHaveBeenCalledTimes(3);
    const allParameters = query.mock.calls.flatMap((call) => call[1] ?? []);
    expect(allParameters).not.toContain("dava-dosyasi.pdf");
    expect(allParameters).not.toContain(expect.any(Uint8Array));
    expect(query.mock.calls[0][1]).toContain(2);
    expect(query.mock.calls[0][1]).toContain(2000);
    const allSql = query.mock.calls.map((call) => call[0]).join("\n");
    const serializedParameters = JSON.stringify(query.mock.calls.map((call) => call[1]));
    expect(allSql).not.toMatch(/\bextension\b/i);
    expect(serializedParameters).not.toContain('"extension"');
    expect(serializedParameters).not.toContain(".pdf");
  });

  it("gönderimi aktif aylık kota içinde atomik olarak rezerve eder", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "reservation-1" }] });
    const repositories = createRepositories(query);

    await expect(repositories.reserveTransfer({
      userId: "user-1",
      method: "secure_package",
      items: [{ sizeBytes: 1024 }],
      startedAt: "2026-08-09T10:00:00.000Z",
    })).resolves.toEqual({ id: "reservation-1" });

    expect(query.mock.calls[0][0]).toContain("status = 'pending'");
    expect(query.mock.calls[0][0]).toContain("reservation_expires_at > NOW()");
    expect(query.mock.calls[0][1].join(" ")).not.toContain("dava-dosyasi.pdf");
    expect(query.mock.calls[0][0]).toContain("monthly_limit_override_bytes");
    expect(query.mock.calls[0][0]).toContain("COALESCE");
    const allSql = query.mock.calls.map((call) => call[0]).join("\n");
    const allParameters = JSON.stringify(query.mock.calls.map((call) => call[1]));
    expect(allSql).not.toMatch(/\bextension\b/i);
    expect(allParameters).not.toContain('"extension"');
    expect(allParameters).not.toContain(".pdf");
  });

  it("boş rezervasyon sonucunu kota aşımı olarak bildirir", async () => {
    const repositories = createRepositories(vi.fn().mockResolvedValue({ rows: [] }));

    await expect(repositories.reserveTransfer({
      userId: "user-1",
      method: "qr_video",
      items: [{ sizeBytes: 1024 }],
      startedAt: "2026-08-09T10:00:00.000Z",
    })).resolves.toBeNull();
  });

  it("yalnız kullanıcının aktif rezervasyonunu tamamlar", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "reservation-1", status: "completed" }] });
    const repositories = createRepositories(query);

    await expect(repositories.finalizeTransfer({
      userId: "user-1",
      transferId: "reservation-1",
      status: "completed",
      completedAt: "2026-08-09T10:00:02.000Z",
    })).resolves.toEqual({ id: "reservation-1", status: "completed" });

    expect(query.mock.calls[0][0]).toContain("status = 'pending'");
    expect(query.mock.calls[0][0]).toContain("reservation_expires_at > NOW()");
  });

  it("aynı kullanıcıdaki aynı kesinleşmiş rezervasyonu idempotent olarak döndürür", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "transfer-1", status: "completed" }] });
    const repositories = createRepositories(query);

    await expect(repositories.finalizeTransfer({
      userId: "user-1",
      transferId: "transfer-1",
      status: "completed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    })).resolves.toEqual({ id: "transfer-1", status: "completed" });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND user_id = $2 AND status = $3"),
      ["transfer-1", "user-1", "completed"],
    );
  });

  it("SQL deposunda terminal aktarım durumunu başka terminal duruma çevirmeyi denemez", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repositories = createRepositories(query);

    await expect(repositories.finalizeTransfer({
      userId: "user-1",
      transferId: "transfer-1",
      status: "failed",
      completedAt: new Date("2026-08-09T10:00:02.000Z"),
    })).resolves.toBeNull();

    expect(query.mock.calls[0][0]).not.toContain("status = 'completed' AND $3 = 'failed'");
    expect(query.mock.calls[0][0]).toContain("status = 'pending'");
  });

  it("aynı kullanıcının aylık rezervasyonunu işlem içi kilitten sonra hesaplar", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "reservation-1" }] }),
      release: vi.fn(),
    };
    const query = Object.assign(vi.fn(), {
      connect: vi.fn().mockResolvedValue(client),
    });
    const repositories = createRepositories(query);

    await expect(repositories.reserveTransfer({
      userId: "user-1",
      method: "secure_package",
      items: [{ sizeBytes: 1024 }],
      startedAt: "2026-08-09T10:00:00.000Z",
    })).resolves.toEqual({ id: "reservation-1" });

    expect(query).not.toHaveBeenCalled();
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining([
      "BEGIN",
      "COMMIT",
      expect.stringContaining("pg_advisory_xact_lock"),
    ]));
    const lockIndex = client.query.mock.calls.findIndex(([sql]) => sql.includes("pg_advisory_xact_lock"));
    const reservationIndex = client.query.mock.calls.findIndex(([sql]) => sql.includes("WITH account AS"));
    expect(lockIndex).toBeGreaterThan(0);
    expect(reservationIndex).toBeGreaterThan(lockIndex);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("eşzamanlı kilitleri kullanıcı ve UTC ay anahtarına göre ayırır", async () => {
    const usedBytes = new Map();
    const lockQueues = new Map();
    let firstUserReachedReservation;
    const firstUserAtReservation = new Promise((resolve) => { firstUserReachedReservation = resolve; });
    let continueFirstUser;
    const firstUserBarrier = new Promise((resolve) => { continueFirstUser = resolve; });
    const createClient = () => {
      let releaseLock = null;
      let lockKey = null;
      return {
        query: vi.fn(async (sql, parameters = []) => {
          if (sql.includes("pg_advisory_xact_lock")) {
            lockKey = `${parameters[0]}:2026-08`;
            const previousLock = lockQueues.get(lockKey) ?? Promise.resolve();
            lockQueues.set(lockKey, new Promise((resolve) => { releaseLock = resolve; }));
            await previousLock;
            return { rows: [] };
          }
          if (sql.includes("WITH account AS")) {
            if (parameters[0] === "user-1" && !usedBytes.has(lockKey)) {
              firstUserReachedReservation();
              await firstUserBarrier;
            }
            const currentUsage = usedBytes.get(lockKey) ?? 0;
            const requestedBytes = parameters[4];
            if (currentUsage + requestedBytes > 10) return { rows: [] };
            usedBytes.set(lockKey, currentUsage + requestedBytes);
            return { rows: [{ id: `reservation-${parameters[0]}-${currentUsage + requestedBytes}` }] };
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") releaseLock?.();
          return { rows: [] };
        }),
        release: vi.fn(),
      };
    };
    const query = Object.assign(vi.fn(), {
      connect: vi.fn(async () => createClient()),
    });
    const repositories = createRepositories(query);
    const request = (userId) => repositories.reserveTransfer({
      userId,
      method: "secure_package",
      items: [{ sizeBytes: 6 }],
      startedAt: "2026-08-09T10:00:00.000Z",
    });

    const firstUserRequest = request("user-1");
    const competingFirstUserRequest = request("user-1");
    await firstUserAtReservation;
    await expect(request("user-2"))
      .resolves.toEqual({ id: "reservation-user-2-6" });
    continueFirstUser();

    await expect(Promise.all([firstUserRequest, competingFirstUserRequest]))
      .resolves.toEqual([{ id: "reservation-user-1-6" }, null]);
    expect(usedBytes.get("user-1:2026-08")).toBe(6);
    expect(usedBytes.get("user-2:2026-08")).toBe(6);
  });
});
