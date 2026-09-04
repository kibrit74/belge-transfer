import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";

const config = {
  frontendOrigin: "http://localhost:5173",
  sessionCookieName: "vaultdrop_session",
  isProduction: false,
  googleClientId: "",
  googleClientSecret: "",
  neonAuthBaseUrl: "",
  neonAuthJwksUrl: "",
};

describe("kaldırılan Secure Link API", () => {
  it.each([
    ["post", "/api/secure-shares"],
    ["get", "/api/secure-shares/550e8400-e29b-41d4-a716-446655440000"],
    ["post", "/api/secure-shares/550e8400-e29b-41d4-a716-446655440000/unlock"],
  ])("%s %s için içeriksiz 410 döndürür", async (method, path) => {
    const repositories = {
      findUserBySessionHash: vi.fn().mockResolvedValue(null),
    };
    const response = await request(createApp({ config, repositories }))[method](path);
    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      code: "SECURE_LINK_RETIRED",
      error: "Güvenli bağlantı yöntemi artık desteklenmiyor.",
    });
    expect(JSON.stringify(response.body)).not.toContain("encrypted");
  });

  it("gövde ayrıştırmadan 410 döndürür", async () => {
    const repositories = {
      findUserBySessionHash: vi.fn().mockResolvedValue(null),
    };
    const response = await request(createApp({ config, repositories }))
      .post("/api/secure-shares")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(410);
  });
});
