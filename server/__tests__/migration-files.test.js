import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listMigrationFiles } from "../db/migration-files.js";

it("işlem öğelerinden dosya uzantısı sütununu kaldırır", async () => {
  const sql = await readFile(
    join(process.cwd(), "server", "db", "migrations", "006_drop_transfer_item_extension.sql"),
    "utf8",
  );

  expect(sql).toMatch(/DROP COLUMN IF EXISTS extension/i);
});

it("Secure Link tablosunu ileri yönlü geçişle kaldırır", async () => {
  const sql = await readFile(
    join(process.cwd(), "server", "db", "migrations", "005_drop_secure_shares.sql"),
    "utf8",
  );
  expect(sql).toMatch(/DROP TABLE IF EXISTS secure_shares/i);
  expect(sql).not.toMatch(/encrypted_payload\s+BYTEA/i);
});

describe("veritabanı göç dosyaları", () => {
  it("yalnız SQL göçlerini ad sırasıyla döndürür", () => {
    expect(listMigrationFiles(["002_monthly.sql", "README.md", "001_auth.sql"]))
      .toEqual(["001_auth.sql", "002_monthly.sql"]);
  });
});

it("Yakındaki Cihazlar odalarını yalnız geçici sinyal verisiyle saklar", async () => {
  const sql = await readFile(
    join(process.cwd(), "server", "db", "migrations", "007_nearby_signaling.sql"),
    "utf8",
  );

  expect(sql).toMatch(/CREATE TABLE nearby_rooms/i);
  expect(sql).toMatch(/CREATE TABLE nearby_signals/i);
  expect(sql).toMatch(/expires_at/i);
  expect(sql).toMatch(/ON DELETE CASCADE/i);
  expect(sql).not.toMatch(/file_name|mime|sha256|file_bytes|BYTEA/i);
});
