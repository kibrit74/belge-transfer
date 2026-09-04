const createMigrationHistorySql = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

export async function runMigrations({ pool, migrations, readMigration }) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('vaultdrop-schema-migrations', 0))",
    );
    await client.query(createMigrationHistorySql);
    const history = await client.query(
      "SELECT migration_name FROM schema_migrations ORDER BY migration_name",
    );
    const appliedMigrations = new Set(history.rows.map((row) => row.migration_name));
    const appliedNow = [];

    for (const migrationName of migrations.toSorted()) {
      if (appliedMigrations.has(migrationName)) continue;

      await client.query(await readMigration(migrationName));
      await client.query(
        "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
        [migrationName],
      );
      appliedNow.push(migrationName);
    }

    await client.query("COMMIT");
    transactionOpen = false;
    return appliedNow;
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
