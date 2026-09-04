import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runMigrations } from "../db/migration-runner.js";

function createPool(client) {
  return { connect: vi.fn().mockResolvedValue(client) };
}

describe("veritabanı göç çalıştırıcısı", () => {
  it("ikinci çalıştırmada kalıcı geçmişi okuyup SQL dosyalarını yeniden çalıştırmaz", async () => {
    const appliedMigrations = new Set();
    const client = {
      query: vi.fn(async (sql, parameters = []) => {
        if (sql.includes("SELECT migration_name")) {
          return { rows: [...appliedMigrations].map((migration_name) => ({ migration_name })) };
        }
        if (sql.includes("INSERT INTO schema_migrations")) {
          appliedMigrations.add(parameters[0]);
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = createPool(client);
    const migrations = ["001_first.sql", "002_second.sql"];
    const readMigration = vi.fn(async (fileName) => `-- ${fileName}`);

    await expect(runMigrations({ pool, migrations, readMigration })).resolves.toEqual(migrations);
    await expect(runMigrations({ pool, migrations, readMigration })).resolves.toEqual([]);

    expect(readMigration).toHaveBeenCalledTimes(2);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO schema_migrations"),
      ["001_first.sql"],
    );
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it("göç listesini işlem kilidini aldıktan sonra kontrol eder", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    const readMigration = vi.fn(async (fileName) => `-- ${fileName}`);

    await runMigrations({
      pool: createPool(client),
      migrations: ["001_first.sql"],
      readMigration,
    });

    const executedSql = client.query.mock.calls.map(([sql]) => sql);
    const beginIndex = executedSql.indexOf("BEGIN");
    const lockIndex = executedSql.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
    const historyIndex = executedSql.findIndex((sql) => sql.includes("SELECT migration_name"));
    const migrationIndex = executedSql.indexOf("-- 001_first.sql");
    expect(beginIndex).toBe(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(historyIndex).toBeGreaterThan(lockIndex);
    expect(migrationIndex).toBeGreaterThan(historyIndex);
  });

  it("eşzamanlı iki çalıştırıcıda aynı göçü yalnız bir kez uygular", async () => {
    const appliedMigrations = new Set();
    let waitForMigrationLock = Promise.resolve();
    const createClient = () => {
      let releaseMigrationLock;
      return {
        query: vi.fn(async (sql, parameters = []) => {
          if (sql.includes("pg_advisory_xact_lock")) {
            const previousLock = waitForMigrationLock;
            waitForMigrationLock = new Promise((resolve) => { releaseMigrationLock = resolve; });
            await previousLock;
          }
          if (sql.includes("SELECT migration_name")) {
            return { rows: [...appliedMigrations].map((migration_name) => ({ migration_name })) };
          }
          if (sql.includes("INSERT INTO schema_migrations")) {
            appliedMigrations.add(parameters[0]);
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") releaseMigrationLock?.();
          return { rows: [] };
        }),
        release: vi.fn(),
      };
    };
    const pool = { connect: vi.fn(async () => createClient()) };
    const readMigration = vi.fn(async (fileName) => `-- ${fileName}`);

    const results = await Promise.all([
      runMigrations({ pool, migrations: ["001_first.sql"], readMigration }),
      runMigrations({ pool, migrations: ["001_first.sql"], readMigration }),
    ]);

    expect(results).toEqual(expect.arrayContaining([["001_first.sql"], []]));
    expect(readMigration).toHaveBeenCalledTimes(1);
  });

  it("mevcut free planlı eski veritabanında 002 öncesi geçici kısıt ihlali oluşturmaz", async () => {
    const migrationSql = await readFile(
      join(process.cwd(), "server", "db", "migrations", "002_monthly_plan_quotas.sql"),
      "utf8",
    );

    expect(migrationSql).toMatch(/plan IN \('free', 'standard', 'plus', 'corporate'\)/);
  });

  it("geçmişte kayıtlı göçleri okumadan ve çalıştırmadan atlar", async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes("SELECT migration_name")) {
          return { rows: [{ migration_name: "001_first.sql" }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const readMigration = vi.fn(async (fileName) => `-- ${fileName}`);

    await expect(runMigrations({
      pool: createPool(client),
      migrations: ["002_second.sql", "001_first.sql"],
      readMigration,
    })).resolves.toEqual(["002_second.sql"]);

    expect(readMigration).toHaveBeenCalledWith("002_second.sql");
    expect(readMigration).not.toHaveBeenCalledWith("001_first.sql");
  });

  it("başarısız göçü kaydetmez, işlemi geri alır ve bağlantıyı serbest bırakır", async () => {
    const migrationError = new Error("002 başarısız");
    const client = {
      query: vi.fn(async (sql) => {
        if (sql === "-- 002_second.sql") throw migrationError;
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const readMigration = vi.fn(async (fileName) => `-- ${fileName}`);

    await expect(runMigrations({
      pool: createPool(client),
      migrations: ["001_first.sql", "002_second.sql"],
      readMigration,
    })).rejects.toThrow(migrationError);

    const executedSql = client.query.mock.calls.map(([sql]) => sql);
    expect(executedSql).toContain("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO schema_migrations"),
      ["002_second.sql"],
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
