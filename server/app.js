import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { requireTransferAccess } from "./account-access.js";
import { createAdminRouter } from "./admin/router.js";
import { applyBootstrapAdminRole } from "./admin/bootstrap.js";
import { createApiHelmetOptions } from "./security-headers.js";
import {
  SESSION_MAX_AGE_MS,
  createAuthMiddleware,
  createGoogleClient,
  createOpaqueToken,
  hashToken,
  mapPublicUser,
  requireUser,
} from "./auth.js";
import { createNeonAuthMiddleware, createNeonTokenVerifier } from "./neon-auth.js";
import { NearbyServiceError, createNearbyRoomService } from "./nearby-service.js";
import {
  nearbyAfterSequenceSchema,
  nearbyEmptyBodySchema,
  nearbyRoomCodeSchema,
  nearbySignalSchema,
} from "./nearby-validation.js";
import {
  transferFinalizationSchema,
  transferIdSchema,
  transferQuerySchema,
  transferReservationSchema,
  transferSchema,
} from "./validation.js";

function cookieOptions(config, maxAge = SESSION_MAX_AGE_MS) {
  return { httpOnly: true, sameSite: "lax", secure: config.isProduction, path: "/", maxAge };
}

function isAllowedOrigin(origin, config) {
  if (!origin) return false;
  if (origin === config.frontendOrigin) return true;
  if (!config.isProduction) return true;
  return false;
}

export function createApp({
  config,
  repositories,
  googleClient: suppliedGoogleClient,
  verifyNeonToken: suppliedNeonVerifier,
}) {
  const app = express();
  const nearbyService = createNearbyRoomService({ repositories });
  const nearbyCreateLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const nearbyJoinLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const nearbyMutationLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const nearbyReadLimiter = rateLimit({
    windowMs: 60_000,
    limit: 150,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator(request) {
      const tokenHash = crypto
        .createHash("sha256")
        .update(request.get("x-nearby-token") ?? "")
        .digest("base64url");
      return `${request.params.code ?? "invalid-room"}:${tokenHash}`;
    },
  });
  const nearbyReadIpLimiter = rateLimit({
    windowMs: 60_000,
    limit: 360,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const googleClient = suppliedGoogleClient ?? (
    config.googleClientId && config.googleClientSecret ? createGoogleClient(config) : null
  );

  app.disable("x-powered-by");
  app.use(helmet(createApiHelmetOptions()));
  app.use(cookieParser());
  app.use(rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (request) => request.method === "GET"
      && /^\/api\/nearby\/rooms\/[^/]+\/signals$/.test(request.path),
  }));
  const retiredSecureLinkPaths = [
    "/api/secure-shares",
    "/api/secure-shares/:id",
    "/api/secure-shares/:id/unlock",
  ];

  app.all(retiredSecureLinkPaths, (_request, response) => {
    response.status(410).json({
      code: "SECURE_LINK_RETIRED",
      error: "Güvenli bağlantı yöntemi artık desteklenmiyor.",
    });
  });
  app.use(express.json({ limit: "32kb" }));
  const verifyNeonToken = suppliedNeonVerifier ?? (
    config.neonAuthBaseUrl && config.neonAuthJwksUrl
      ? createNeonTokenVerifier({ baseUrl: config.neonAuthBaseUrl, jwksUrl: config.neonAuthJwksUrl })
      : null
  );
  app.use(verifyNeonToken
    ? createNeonAuthMiddleware({ repositories, verifyToken: verifyNeonToken, cookieName: config.sessionCookieName })
    : createAuthMiddleware({ repositories, cookieName: config.sessionCookieName }));
  app.use((request, _response, next) => {
    request.user = applyBootstrapAdminRole(request.user, config.superAdminEmails);
    next();
  });

  app.use((request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    if (!isAllowedOrigin(request.get("origin"), config) || request.get("x-vaultdrop-request") !== "1") {
      return response.status(403).json({ error: "İstek doğrulanamadı." });
    }
    next();
  });

  app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
  app.get("/api/auth/session", (request, response) => response.json({ user: mapPublicUser(request.user) }));
  app.use("/api/admin", createAdminRouter({ repositories }));

  app.use("/api/nearby", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  app.post("/api/nearby/rooms", nearbyCreateLimiter, async (request, response, next) => {
    try {
      nearbyEmptyBodySchema.parse(request.body ?? {});
      response.status(201).json(await nearbyService.createRoom());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/nearby/rooms/:code/join", nearbyJoinLimiter, async (request, response, next) => {
    try {
      nearbyEmptyBodySchema.parse(request.body ?? {});
      const code = nearbyRoomCodeSchema.parse(request.params.code);
      response.json(await nearbyService.joinRoom(code));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/nearby/rooms/:code/signals", nearbyMutationLimiter, async (request, response, next) => {
    try {
      const code = nearbyRoomCodeSchema.parse(request.params.code);
      const signal = nearbySignalSchema.parse(request.body);
      await nearbyService.publishSignal({ code, token: request.get("x-nearby-token"), signal });
      response.status(201).json({ accepted: true });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/api/nearby/rooms/:code/signals",
    nearbyReadIpLimiter,
    nearbyReadLimiter,
    async (request, response, next) => {
      try {
        const code = nearbyRoomCodeSchema.parse(request.params.code);
        const afterSequence = nearbyAfterSequenceSchema.parse(request.query.after);
        const signals = await nearbyService.readSignals({
          code,
          token: request.get("x-nearby-token"),
          afterSequence,
        });
        response.json({
          signals: signals.map((signal) => ({
            senderRole: signal.sender_role,
            kind: signal.kind,
            sequence: signal.sequence,
            payload: signal.payload,
          })),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete("/api/nearby/rooms/:code", nearbyMutationLimiter, async (request, response, next) => {
    try {
      const code = nearbyRoomCodeSchema.parse(request.params.code);
      await nearbyService.closeRoom({ code, token: request.get("x-nearby-token") });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/google/start", (_request, response) => {
    if (!googleClient) return response.redirect(`${config.frontendOrigin}/giris?error=config`);
    const state = createOpaqueToken(24);
    const verifier = createOpaqueToken(48);
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    response.cookie("vaultdrop_oauth_state", state, cookieOptions(config, 10 * 60 * 1000));
    response.cookie("vaultdrop_oauth_verifier", verifier, cookieOptions(config, 10 * 60 * 1000));
    response.redirect(googleClient.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }));
  });

  app.get("/api/auth/google/callback", async (request, response, next) => {
    try {
      if (!googleClient || !request.query.code || request.query.state !== request.cookies.vaultdrop_oauth_state) {
        return response.redirect(`${config.frontendOrigin}/giris?error=oauth`);
      }
      const { tokens } = await googleClient.getToken({
        code: request.query.code,
        codeVerifier: request.cookies.vaultdrop_oauth_verifier,
      });
      const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId });
      const payload = ticket.getPayload();
      const user = await repositories.upsertGoogleUser({
        googleSubject: payload.sub,
        email: payload.email,
        displayName: payload.name || payload.email,
        avatarUrl: payload.picture || null,
      });
      const rawToken = createOpaqueToken();
      await repositories.createSession({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
      });
      response.clearCookie("vaultdrop_oauth_state", cookieOptions(config));
      response.clearCookie("vaultdrop_oauth_verifier", cookieOptions(config));
      response.cookie(config.sessionCookieName, rawToken, cookieOptions(config));
      response.redirect(`${config.frontendOrigin}/profil`);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", async (request, response, next) => {
    try {
      if (request.sessionToken) await repositories.revokeSession(hashToken(request.sessionToken));
      response.clearCookie(config.sessionCookieName, cookieOptions(config));
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/transfers/reservations", requireUser, requireTransferAccess, async (request, response, next) => {
    try {
      const parsed = transferReservationSchema.parse(request.body);
      const reservation = await repositories.reserveTransfer({ ...parsed, userId: request.user.id });
      if (!reservation) {
        return response.status(409).json({
          code: "MONTHLY_QUOTA_EXCEEDED",
          error: "Bu aktarım aylık paket kotanızı aşıyor.",
        });
      }
      response.status(201).json(reservation);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/transfers/:id", requireUser, requireTransferAccess, async (request, response, next) => {
    try {
      const transferId = transferIdSchema.parse(request.params.id);
      const parsed = transferFinalizationSchema.parse(request.body);
      const transfer = await repositories.finalizeTransfer({
        ...parsed,
        transferId,
        userId: request.user.id,
      });
      if (!transfer) return response.status(404).json({ error: "Aktarım rezervasyonu bulunamadı." });
      response.json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/transfers", requireUser, requireTransferAccess, async (request, response, next) => {
    try {
      const parsed = transferSchema.parse(request.body);
      if (parsed.direction === "send") {
        return response.status(400).json({ error: "Gönderim için önce kota rezervasyonu alınmalıdır." });
      }
      const transfer = await repositories.recordTransfer({ ...parsed, userId: request.user.id });
      response.status(201).json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/profile/summary", requireUser, async (request, response, next) => {
    try {
      response.json(await repositories.getProfileSummary(request.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/profile/transfers", requireUser, async (request, response, next) => {
    try {
      const query = transferQuerySchema.parse(request.query);
      response.json({ transfers: await repositories.listTransfers(request.user.id, query) });
    } catch (error) {
      next(error);
    }
  });

  app.use(async (error, request, response, _next) => {
    if (error instanceof NearbyServiceError) {
      return response.status(error.status).json({ code: error.code, error: error.message });
    }
    if (error?.name === "ZodError") return response.status(400).json({ error: "Gönderilen bilgiler geçersiz." });
    console.error("VaultDrop API hatası:", error?.message ?? error);
    if (typeof repositories.createSystemLog === "function") {
      try {
        await repositories.createSystemLog({
          level: "error",
          category: "API",
          message: "API isteği tamamlanamadı.",
          errorCode: "UNEXPECTED_ERROR",
          userId: request.user?.id ?? null,
          transferId: request.params?.id ?? null,
          metadata: { method: request.method, path: request.path },
        });
      } catch (logError) {
        console.error("VaultDrop sistem logu yazılamadı:", logError?.message ?? logError);
      }
    }
    response.status(500).json({ error: "İşlem şu anda tamamlanamadı." });
  });

  return app;
}
