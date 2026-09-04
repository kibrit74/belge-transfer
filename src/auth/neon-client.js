import { createAuthClient } from "@neondatabase/neon-js/auth";

const authUrl = import.meta.env.MODE === "test"
  ? ""
  : import.meta.env.VITE_NEON_AUTH_URL;

export const authClient = authUrl
  ? createAuthClient(authUrl, {
      fetchOptions: { credentials: "include" },
    })
  : null;

const SAFE_RETURN_PATHS = new Set(["/profil", "/transfer"]);

export function sanitizeReturnPath(returnPath) {
  return SAFE_RETURN_PATHS.has(returnPath) ? returnPath : "/profil";
}

export function getGoogleSignInOptions(returnPath = "/profil") {
  const safeReturnPath = sanitizeReturnPath(returnPath);
  return {
    provider: "google",
    callbackURL: safeReturnPath,
    errorCallbackURL: "/giris?error=oauth",
  };
}

export function mapNeonUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.name || user.email,
    avatarUrl: user.image || null,
    plan: "free",
  };
}

export async function getNeonAccessToken(client = authClient) {
  if (!client) return null;
  const result = await client.getSession();
  return result?.data?.session?.token ?? null;
}
