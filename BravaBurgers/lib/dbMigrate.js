const { Client } = require('pg');

function postgresConnectionString() {
  const direct =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    '';
  if (direct) return direct;

  const base = process.env.SUPABASE_URL || '';
  const pw = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || '';
  const m = base.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (m && pw) {
    return (
      'postgresql://postgres:' +
      encodeURIComponent(pw) +
      '@db.' +
      m[1] +
      '.supabase.co:5432/postgres?sslmode=require'
    );
  }
  return '';
}

async function migrateEnCaminoColumn() {
  const conn = postgresConnectionString();
  if (!conn) {
    return { ok: false, error: 'no_postgres_url', hint: 'Agregá POSTGRES_URL o SUPABASE_DB_PASSWORD en Vercel (password de Database en Supabase).' };
  }
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_camino_at timestamptz;');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_preparacion_at timestamptz;');
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
