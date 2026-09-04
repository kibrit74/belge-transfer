import { createRemoteJWKSet, jwtVerify } from "jose";
import { createAuthMiddleware } from "./auth.js";

export function createNeonTokenVerifier({ baseUrl, jwksUrl }) {
  const authUrl = new URL(baseUrl);
  const issuers = [authUrl.origin, authUrl.toString().replace(/\/$/, "")];
  const audience = authUrl.origin;
  const keySet = createRemoteJWKSet(new URL(jwksUrl));

  return async function verifyToken(token) {
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ["EdDSA"],
      issuer: issuers,
      audience,
    });
    return payload;
  };
}

function getBearerToken(request) {
  const authorization = request.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

export function createNeonAuthMiddleware({ repositories, verifyToken, cookieName }) {
  const cookieMiddleware = cookieName ? createAuthMiddleware({ repositories, cookieName }) : null;

  return async function attachNeonUser(request, response, next) {
    const token = getBearerToken(request);
    request.user = null;
    request.sessionToken = null;

    if (token) {
      try {
        const payload = await verifyToken(token);
        if (payload.sub && payload.sub !== "anonymous" && payload.role !== "anonymous") {
          const email = typeof payload.email === "string" && payload.email
            ? payload.email
            : `${payload.sub}@neon-auth.local`;
          const displayName = typeof payload.name === "string" && payload.name
            ? payload.name
            : "VaultDrop Üyesi";
          request.user = await repositories.upsertGoogleUser({
            googleSubject: payload.sub,
            email,
            displayName,
            avatarUrl: payload.picture || payload.image || null,
          });
          return next();
        }
      } catch {
        // Fall back to cookie authentication
      }
    }

    if (cookieMiddleware) {
      return cookieMiddleware(request, response, next);
    }
    next();
  };
}

