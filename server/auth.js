import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { getPermissions } from "./admin/rbac.js";

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken(size = 32) {
  return randomBytes(size).toString("base64url");
}

export function createGoogleClient(config) {
  return new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: config.googleRedirectUri,
  });
}

export function createAuthMiddleware({ repositories, cookieName }) {
  return async function attachUser(request, _response, next) {
    try {
      const rawToken = request.cookies?.[cookieName];
      request.user = rawToken
        ? await repositories.findUserBySessionHash(hashToken(rawToken))
        : null;
      request.sessionToken = rawToken ?? null;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireUser(request, response, next) {
  if (!request.user) return response.status(401).json({ error: "Giriş yapmanız gerekiyor." });
  next();
}

export function mapPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    plan: user.plan,
    role: user.role ?? "user",
    status: user.status ?? "active",
    permissions: getPermissions(user.role ?? "user"),
  };
}
