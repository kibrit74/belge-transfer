import { Pool, neon } from "@neondatabase/serverless";

export function createDatabasePool(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL tanımlı değil.");
  return new Pool({ connectionString });
}

export function createDatabaseQuery(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL tanımlı değil.");
  const sql = neon(connectionString);
  const pool = createDatabasePool(connectionString);
  const query = (text, params = []) => sql.query(text, params, { arrayMode: false, fullResults: true });
  query.connect = () => pool.connect();
  return query;
}
