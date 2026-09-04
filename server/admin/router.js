import express from "express";
import { hasPermission, requirePermission } from "./rbac.js";
import {
  adminUserQuerySchema,
  limitSchema,
  logQuerySchema,
  restrictionSchema,
  transactionQuerySchema,
} from "./validation.js";

function actorFrom(request) {
  return { id: request.user.id, email: request.user.email, role: request.user.role };
}

function adminErrorResponse(error, response, next) {
  if (error?.name === "ZodError") {
    return response.status(400).json({ code: "VALIDATION_ERROR", error: "Gönderilen bilgiler geçersiz." });
  }
  const statuses = {
    USER_NOT_FOUND: 404,
    SELF_MUTATION: 403,
    PROTECTED_ADMIN: 403,
    FORBIDDEN: 403,
  };
  if (statuses[error?.code]) {
    return response.status(statuses[error.code]).json({ code: error.code, error: error.message });
  }
  next(error);
}

function route(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      adminErrorResponse(error, response, next);
    }
  };
}

export function createAdminRouter({ repositories }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.get("/dashboard", requirePermission("dashboard.view"), route(async (_request, response) => {
    response.json(await repositories.getAdminDashboard());
  }));

  router.get("/users", requirePermission("users.view"), route(async (request, response) => {
    response.json(await repositories.listAdminUsers(adminUserQuerySchema.parse(request.query)));
  }));

  router.get("/users/:id", requirePermission("users.view"), route(async (request, response) => {
    const user = await repositories.getAdminUser(request.params.id);
    if (!user) return response.status(404).json({ code: "USER_NOT_FOUND", error: "Kullanıcı bulunamadı." });
    response.json({ user });
  }));

  router.patch("/users/:id/restriction", requirePermission("users.suspend"), route(async (request, response) => {
    const input = restrictionSchema.parse(request.body);
    if (input.status === "banned" && !hasPermission(request.user, "users.ban")) {
      return response.status(403).json({ code: "FORBIDDEN", error: "Bu işlem için yetkiniz bulunmuyor." });
    }
    const user = await repositories.updateUserRestriction({
      actor: actorFrom(request),
      targetUserId: request.params.id,
      status: input.status,
      restrictedUntil: input.restrictedUntil ? new Date(input.restrictedUntil) : null,
      reason: input.reason,
      transfersBlocked: input.transfersBlocked,
    });
    response.json({ user });
  }));

  router.patch("/users/:id/limit", requirePermission("users.limits"), route(async (request, response) => {
    const input = limitSchema.parse(request.body);
    const user = await repositories.updateUserLimit({
      actor: actorFrom(request),
      targetUserId: request.params.id,
      ...input,
    });
    response.json({ user });
  }));

  router.get("/transactions", requirePermission("transactions.view"), route(async (request, response) => {
    response.json(await repositories.listAdminTransactions(transactionQuerySchema.parse(request.query)));
  }));

  router.get("/logs", requirePermission("logs.view"), route(async (request, response) => {
    response.json(await repositories.listSystemLogs(logQuerySchema.parse(request.query)));
  }));

  router.get("/audit-logs", requirePermission("audit.view"), route(async (request, response) => {
    const query = logQuerySchema.pick({ page: true, pageSize: true }).parse(request.query);
    response.json(await repositories.listAuditLogs(query));
  }));

  return router;
}
