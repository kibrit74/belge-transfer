import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";

const adminUser = {
  id: "admin-1",
  email: "admin@example.com",
  display_name: "Admin",
  plan: "free",
  role: "admin",
  status: "active",
  transfers_blocked: false,
};

function createTestApp({ user = null, repositories: overrides = {} } = {}) {
  const repositories = {
    findUserBySessionHash: vi.fn().mockResolvedValue(user),
    getAdminDashboard: vi.fn().mockResolvedValue({ total_users: 12 }),
    listAdminUsers: vi.fn().mockResolvedValue({ users: [], total: 0, page: 1, pageSize: 20 }),
    getAdminUser: vi.fn().mockResolvedValue(null),
    updateUserRestriction: vi.fn().mockResolvedValue({ id: "user-2", status: "banned" }),
    updateUserLimit: vi.fn().mockResolvedValue({ id: "user-2", monthly_limit_override_bytes: 52428800 }),
    listAdminTransactions: vi.fn().mockResolvedValue({ transactions: [], total: 0, page: 1, pageSize: 20 }),
    listSystemLogs: vi.fn().mockResolvedValue({ logs: [], page: 1, pageSize: 50 }),
    listAuditLogs: vi.fn().mockResolvedValue({ logs: [], page: 1, pageSize: 50 }),
    reserveTransfer: vi.fn().mockResolvedValue({ id: "reservation-1" }),
    ...overrides,
  };
  return {
    repositories,
    app: createApp({
      config: {
        frontendOrigin: "http://localhost:5173",
        sessionCookieName: "vaultdrop_session",
        isProduction: false,
      },
      repositories,
    }),
  };
}

function mutate(app, path, body) {
  return request(app)
    .patch(path)
    .set("Origin", "http://localhost:5173")
    .set("X-VaultDrop-Request", "1")
    .set("Cookie", "vaultdrop_session=test-token")
    .send(body);
}

describe("admin API enforcement", () => {
  it("oturumsuz dashboard isteğini 401 ile reddeder", async () => {
    const { app } = createTestApp();

    const response = await request(app).get("/api/admin/dashboard");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("AUTH_REQUIRED");
  });

  it("analyst rolünün kullanıcı listesini görmesini 403 ile reddeder", async () => {
    const { app } = createTestApp({ user: { ...adminUser, role: "analyst" } });

    const response = await request(app)
      .get("/api/admin/users")
      .set("Cookie", "vaultdrop_session=test-token");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("support rolünün kullanıcı listesini görmesine izin verir", async () => {
    const { app, repositories } = createTestApp({ user: { ...adminUser, role: "support" } });

    const response = await request(app)
      .get("/api/admin/users?status=active&page=1")
      .set("Cookie", "vaultdrop_session=test-token");

    expect(response.status).toBe(200);
    expect(repositories.listAdminUsers).toHaveBeenCalledWith(expect.objectContaining({ status: "active", page: 1 }));
  });

  it("support rolünün kullanıcı banlamasını backend'de reddeder", async () => {
    const { app, repositories } = createTestApp({ user: { ...adminUser, role: "support" } });

    const response = await mutate(app, "/api/admin/users/user-2/restriction", {
      status: "banned",
      reason: "Kötüye kullanım",
      transfersBlocked: true,
    });

    expect(response.status).toBe(403);
    expect(repositories.updateUserRestriction).not.toHaveBeenCalled();
  });

  it("admin ban işlemini aktör bilgisiyle repository'ye iletir", async () => {
    const { app, repositories } = createTestApp({ user: adminUser });

    const response = await mutate(app, "/api/admin/users/user-2/restriction", {
      status: "banned",
      reason: "Kötüye kullanım",
      transfersBlocked: true,
    });

    expect(response.status).toBe(200);
    expect(repositories.updateUserRestriction).toHaveBeenCalledWith({
      actor: { id: "admin-1", email: "admin@example.com", role: "admin" },
      targetUserId: "user-2",
      status: "banned",
      restrictedUntil: null,
      reason: "Kötüye kullanım",
      transfersBlocked: true,
    });
  });

  it("banlı kullanıcının doğrudan transfer rezervasyonu oluşturmasını reddeder", async () => {
    const { app, repositories } = createTestApp({ user: { ...adminUser, role: "user", status: "banned" } });

    const response = await request(app)
      .post("/api/transfers/reservations")
      .set("Origin", "http://localhost:5173")
      .set("X-VaultDrop-Request", "1")
      .set("Cookie", "vaultdrop_session=test-token")
      .send({
        method: "secure_package",
        startedAt: "2026-08-24T12:00:00.000Z",
        items: [{ sizeBytes: 12 }],
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ACCOUNT_BANNED");
    expect(repositories.reserveTransfer).not.toHaveBeenCalled();
  });
});
