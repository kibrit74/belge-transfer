import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

it("admin rolü, hesap kısıtları ve değiştirilemez audit kaydı oluşturur", async () => {
  const sql = await readFile(
    join(process.cwd(), "server", "db", "migrations", "008_admin_panel_mvp.sql"),
    "utf8",
  );

  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS role/i);
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS status/i);
  expect(sql).toMatch(/monthly_limit_override_bytes/i);
  expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS admin_audit_logs/i);
  expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS system_logs/i);
  expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON admin_audit_logs/i);
  expect(sql).not.toMatch(/file_name|encryption_key|qr_data|BYTEA/i);
});
