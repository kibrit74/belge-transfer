import { describe, expect, it, vi } from "vitest";
import { createAdminRepositories } from "../admin/repositories.js";

describe("admin repository", () => {
  it("sistem hatasını içerik taşımayan parametreli log olarak yazar", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "log-1" }] });
    const repositories = createAdminRepositories(query);

    await repositories.createSystemLog({
      level: "error", category: "API", message: "İşlem tamamlanamadı",
      errorCode: "UNEXPECTED_ERROR", userId: "user-1", transferId: null,
      metadata: { method: "POST", path: "/api/transfers" },
    });

    expect(query.mock.calls[0][0]).toContain("INSERT INTO system_logs");
    expect(query.mock.calls[0][1]).toEqual([
      "error", "API", "İşlem tamamlanamadı", "UNEXPECTED_ERROR", "user-1", null,
      JSON.stringify({ method: "POST", path: "/api/transfers" }),
    ]);
  });

  it("kullanıcı listesini parametreli arama ve durum filtresiyle getirir", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "user-1" }] });
    const repositories = createAdminRepositories(query);

    await expect(repositories.listAdminUsers({
      search: "üye@example.com",
      status: "active",
      role: null,
      page: 1,
      pageSize: 20,
    })).resolves.toEqual({ users: [{ id: "user-1" }], total: 1, page: 1, pageSize: 20 });

    expect(query.mock.calls[0][0]).toContain("COUNT(*) OVER()");
    expect(query.mock.calls[0][1]).toContain("%üye@example.com%");
    expect(query.mock.calls[0][1]).toContain("active");
  });

  it("kullanıcı kısıtını ve audit kaydını aynı işlemde yazar", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "target", role: "user", status: "active" }] })
        .mockResolvedValueOnce({ rows: [{ id: "target", role: "user", status: "suspended" }] })
        .mockResolvedValueOnce({ rows: [{ id: "audit-1" }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    const query = Object.assign(vi.fn(), { connect: vi.fn().mockResolvedValue(client) });
    const repositories = createAdminRepositories(query);

    const result = await repositories.updateUserRestriction({
      actor: { id: "admin-1", email: "admin@example.com", role: "admin" },
      targetUserId: "target",
      status: "suspended",
      restrictedUntil: new Date("2026-08-25T12:00:00.000Z"),
      reason: "Aşırı kullanım",
      transfersBlocked: true,
    });

    expect(result.status).toBe("suspended");
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("FOR UPDATE"),
      expect.stringContaining("UPDATE users"),
      expect.stringContaining("INSERT INTO admin_audit_logs"),
      "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("super admin hedefini kısıtlamayı reddeder ve işlemi geri alır", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "root", role: "super_admin", status: "active" }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    const query = Object.assign(vi.fn(), { connect: vi.fn().mockResolvedValue(client) });
    const repositories = createAdminRepositories(query);

    await expect(repositories.updateUserRestriction({
      actor: { id: "admin-1", email: "admin@example.com", role: "admin" },
      targetUserId: "root",
      status: "banned",
      restrictedUntil: null,
      reason: "Geçersiz deneme",
      transfersBlocked: true,
    })).rejects.toMatchObject({ code: "PROTECTED_ADMIN" });

    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("support rolünün mevcut banı kaldırmasını kilitli kayıt üzerinde reddeder", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "target", role: "user", status: "banned" }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    const query = Object.assign(vi.fn(), { connect: vi.fn().mockResolvedValue(client) });
    const repositories = createAdminRepositories(query);

    await expect(repositories.updateUserRestriction({
      actor: { id: "support-1", email: "support@example.com", role: "support" },
      targetUserId: "target", status: "active", restrictedUntil: null,
      reason: "Banı kaldırma denemesi", transfersBlocked: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
