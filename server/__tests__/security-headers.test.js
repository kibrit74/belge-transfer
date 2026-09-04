import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";

describe("API güvenlik başlıkları", () => {
  it("API yanıtlarında sıkı güvenlik başlıkları kullanır", async () => {
    const app = createApp({
      config: {
        frontendOrigin: "https://vaultdrop.example",
        sessionCookieName: "vaultdrop_session",
        isProduction: true,
        googleClientId: "",
        googleClientSecret: "",
        neonAuthBaseUrl: "",
        neonAuthJwksUrl: "",
      },
      repositories: { findUserBySessionHash: vi.fn().mockResolvedValue(null) },
    });

    const response = await request(app).get("/api/health");

    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
