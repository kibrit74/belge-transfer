import { randomUUID } from "node:crypto";
import { createDatabaseQuery } from "./db/pool.js";
import { createRepositories } from "./repositories.js";
import { getPlanLimitBytes, getUtcMonthlyPeriod, normalizePlan } from "../shared/plan-policy.js";
import { hasPermission } from "./admin/rbac.js";

export function createRuntimeRepositories(config) {
  if (config.databaseUrl) {
    return createRepositories(createDatabaseQuery(config.databaseUrl));
  }
  if (config.isProduction) {
    throw new Error("Üretim ortamında DATABASE_URL zorunludur.");
  }
  return createMemoryRepositories();
}

function createMemoryRepositories() {
  const users = new Map();
  const sessions = new Map();
  const transfers = [];
  const nearbyRooms = new Map();
  const nearbySignals = [];
  const auditLogs = [];
  const systemLogs = [];

  return {
    async createSystemLog(input) {
      const log = {
        id: randomUUID(), level: input.level, category: input.category, message: input.message,
        error_code: input.errorCode ?? null, user_id: input.userId ?? null,
        transfer_id: input.transferId ?? null, metadata: structuredClone(input.metadata ?? {}), created_at: new Date(),
      };
      systemLogs.unshift(log);
      return { id: log.id };
    },
    async upsertGoogleUser({ googleSubject, email, displayName, avatarUrl }) {
      const existing = users.get(googleSubject);
      const user = {
        id: existing?.id ?? randomUUID(),
        google_subject: googleSubject,
        email,
        display_name: displayName,
        avatar_url: avatarUrl,
        plan: existing?.plan ?? "free",
        role: existing?.role ?? "user",
        status: existing?.status ?? "active",
        restricted_until: existing?.restricted_until ?? null,
        restriction_reason: existing?.restriction_reason ?? null,
        transfers_blocked: existing?.transfers_blocked ?? false,
        monthly_limit_override_bytes: existing?.monthly_limit_override_bytes ?? null,
        last_login_at: new Date(),
        created_at: existing?.created_at ?? new Date(),
      };
      users.set(googleSubject, user);
      return user;
    },
    async createSession({ userId, tokenHash, expiresAt }) {
      sessions.set(tokenHash, { userId, expiresAt, revoked: false });
      return { id: randomUUID() };
    },
    async findUserBySessionHash(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session || session.revoked || session.expiresAt <= new Date()) return null;
      return Array.from(users.values()).find((user) => user.id === session.userId) ?? null;
    },
    async revokeSession(tokenHash) {
      const session = sessions.get(tokenHash);
      if (session) session.revoked = true;
    },
    async createNearbyRoom({ code, hostTokenHash, expiresAt }) {
      if (nearbyRooms.has(code)) {
        const error = new Error("Yakındaki Cihazlar oda kodu zaten kullanımda.");
        error.code = "23505";
        throw error;
      }
      const room = {
        id: randomUUID(),
        code,
        host_token_hash: hostTokenHash,
        guest_token_hash: null,
        status: "waiting",
        created_at: new Date(),
        expires_at: expiresAt,
        closed_at: null,
      };
      nearbyRooms.set(code, room);
      return { ...room };
    },
    async joinNearbyRoom({ code, guestTokenHash, now }) {
      const room = nearbyRooms.get(code);
      if (!room || room.status !== "waiting" || room.expires_at <= now) return null;
      room.guest_token_hash = guestTokenHash;
      room.status = "joined";
      return { ...room };
    },
    async findNearbyRoomByCode(code) {
      const room = nearbyRooms.get(code);
      return room ? { ...room } : null;
    },
    async appendNearbySignal({ roomId, senderRole, kind, sequence, payload, now }) {
      const room = Array.from(nearbyRooms.values()).find((candidate) => candidate.id === roomId);
      if (!room || room.status === "closed" || room.expires_at <= now) return null;
      const duplicate = nearbySignals.some((signal) =>
        signal.room_id === roomId && signal.sender_role === senderRole && signal.sequence === sequence);
      if (duplicate) return null;
      const signal = {
        room_id: roomId,
        sender_role: senderRole,
        kind,
        sequence,
        payload: structuredClone(payload),
        created_at: now,
      };
      nearbySignals.push(signal);
      return structuredClone(signal);
    },
    async listNearbySignals({ roomId, receiverRole, afterSequence }) {
      const senderRole = receiverRole === "host" ? "guest" : "host";
      return nearbySignals
        .filter((signal) => signal.room_id === roomId)
        .filter((signal) => signal.sender_role === senderRole && signal.sequence > afterSequence)
        .toSorted((left, right) => left.sequence - right.sequence)
        .map((signal) => structuredClone(signal));
    },
    async closeNearbyRoom({ roomId, tokenHash, now }) {
      const room = Array.from(nearbyRooms.values()).find((candidate) => candidate.id === roomId);
      const hasToken = room && (room.host_token_hash === tokenHash || room.guest_token_hash === tokenHash);
      if (!hasToken || room.status === "closed") return null;
      room.status = "closed";
      room.closed_at = now;
      return { ...room };
    },
    async deleteExpiredNearbyRooms(now) {
      const expiredIds = new Set();
      for (const [code, room] of nearbyRooms) {
        if (room.expires_at <= now) {
          expiredIds.add(room.id);
          nearbyRooms.delete(code);
        }
      }
      for (let index = nearbySignals.length - 1; index >= 0; index -= 1) {
        if (expiredIds.has(nearbySignals[index].room_id)) nearbySignals.splice(index, 1);
      }
      return expiredIds.size;
    },
    async reserveTransfer({ userId, method, items, startedAt }) {
      const user = Array.from(users.values()).find((candidate) => candidate.id === userId);
      if (!user) return null;
      const now = new Date();
      const { start } = getUtcMonthlyPeriod(now);
      const usedBytes = transfers
        .filter((item) => item.userId === userId && item.direction === "send" && item.created_at >= start)
        .filter((item) => item.status === "completed" || (item.status === "pending" && item.reservation_expires_at > now))
        .reduce((total, item) => total + item.items.reduce((sum, file) => sum + file.sizeBytes, 0), 0);
      const requestedBytes = items.reduce((total, item) => total + item.sizeBytes, 0);
      const limitBytes = user.monthly_limit_override_bytes ?? getPlanLimitBytes(user.plan);
      if (usedBytes + requestedBytes > limitBytes) return null;
      const reservation = {
        id: randomUUID(), userId, method, direction: "send", status: "pending", items,
        startedAt, completedAt: null, created_at: now,
        reservation_expires_at: new Date(now.getTime() + 30 * 60 * 1000),
      };
      transfers.push(reservation);
      return { id: reservation.id };
    },
    async finalizeTransfer({ userId, transferId, status, completedAt }) {
      const transfer = transfers.find((item) => item.id === transferId && item.userId === userId);
      if (!transfer) return null;
      if (transfer.status === status) return { id: transfer.id, status };
      const hasActiveReservation = transfer.status === "pending"
        && transfer.reservation_expires_at > new Date();
      if (!hasActiveReservation) return null;
      transfer.status = status;
      transfer.completedAt = completedAt;
      transfer.reservation_expires_at = null;
      return { id: transfer.id, status };
    },
    async recordTransfer(transfer) {
      const item = { ...transfer, id: randomUUID(), created_at: new Date() };
      transfers.push(item);
      return { id: item.id };
    },
    async getProfileSummary(userId) {
      const now = new Date();
      const { start, end } = getUtcMonthlyPeriod(now);
      const user = Array.from(users.values()).find((candidate) => candidate.id === userId);
      const plan = normalizePlan(user?.plan);
      const rows = transfers.filter((item) => item.userId === userId && item.status !== "pending");
      const monthlyUsedBytes = transfers
        .filter((item) => item.userId === userId && item.direction === "send" && item.created_at >= start)
        .filter((item) => item.status === "completed" || (item.status === "pending" && item.reservation_expires_at > now))
        .reduce((total, item) => total + item.items.reduce((sum, file) => sum + file.sizeBytes, 0), 0);
      const monthlyLimitBytes = user?.monthly_limit_override_bytes ?? getPlanLimitBytes(plan);
      return {
        transfer_count: rows.length,
        file_count: rows.reduce((total, item) => total + item.items.length, 0),
        total_size_bytes: rows.reduce(
          (total, item) => total + item.items.reduce((sum, file) => sum + file.sizeBytes, 0),
          0,
        ),
        last_transfer_at: rows.at(-1)?.created_at ?? null,
        plan,
        monthly_used_bytes: monthlyUsedBytes,
        monthly_limit_bytes: monthlyLimitBytes,
        monthly_remaining_bytes: Math.max(0, monthlyLimitBytes - monthlyUsedBytes),
        period_start: start,
        period_end: end,
      };
    },
    async listTransfers(userId) {
      return transfers
        .filter((item) => item.userId === userId && item.status !== "pending")
        .toReversed()
        .map((item) => ({
          id: item.id,
          method: item.method,
          direction: item.direction,
          status: item.status,
          file_count: item.items.length,
          total_size_bytes: item.items.reduce((sum, file) => sum + file.sizeBytes, 0),
          started_at: item.startedAt,
          completed_at: item.completedAt,
          created_at: item.created_at,
        }));
    },
    async getAdminDashboard() {
      const allUsers = Array.from(users.values());
      return {
        total_users: allUsers.length,
        active_users: allUsers.filter((user) => user.status === "active").length,
        restricted_users: allUsers.filter((user) => user.status !== "active").length,
        total_transfers: transfers.length,
        completed_transfers: transfers.filter((item) => item.status === "completed").length,
        failed_transfers: transfers.filter((item) => item.status === "failed").length,
        errors_24h: systemLogs.filter((item) => item.level === "error").length,
      };
    },
    async listAdminUsers({ search = null, status = null, role = null, page = 1, pageSize = 20 } = {}) {
      const normalizedSearch = search?.toLocaleLowerCase("tr-TR") ?? null;
      const matching = Array.from(users.values())
        .filter((user) => !normalizedSearch
          || user.email.toLocaleLowerCase("tr-TR").includes(normalizedSearch)
          || user.display_name.toLocaleLowerCase("tr-TR").includes(normalizedSearch))
        .filter((user) => !status || user.status === status)
        .filter((user) => !role || user.role === role)
        .toSorted((left, right) => right.created_at - left.created_at);
      const offset = (page - 1) * pageSize;
      return { users: matching.slice(offset, offset + pageSize), total: matching.length, page, pageSize };
    },
    async getAdminUser(userId) {
      const user = Array.from(users.values()).find((candidate) => candidate.id === userId);
      if (!user) return null;
      const userTransfers = transfers.filter((item) => item.userId === userId);
      return {
        ...user,
        transfer_count: userTransfers.length,
        total_size_bytes: userTransfers.reduce(
          (total, item) => total + item.items.reduce((sum, file) => sum + file.sizeBytes, 0),
          0,
        ),
      };
    },
    async updateUserRestriction({ actor, targetUserId, status, restrictedUntil, reason, transfersBlocked }) {
      if (actor.id === targetUserId) throw Object.assign(new Error("Kendi hesabınızın durumunu değiştiremezsiniz."), { code: "SELF_MUTATION" });
      const user = Array.from(users.values()).find((candidate) => candidate.id === targetUserId);
      if (!user) throw Object.assign(new Error("Kullanıcı bulunamadı."), { code: "USER_NOT_FOUND" });
      if (user.role === "super_admin") throw Object.assign(new Error("Super admin hesabı kısıtlanamaz."), { code: "PROTECTED_ADMIN" });
      if ((user.status === "banned" || status === "banned") && !hasPermission(actor, "users.ban")) {
        throw Object.assign(new Error("Ban işlemleri için yetkiniz bulunmuyor."), { code: "FORBIDDEN" });
      }
      const before = { status: user.status, restricted_until: user.restricted_until, transfers_blocked: user.transfers_blocked };
      Object.assign(user, {
        status,
        restricted_until: restrictedUntil,
        restriction_reason: reason,
        transfers_blocked: transfersBlocked,
      });
      auditLogs.unshift({
        id: randomUUID(), actor_user_id: actor.id, actor_email: actor.email,
        action: "USER_RESTRICTION_CHANGED", target_type: "user", target_id: targetUserId,
        reason, old_values: before, new_values: { status, restricted_until: restrictedUntil, transfers_blocked: transfersBlocked },
        created_at: new Date(),
      });
      return { ...user };
    },
    async updateUserLimit({ actor, targetUserId, monthlyLimitOverrideBytes, reason }) {
      if (actor.id === targetUserId) throw Object.assign(new Error("Kendi hesabınızın limitini değiştiremezsiniz."), { code: "SELF_MUTATION" });
      const user = Array.from(users.values()).find((candidate) => candidate.id === targetUserId);
      if (!user) throw Object.assign(new Error("Kullanıcı bulunamadı."), { code: "USER_NOT_FOUND" });
      if (user.role === "super_admin") throw Object.assign(new Error("Super admin limiti değiştirilemez."), { code: "PROTECTED_ADMIN" });
      const oldLimit = user.monthly_limit_override_bytes;
      user.monthly_limit_override_bytes = monthlyLimitOverrideBytes;
      auditLogs.unshift({
        id: randomUUID(), actor_user_id: actor.id, actor_email: actor.email,
        action: "USER_LIMIT_CHANGED", target_type: "user", target_id: targetUserId,
        reason, old_values: { monthly_limit_override_bytes: oldLimit },
        new_values: { monthly_limit_override_bytes: monthlyLimitOverrideBytes }, created_at: new Date(),
      });
      return { ...user };
    },
    async listAdminTransactions({ status = null, method = null, page = 1, pageSize = 20 } = {}) {
      const matching = transfers
        .filter((item) => !status || item.status === status)
        .filter((item) => !method || item.method === method)
        .toReversed();
      const offset = (page - 1) * pageSize;
      const rows = matching.slice(offset, offset + pageSize).map((item) => {
        const user = Array.from(users.values()).find((candidate) => candidate.id === item.userId);
        return {
          id: item.id, method: item.method, direction: item.direction, status: item.status,
          file_count: item.items.length,
          total_size_bytes: item.items.reduce((total, file) => total + file.sizeBytes, 0),
          started_at: item.startedAt, completed_at: item.completedAt, created_at: item.created_at,
          user_id: user?.id, user_email: user?.email, user_display_name: user?.display_name,
        };
      });
      return { transactions: rows, total: matching.length, page, pageSize };
    },
    async listSystemLogs({ page = 1, pageSize = 50 } = {}) {
      const offset = (page - 1) * pageSize;
      return { logs: systemLogs.slice(offset, offset + pageSize), page, pageSize };
    },
    async listAuditLogs({ page = 1, pageSize = 50 } = {}) {
      const offset = (page - 1) * pageSize;
      return { logs: auditLogs.slice(offset, offset + pageSize), page, pageSize };
    },
  };
}
