import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";

function createTestApp(overrides = {}) {
  const repositories = {
    upsertGoogleUser: vi.fn(),
    findUserBySessionHash: vi.fn().mockResolvedValue(null),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    recordTransfer: vi.fn().mockResolvedValue({ id: "transfer-1" }),
    reserveTransfer: vi.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" }),
    finalizeTransfer: vi.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", status: "completed" }),
    getProfileSummary: vi.fn(),
    listTransfers: vi.fn(),
    ...overrides.repositories,
  };
  const app = createApp({
    config: {
      frontendOrigin: "http://localhost:5173",
      sessionCookieName: "vaultdrop_session",
      isProduction: false,
      ...overrides.config,
    },
    repositories,
    verifyNeonToken: overrides.verifyNeonToken,
  });
  return { app, repositories };
}

describe("auth ve transfer API", () => {
  it("oturumu olmayan kullanıcıyı misafir olarak döndürür", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/api/auth/session");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: null });
  });

  it("Google ayarı eksikse kullanıcıyı hata sayfasına geri yönlendirir", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/api/auth/google/start");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:5173/giris?error=config");
  });

  it("giriş gerektiren işlem geçmişini misafire kapatır", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/api/profile/transfers");

    expect(response.status).toBe(401);
  });

  it("dosya adı gibi yasak alanları transfer kaydından çıkarır", async () => {
    const { app, repositories } = createTestApp({
      repositories: {
        findUserBySessionHash: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "user@example.com",
          display_name: "Test User",
          avatar_url: null,
          plan: "member",
        }),
      },
    });

    const response = await request(app)
      .post("/api/transfers")
      .set("Origin", "http://localhost:5173")
      .set("X-VaultDrop-Request", "1")
      .set("Cookie", "vaultdrop_session=raw-session-token")
      .send({
        method: "secure_package",
        direction: "receive",
        status: "completed",
        startedAt: "2026-08-09T10:00:00.000Z",
        completedAt: "2026-08-09T10:00:02.000Z",
        items: [{
          extension: "pdf",
          sizeBytes: 1200,
          name: "gizli-dosya.pdf",
          type: "application/pdf",
        }],
      });

    expect(response.status).toBe(201);
    expect(repositories.recordTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        items: [{ sizeBytes: 1200 }],
      }),
    );
    const calls = JSON.stringify(repositories.recordTransfer.mock.calls);
    expect(calls).not.toContain("gizli-dosya.pdf");
    expect(calls).not.toContain("application/pdf");
    expect(calls).not.toContain('"extension"');
  });

  it("gönderimi kota içinde rezerve eder", async () => {
    const { app, repositories } = createTestApp({
      repositories: { findUserBySessionHash: vi.fn().mockResolvedValue({ id: "user-1", plan: "standard" }) },
    });
    const response = await request(app)
      .post("/api/transfers/reservations")
      .set("Origin", "http://localhost:5173")
      .set("X-VaultDrop-Request", "1")
      .set("Cookie", "vaultdrop_session=raw-session-token")
      .send({
        method: "secure_package",
        startedAt: "2026-08-09T10:00:00.000Z",
        items: [{ extension: "pdf", sizeBytes: 1024 }],
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: "11111111-1111-4111-8111-111111111111" });
    expect(repositories.reserveTransfer).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
  });

  it("aylık kota aşımını güvenli kodla reddeder", async () => {
    const { app } = createTestApp({
      repositories: {
        findUserBySessionHash: vi.fn().mockResolvedValue({ id: "user-1", plan: "standard" }),
        reserveTransfer: vi.fn().mockResolvedValue(null),
      },
    });
    const response = await request(app)
      .post("/api/transfers/reservations")
      .set("Origin", "http://localhost:5173")
      .set("X-VaultDrop-Request", "1")
      .set("Cookie", "vaultdrop_session=raw-session-token")
      .send({ method: "nearby", startedAt: "2026-08-09T10:00:00.000Z", items: [{ extension: "bin", sizeBytes: 1 }] });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("MONTHLY_QUOTA_EXCEEDED");
  });

  it("aktif rezervasyonu tamamlar", async () => {
    const { app, repositories } = createTestApp({
      repositories: { findUserBySessionHash: vi.fn().mockResolvedValue({ id: "user-1", plan: "standard" }) },
    });
    const response = await request(app)
      .patch("/api/transfers/11111111-1111-4111-8111-111111111111")
      .set("Origin", "http://localhost:5173")
      .set("X-VaultDrop-Request", "1")
      .set("Cookie", "vaultdrop_session=raw-session-token")
      .send({ status: "completed", completedAt: "2026-08-09T10:00:02.000Z" });

    expect(response.status).toBe(200);
    expect(repositories.finalizeTransfer).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
  });

  it("aynı kesinleştirme isteğini tekrar alınca her ikisinde de başarılı yanıt verir", async () => {
    const { app, repositories } = createTestApp({
      repositories: {
        findUserBySessionHash: vi.fn().mockResolvedValue({ id: "user-1", plan: "standard" }),
        finalizeTransfer: vi.fn().mockResolvedValue({
          id: "11111111-1111-4111-8111-111111111111",
          status: "completed",
        }),
      },
    });
    const patch = () => request(app)
      .patch("/api/transfers/11111111-1111-4111-8111-111111111111")
      .set("Origin", "http://localhost:5173")
      .set("X-VaultDrop-Request", "1")
      .set("Cookie", "vaultdrop_session=raw-session-token")
      .send({ status: "completed", completedAt: "2026-08-09T10:00:02.000Z" });

    await expect(patch()).resolves.toMatchObject({ status: 200 });
    await expect(patch()).resolves.toMatchObject({ status: 200 });
    expect(repositories.finalizeTransfer).toHaveBeenCalledTimes(2);
  });

  it("doğrudan gönderim kaydıyla aylık kotanın atlanmasını engeller", async () => {
    const { app } = createTestApp({
      repositories: { findUserBySessionHash: vi.fn().mockResolvedValue({ id: "user-1", plan: "standard" }) },
    });
    const response = await request(app)
      .post("/api/transfers")
      .set("Origin", "http://localhost:5173")
      .set("X-VaultDrop-Request", "1")
      .set("Cookie", "vaultdrop_session=raw-session-token")
      .send({ method: "secure_package", direction: "send", status: "completed", startedAt: "2026-08-09T10:00:00.000Z", items: [{ extension: "pdf", sizeBytes: 1 }] });

    expect(response.status).toBe(400);
  });

  it("kaynak ve özel başlık doğrulanmadan değişiklik isteğini reddeder", async () => {
    const { app } = createTestApp();
    const response = await request(app).post("/api/auth/logout");

    expect(response.status).toBe(403);
  });

  it("email taşımayan doğrulanmış Neon JWT ile aktarım rezervasyonu oluşturur", async () => {
    const user = { id: "user-1", plan: "free" };
    const { app, repositories } = createTestApp({
      config: {
        neonAuthBaseUrl: "https://auth.example.com/neondb/auth",
        neonAuthJwksUrl: "https://auth.example.com/neondb/auth/.well-known/jwks.json",
      },
      verifyNeonToken: vi.fn().mockResolvedValue({
        sub: "neon-user-1",
        role: "authenticated",
      }),
      repositories: {
        upsertGoogleUser: vi.fn().mockResolvedValue(user),
      },
    });

    const response = await request(app)
      .post("/api/transfers/reservations")
      .set("Origin", "http://localhost:5173")
      .set("X-VaultDrop-Request", "1")
      .set("Authorization", "Bearer signed-token")
      .send({
        method: "nearby",
        startedAt: "2026-08-09T10:00:00.000Z",
        items: [{ sizeBytes: 1024 }],
      });

    expect(response.status).toBe(201);
    expect(repositories.upsertGoogleUser).toHaveBeenCalledWith({
      googleSubject: "neon-user-1",
      email: "neon-user-1@neon-auth.local",
      displayName: "VaultDrop Üyesi",
      avatarUrl: null,
    });
    expect(repositories.reserveTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("Neon jetonuyla profil özetine erişir", async () => {
    const user = {
      id: "user-1",
      email: "uye@example.com",
      display_name: "VaultDrop Üyesi",
      avatar_url: null,
      plan: "member",
    };
    const { app, repositories } = createTestApp({
      config: {
        neonAuthBaseUrl: "https://auth.example.com/neondb/auth",
        neonAuthJwksUrl: "https://auth.example.com/neondb/auth/.well-known/jwks.json",
      },
      verifyNeonToken: vi.fn().mockResolvedValue({
        sub: "neon-user-1",
        email: user.email,
        name: user.display_name,
      }),
      repositories: {
        upsertGoogleUser: vi.fn().mockResolvedValue(user),
        getProfileSummary: vi.fn().mockResolvedValue({ transfer_count: 2 }),
      },
    });

    const response = await request(app)
      .get("/api/profile/summary")
      .set("Authorization", "Bearer signed-token");

    expect(response.status).toBe(200);
    expect(response.body.transfer_count).toBe(2);
    expect(repositories.getProfileSummary).toHaveBeenCalledWith("user-1");
  });
});
