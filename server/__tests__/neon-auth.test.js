// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createNeonAuthMiddleware, createNeonTokenVerifier } from "../neon-auth.js";

function runMiddleware(middleware, authorization) {
  const request = { get: vi.fn((name) => name === "authorization" ? authorization : undefined) };
  return new Promise((resolve, reject) => {
    middleware(request, {}, (error) => error ? reject(error) : resolve(request));
  });
}

describe("Neon Auth API doğrulaması", () => {
  it("anonim ve giriş yapmış Neon JWT issuer biçimlerini doğrular", async () => {
    const { privateKey, publicKey } = await generateKeyPair("EdDSA");
    const publicJwk = await exportJWK(publicKey);
    const kid = "neon-test-key";
    const jwks = { keys: [{ ...publicJwk, alg: "EdDSA", kid }] };
    const jwksServer = createServer((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(jwks));
    });

    await new Promise((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
    const address = jwksServer.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const baseUrl = `${origin}/neondb/auth`;

    try {
      const token = await new SignJWT({ email: "uye@example.com", name: "VaultDrop Üyesi" })
        .setProtectedHeader({ alg: "EdDSA", kid })
        .setSubject("neon-user-1")
        .setIssuer(baseUrl)
        .setAudience(origin)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      const verifyToken = createNeonTokenVerifier({
        baseUrl,
        jwksUrl: `${origin}/.well-known/jwks.json`,
      });

      await expect(verifyToken(token)).resolves.toMatchObject({
        sub: "neon-user-1",
        email: "uye@example.com",
      });

      const authenticatedToken = await new SignJWT({ role: "authenticated" })
        .setProtectedHeader({ alg: "EdDSA", kid })
        .setSubject("neon-user-1")
        .setIssuer(origin)
        .setAudience(origin)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

      await expect(verifyToken(authenticatedToken)).resolves.toMatchObject({
        sub: "neon-user-1",
        role: "authenticated",
      });
    } finally {
      await new Promise((resolve, reject) => jwksServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("Bearer jetonundaki kullanıcıyı yerel profile bağlar", async () => {
    const repositories = {
      upsertGoogleUser: vi.fn().mockResolvedValue({
        id: "local-user-1",
        email: "uye@example.com",
        display_name: "VaultDrop Üyesi",
        avatar_url: null,
        plan: "member",
      }),
    };
    const verifyToken = vi.fn().mockResolvedValue({
      sub: "neon-user-1",
      email: "uye@example.com",
      name: "VaultDrop Üyesi",
    });

    const request = await runMiddleware(
      createNeonAuthMiddleware({ repositories, verifyToken }),
      "Bearer signed-token",
    );

    expect(verifyToken).toHaveBeenCalledWith("signed-token");
    expect(repositories.upsertGoogleUser).toHaveBeenCalledWith({
      googleSubject: "neon-user-1",
      email: "uye@example.com",
      displayName: "VaultDrop Üyesi",
      avatarUrl: null,
    });
    expect(request.user.id).toBe("local-user-1");
  });

  it("jeton yoksa misafir olarak devam eder", async () => {
    const request = await runMiddleware(
      createNeonAuthMiddleware({ repositories: {}, verifyToken: vi.fn() }),
      undefined,
    );

    expect(request.user).toBeNull();
  });

  it("geçersiz veya eksik jetonda çerez kimlik doğrulamasına düşer", async () => {
    const repositories = {
      findUserBySessionHash: vi.fn().mockResolvedValue({ id: "cookie-user-1" }),
    };
    const middleware = createNeonAuthMiddleware({
      repositories,
      verifyToken: vi.fn().mockRejectedValue(new Error("invalid token")),
      cookieName: "vaultdrop_session",
    });

    const request = {
      get: vi.fn(() => undefined),
      cookies: { vaultdrop_session: "valid-cookie-token" },
    };

    await new Promise((resolve, reject) => {
      middleware(request, {}, (error) => error ? reject(error) : resolve(request));
    });

    expect(repositories.findUserBySessionHash).toHaveBeenCalled();
    expect(request.user.id).toBe("cookie-user-1");
  });
});
