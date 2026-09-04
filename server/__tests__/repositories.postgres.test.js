import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepositories } from "../repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;

describeWithPostgres("PostgreSQL kota rezervasyonu entegrasyonu", () => {
  const schemaName = `vaultdrop_test_${randomUUID().replaceAll("-", "")}`;
  let pool;
  let repositories;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    await pool.query(`CREATE SCHEMA "${schemaName}"`);
    await pool.query(`
      CREATE TABLE "${schemaName}".users (
        id TEXT PRIMARY KEY,
        plan TEXT NOT NULL
      );
      CREATE TABLE "${schemaName}".transfer_batches (
        id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
        user_id TEXT NOT NULL,
        method TEXT NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL,
        file_count INTEGER NOT NULL,
        total_size_bytes BIGINT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        reservation_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE "${schemaName}".transfer_items (
        batch_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        size_bytes BIGINT NOT NULL
      );
      INSERT INTO "${schemaName}".users (id, plan) VALUES ('user-1', 'free');
    `);

    const query = Object.assign(
      (sql, parameters = []) => pool.query(sql, parameters),
      {
        connect: async () => {
          const client = await pool.connect();
          try {
            await client.query(`SET search_path TO "${schemaName}"`);
            return client;
          } catch (error) {
            client.release();
            throw error;
          }
        },
      },
    );
    repositories = createRepositories(query);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await pool.end();
  });

  it("iki bağlantıdaki eşzamanlı istekten yalnız birine aylık kota ayırır", async () => {
    const sixMiB = 6 * 1024 * 1024;
    const request = () => repositories.reserveTransfer({
      userId: "user-1",
      method: "secure_package",
      items: [{ sizeBytes: sixMiB }],
      startedAt: new Date("2026-08-09T10:00:00.000Z"),
    });

    const results = await Promise.all([request(), request()]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });
});
