import { hasPermission } from "./rbac.js";

function paging({ page = 1, pageSize = 20 } = {}) {
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

function pagedResult(rows, { page, pageSize }) {
  const total = Number(rows[0]?.total_count ?? rows.length);
  return {
    users: rows.map(({ total_count: _totalCount, ...row }) => row),
    total,
    page,
    pageSize,
  };
}

function adminError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function withTransaction(query, operation) {
  if (typeof query.connect !== "function") return operation(query, false);
  const client = await query.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client.query.bind(client), true);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function createAdminRepositories(query) {
  return {
    async createSystemLog({ level, category, message, errorCode = null, userId = null, transferId = null, metadata = {} }) {
      const result = await query(
        `INSERT INTO system_logs
           (level, category, message, error_code, user_id, transfer_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id`,
        [level, category, message, errorCode, userId, transferId, JSON.stringify(metadata)],
      );
      return result.rows[0];
    },

    async getAdminDashboard() {
      const result = await query(`
        SELECT
          (SELECT COUNT(*)::int FROM users) AS total_users,
          (SELECT COUNT(*)::int FROM users WHERE status = 'active') AS active_users,
          (SELECT COUNT(*)::int FROM users WHERE status IN ('suspended', 'banned')) AS restricted_users,
          (SELECT COUNT(*)::int FROM transfer_batches) AS total_transfers,
          (SELECT COUNT(*)::int FROM transfer_batches WHERE status = 'completed') AS completed_transfers,
          (SELECT COUNT(*)::int FROM transfer_batches WHERE status = 'failed') AS failed_transfers,
          (SELECT COUNT(*)::int FROM system_logs WHERE level = 'error' AND created_at >= NOW() - INTERVAL '24 hours') AS errors_24h
      `);
      return result.rows[0];
    },

    async listAdminUsers({ search = null, status = null, role = null, page = 1, pageSize = 20 } = {}) {
      const pageData = paging({ page, pageSize });
      const result = await query(
        `SELECT id, email, display_name, avatar_url, plan, role, status, restricted_until,
                restriction_reason, transfers_blocked, monthly_limit_override_bytes,
                last_login_at, created_at, COUNT(*) OVER() AS total_count
         FROM users
         WHERE ($1::text IS NULL OR email ILIKE $1 OR display_name ILIKE $1)
           AND ($2::text IS NULL OR status = $2)
           AND ($3::text IS NULL OR role = $3)
         ORDER BY created_at DESC
         LIMIT $4 OFFSET $5`,
        [search ? `%${search}%` : null, status, role, pageData.limit, pageData.offset],
      );
      return pagedResult(result.rows, pageData);
    },

    async getAdminUser(userId) {
      const result = await query(
        `SELECT u.id, u.email, u.display_name, u.avatar_url, u.plan, u.role, u.status,
                u.restricted_until, u.restriction_reason, u.transfers_blocked,
                u.monthly_limit_override_bytes, u.last_login_at, u.created_at,
                COUNT(t.id)::int AS transfer_count,
                COALESCE(SUM(t.total_size_bytes), 0)::bigint AS total_size_bytes
         FROM users u
         LEFT JOIN transfer_batches t ON t.user_id = u.id
         WHERE u.id = $1
         GROUP BY u.id`,
        [userId],
      );
      return result.rows[0] ?? null;
    },

    async updateUserRestriction(input) {
      if (input.actor.id === input.targetUserId) {
        throw adminError("SELF_MUTATION", "Kendi hesabınızın durumunu değiştiremezsiniz.");
      }
      return withTransaction(query, async (execute) => {
        const before = (await execute(
          "SELECT id, role, status, restricted_until, restriction_reason, transfers_blocked FROM users WHERE id = $1 FOR UPDATE",
          [input.targetUserId],
        )).rows[0];
        if (!before) throw adminError("USER_NOT_FOUND", "Kullanıcı bulunamadı.");
        if (before.role === "super_admin") {
          throw adminError("PROTECTED_ADMIN", "Super admin hesabı kısıtlanamaz.");
        }
        if ((before.status === "banned" || input.status === "banned")
          && !hasPermission(input.actor, "users.ban")) {
          throw adminError("FORBIDDEN", "Ban işlemleri için yetkiniz bulunmuyor.");
        }
        const after = (await execute(
          `UPDATE users
           SET status = $2, restricted_until = $3, restriction_reason = $4,
               transfers_blocked = $5, updated_at = NOW()
           WHERE id = $1
           RETURNING id, email, display_name, plan, role, status, restricted_until,
                     restriction_reason, transfers_blocked, monthly_limit_override_bytes`,
          [input.targetUserId, input.status, input.restrictedUntil, input.reason, input.transfersBlocked],
        )).rows[0];
        await execute(
          `INSERT INTO admin_audit_logs
             (actor_user_id, actor_email, action, target_type, target_id, reason, old_values, new_values)
           VALUES ($1, $2, $3, 'user', $4, $5, $6::jsonb, $7::jsonb)
           RETURNING id`,
          [
            input.actor.id,
            input.actor.email,
            "USER_RESTRICTION_CHANGED",
            input.targetUserId,
            input.reason,
            JSON.stringify(before),
            JSON.stringify(after),
          ],
        );
        return after;
      });
    },

    async updateUserLimit({ actor, targetUserId, monthlyLimitOverrideBytes, reason }) {
      if (actor.id === targetUserId) {
        throw adminError("SELF_MUTATION", "Kendi hesabınızın limitini değiştiremezsiniz.");
      }
      return withTransaction(query, async (execute) => {
        const before = (await execute(
          "SELECT id, role, monthly_limit_override_bytes FROM users WHERE id = $1 FOR UPDATE",
          [targetUserId],
        )).rows[0];
        if (!before) throw adminError("USER_NOT_FOUND", "Kullanıcı bulunamadı.");
        if (before.role === "super_admin") throw adminError("PROTECTED_ADMIN", "Super admin limiti değiştirilemez.");
        const after = (await execute(
          `UPDATE users SET monthly_limit_override_bytes = $2, updated_at = NOW()
           WHERE id = $1
           RETURNING id, email, display_name, plan, role, status, monthly_limit_override_bytes`,
          [targetUserId, monthlyLimitOverrideBytes],
        )).rows[0];
        await execute(
          `INSERT INTO admin_audit_logs
             (actor_user_id, actor_email, action, target_type, target_id, reason, old_values, new_values)
           VALUES ($1, $2, 'USER_LIMIT_CHANGED', 'user', $3, $4, $5::jsonb, $6::jsonb)`,
          [actor.id, actor.email, targetUserId, reason, JSON.stringify(before), JSON.stringify(after)],
        );
        return after;
      });
    },

    async listAdminTransactions({ status = null, method = null, page = 1, pageSize = 20 } = {}) {
      const { limit, offset } = paging({ page, pageSize });
      const result = await query(
        `SELECT t.id, t.method, t.direction, t.status, t.file_count, t.total_size_bytes,
                t.started_at, t.completed_at, t.created_at, u.id AS user_id,
                u.email AS user_email, u.display_name AS user_display_name,
                COUNT(*) OVER() AS total_count
         FROM transfer_batches t JOIN users u ON u.id = t.user_id
         WHERE ($1::text IS NULL OR t.status = $1) AND ($2::text IS NULL OR t.method = $2)
         ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`,
        [status, method, limit, offset],
      );
      return { transactions: result.rows, total: Number(result.rows[0]?.total_count ?? result.rows.length), page, pageSize };
    },

    async listSystemLogs({ level = null, category = null, page = 1, pageSize = 50 } = {}) {
      const { limit, offset } = paging({ page, pageSize });
      const result = await query(
        `SELECT id, level, category, message, error_code, user_id, transfer_id, metadata, created_at
         FROM system_logs
         WHERE ($1::text IS NULL OR level = $1) AND ($2::text IS NULL OR category = $2)
         ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
        [level, category, limit, offset],
      );
      return { logs: result.rows, page, pageSize };
    },

    async listAuditLogs({ page = 1, pageSize = 50 } = {}) {
      const { limit, offset } = paging({ page, pageSize });
      const result = await query(
        `SELECT id, actor_user_id, actor_email, action, target_type, target_id, reason,
                old_values, new_values, created_at
         FROM admin_audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return { logs: result.rows, page, pageSize };
    },
  };
}
