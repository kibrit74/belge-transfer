import "dotenv/config";

export function readConfig(environment = process.env) {
  return {
    port: Number(environment.PORT || 5704),
    frontendOrigin: environment.FRONTEND_ORIGIN || "http://localhost:5173",
    databaseUrl: environment.DATABASE_URL || "",
    databaseDirectUrl: environment.DATABASE_DIRECT_URL || environment.DATABASE_URL || "",
    googleClientId: environment.GOOGLE_CLIENT_ID || "",
    googleClientSecret: environment.GOOGLE_CLIENT_SECRET || "",
    googleRedirectUri:
      environment.GOOGLE_REDIRECT_URI || "http://localhost:5704/api/auth/google/callback",
    neonAuthBaseUrl: environment.NEON_AUTH_BASE_URL || "",
    neonAuthJwksUrl: environment.NEON_AUTH_JWKS_URL || "",
    sessionCookieName: "vaultdrop_session",
    superAdminEmails: (environment.VAULTDROP_SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    isProduction: environment.NODE_ENV === "production",
  };
}
