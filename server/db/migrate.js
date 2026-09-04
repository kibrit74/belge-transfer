import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { readConfig } from "../config.js";
import { listMigrationFiles } from "./migration-files.js";
import { runMigrations } from "./migration-runner.js";
import { createDatabasePool } from "./pool.js";

const migrationDirectory = new URL("./migrations/", import.meta.url);

export async function migrateDatabase(pool) {
  const migrations = listMigrationFiles(await readdir(migrationDirectory));
  return runMigrations({
    pool,
    migrations,
    readMigration: (fileName) => readFile(new URL(fileName, migrationDirectory), "utf8"),
  });
}

async function main() {
  const config = readConfig();
  const pool = createDatabasePool(config.databaseDirectUrl);
  try {
    const appliedMigrations = await migrateDatabase(pool);
    for (const migrationName of appliedMigrations) console.log(`${migrationName} uygulandı.`);
    console.log("VaultDrop veritabanı şeması hazır.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
