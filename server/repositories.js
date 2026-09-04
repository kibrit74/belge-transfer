import { createAdminRepositories } from "./admin/repositories.js";

export function createRepositories(query) {
  async function reserveInTransaction(reserve) {
    if (typeof query.connect !== "function") return reserve(query, false);

    const client = await query.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      const result = await reserve(client.query.bind(client), true);
      await client.query("COMMIT");
      transactionOpen = false;
      return result;
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    ...createAdminRepositories(query),
    async upsertGoogleUser({ googleSubject, email, displayName, avatarUrl }) {
      const result = await query(
        `INSERT INTO users (google_subject, email, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (google_subject) DO UPDATE SET
           email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url,
           updated_at = NOW()
         RETURNING id, email, display_name, avatar_url, plan, role, status,
                   restricted_until, transfers_blocked, monthly_limit_override_bytes, created_at`,
        [googleSubject, email, displayName, avatarUrl],
      );
      return result.rows[0];
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      const result = await query(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, tokenHash, expiresAt],
      );
      return result.rows[0];
    },

    async findUserBySessionHash(tokenHash) {
      const result = await query(
        `SELECT u.id, u.email, u.display_name, u.avatar_url, u.plan, u.role, u.status,
                u.restricted_until, u.transfers_blocked, u.monthly_limit_override_bytes
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },

    async revokeSession(tokenHash) {
      await query(
        `UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
      );
    },

    async createNearbyRoom({ code, hostTokenHash, expiresAt }) {
      const result = await query(
        `INSERT INTO nearby_rooms (id, code, host_token_hash, status, expires_at)
         VALUES (gen_random_uuid(), $1, $2, 'waiting', $3)
         RETURNING id, code, host_token_hash, guest_token_hash, status, created_at, expires_at, closed_at`,
        [code, hostTokenHash, expiresAt],
      );
      return result.rows[0];
    },

    async joinNearbyRoom({ code, guestTokenHash, now }) {
      const result = await query(
        `UPDATE nearby_rooms
         SET guest_token_hash = $2, status = 'joined'
         WHERE code = $1 AND status = 'waiting' AND expires_at > $3
         RETURNING id, code, host_token_hash, guest_token_hash, status, created_at, expires_at, closed_at`,
        [code, guestTokenHash, now],
      );
      return result.rows[0] ?? null;
    },

    async findNearbyRoomByCode(code) {
      const result = await query(
        `SELECT id, code, host_token_hash, guest_token_hash, status, created_at, expires_at, closed_at
         FROM nearby_rooms WHERE code = $1`,
        [code],
      );
      return result.rows[0] ?? null;
    },

    async appendNearbySignal({ roomId, senderRole, kind, sequence, payload, now }) {
      const result = await query(
        `INSERT INTO nearby_signals (room_id, sender_role, kind, sequence, payload, created_at)
         SELECT $1, $2, $3, $4, $5::jsonb, $6
         FROM nearby_rooms
         WHERE id = $1 AND status <> 'closed' AND expires_at > $6
         ON CONFLICT (room_id, sender_role, sequence) DO NOTHING
         RETURNING room_id, sender_role, kind, sequence, payload, created_at`,
        [roomId, senderRole, kind, sequence, JSON.stringify(payload), now],
      );
      return result.rows[0] ?? null;
    },

    async listNearbySignals({ roomId, receiverRole, afterSequence }) {
      const senderRole = receiverRole === "host" ? "guest" : "host";
      const result = await query(
        `SELECT room_id, sender_role, kind, sequence, payload, created_at
         FROM nearby_signals
         WHERE room_id = $1 AND sender_role = $2 AND sequence > $3
         ORDER BY sequence ASC`,
        [roomId, senderRole, afterSequence],
      );
      return result.rows;
    },

    async closeNearbyRoom({ roomId, tokenHash, now }) {
      const result = await query(
        `UPDATE nearby_rooms
         SET status = 'closed', closed_at = $3
         WHERE id = $1 AND status <> 'closed'
           AND (host_token_hash = $2 OR guest_token_hash = $2)
         RETURNING id, code, host_token_hash, guest_token_hash, status, created_at, expires_at, closed_at`,
        [roomId, tokenHash, now],
      );
      return result.rows[0] ?? null;
    },

    async deleteExpiredNearbyRooms(now) {
      const result = await query(
        "DELETE FROM nearby_rooms WHERE expires_at <= $1 RETURNING id",
        [now],
      );
      return result.rowCount ?? result.rows.length;
    },

    async reserveTransfer({ userId, method, items, startedAt }) {
      const totalSizeBytes = items.reduce((total, item) => total + item.sizeBytes, 0);
      const safeItems = items.map((item, index) => ({
        ordinal: index + 1,
        size_bytes: item.sizeBytes,
      }));
      return reserveInTransaction(async (transactionQuery, hasTransactionLock) => {
        if (hasTransactionLock) {
          await transactionQuery(
            `SELECT pg_advisory_xact_lock(
               hashtextextended(
                 $1::text || ':' || to_char(date_trunc('month', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD'),
                 0
               )
             )`,
            [userId],
          );
        }
        const result = await transactionQuery(
        `WITH account AS (
           SELECT COALESCE(
             monthly_limit_override_bytes,
             CASE
               WHEN plan = 'free' THEN 10485760::bigint
               WHEN plan = 'plus' THEN 262144000::bigint
               WHEN plan = 'corporate' THEN 1073741824::bigint
               ELSE 52428800::bigint
             END
           ) AS limit_bytes
           FROM users WHERE id = $1
         ), monthly_usage AS (
           SELECT COALESCE(SUM(total_size_bytes), 0)::bigint AS used_bytes
           FROM transfer_batches
           WHERE user_id = $1
             AND direction = 'send'
             AND created_at >= (date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
             AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > NOW()))
         ), new_batch AS (
           INSERT INTO transfer_batches
             (user_id, method, direction, status, file_count, total_size_bytes, started_at, reservation_expires_at)
           SELECT $1, $2, 'send', 'pending', $4, $5, $3, NOW() + INTERVAL '30 minutes'
           FROM account CROSS JOIN monthly_usage
           WHERE monthly_usage.used_bytes + $5 <= account.limit_bytes
           RETURNING id
         ), new_items AS (
           INSERT INTO transfer_items (batch_id, ordinal, size_bytes)
           SELECT new_batch.id, item.ordinal, item.size_bytes
           FROM new_batch
           CROSS JOIN jsonb_to_recordset($6::jsonb)
             AS item(ordinal integer, size_bytes bigint)
           RETURNING batch_id
         )
         SELECT id FROM new_batch`,
        [userId, method, startedAt, items.length, totalSizeBytes, JSON.stringify(safeItems)],
        );
        return result.rows[0] ?? null;
      });
    },

    async finalizeTransfer({ userId, transferId, status, completedAt }) {
      const result = await query(
        `UPDATE transfer_batches
         SET status = $3, completed_at = $4, reservation_expires_at = NULL
          WHERE id = $1 AND user_id = $2
            AND status = 'pending' AND reservation_expires_at > NOW()
         RETURNING id, status`,
        [transferId, userId, status, completedAt],
      );
      if (result.rows[0]) return result.rows[0];
      const existing = await query(
        "SELECT id, status FROM transfer_batches WHERE id = $1 AND user_id = $2 AND status = $3",
        [transferId, userId, status],
      );
      return existing.rows[0] ?? null;
    },

    async recordTransfer({ userId, method, direction, status, items, startedAt, completedAt }) {
      const totalSizeBytes = items.reduce((total, item) => total + item.sizeBytes, 0);
      const batchResult = await query(
        `INSERT INTO transfer_batches
           (user_id, method, direction, status, file_count, total_size_bytes, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [userId, method, direction, status, items.length, totalSizeBytes, startedAt, completedAt],
      );
      const batchId = batchResult.rows[0].id;

      for (const [index, item] of items.entries()) {
        await query(
          `INSERT INTO transfer_items (batch_id, ordinal, size_bytes)
           VALUES ($1, $2, $3)`,
          [batchId, index + 1, item.sizeBytes],
        );
      }
      return { id: batchId };
    },

    async getProfileSummary(userId) {
      const result = await query(
        `WITH account AS (
           SELECT CASE WHEN plan IN ('free', 'standard', 'plus', 'corporate') THEN plan ELSE 'free' END AS plan,
             COALESCE(
               monthly_limit_override_bytes,
               CASE
                 WHEN plan = 'free' THEN 10485760::bigint
                 WHEN plan = 'plus' THEN 262144000::bigint
                 WHEN plan = 'corporate' THEN 1073741824::bigint
                 ELSE 52428800::bigint
               END
             ) AS limit_bytes
           FROM users WHERE id = $1
         ), history AS (
           SELECT COUNT(*)::int AS transfer_count,
             COALESCE(SUM(file_count), 0)::int AS file_count,
             COALESCE(SUM(total_size_bytes), 0)::bigint AS total_size_bytes,
             MAX(created_at) AS last_transfer_at
           FROM transfer_batches
           WHERE user_id = $1 AND status <> 'pending'
             AND created_at >= NOW() - INTERVAL '90 days'
         ), monthly AS (
           SELECT COALESCE(SUM(total_size_bytes), 0)::bigint AS used_bytes
           FROM transfer_batches
           WHERE user_id = $1 AND direction = 'send'
             AND created_at >= (date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
             AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > NOW()))
         )
         SELECT history.*, account.plan,
           monthly.used_bytes AS monthly_used_bytes,
           account.limit_bytes AS monthly_limit_bytes,
           GREATEST(account.limit_bytes - monthly.used_bytes, 0) AS monthly_remaining_bytes,
           (date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS period_start,
           ((date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC') AS period_end
         FROM account CROSS JOIN history CROSS JOIN monthly`,
        [userId],
      );
      return result.rows[0];
    },

    async listTransfers(userId, { method = null, from = null, to = null, page = 1, pageSize = 20 } = {}) {
      const offset = (page - 1) * pageSize;
      const result = await query(
        `SELECT id, method, direction, status, file_count, total_size_bytes,
                started_at, completed_at, created_at
         FROM transfer_batches
         WHERE user_id = $1
           AND status <> 'pending'
           AND ($2::text IS NULL OR method = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)
           AND ($4::timestamptz IS NULL OR created_at <= $4)
           AND created_at >= NOW() - INTERVAL '90 days'
         ORDER BY created_at DESC
         LIMIT $5 OFFSET $6`,
        [userId, method, from, to, pageSize, offset],
      );
      return result.rows;
    },
  };
}
