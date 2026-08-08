const { Client } = require('pg');

function postgresConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    ''
  );
}

async function migrateEnCaminoColumn() {
  const conn = postgresConnectionString();
  if (!conn) {
    return { ok: false, error: 'no_postgres_url', hint: 'Falta POSTGRES_URL en Vercel (integración Supabase).' };
  }
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_camino_at timestamptz;');
    return { ok: true, migrated: true };
  } catch (e) {
    return { ok: false, error: 'migration_failed', detail: String(e.message || e) };
  } finally {
    try {
      await client.end();
    } catch (e2) {}
  }
}

module.exports = { migrateEnCaminoColumn };
