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

async function migrateIngresosSchema() {
  const conn = postgresConnectionString();
  if (!conn) {
    return {
      ok: false,
      error: 'no_postgres_url',
      hint: 'En Vercel agregá SUPABASE_DB_PASSWORD (Database password en Supabase) o POSTGRES_URL. La service key no alcanza para migrar.',
    };
  }
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS ingresos (
        id text PRIMARY KEY,
        fecha date NOT NULL DEFAULT CURRENT_DATE,
        concepto text NOT NULL,
        monto numeric NOT NULL,
        cobrado_con text NOT NULL DEFAULT '',
        creado_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS ingresos_fecha_idx ON ingresos (fecha DESC);');
    await client.query(
      "INSERT INTO admin_counters (key, value) VALUES ('ingreso_id', 0) ON CONFLICT (key) DO NOTHING;"
    );
    await client.query(`
      CREATE OR REPLACE FUNCTION public.next_ingreso_id()
      RETURNS text
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE n bigint;
      BEGIN
        INSERT INTO admin_counters (key, value) VALUES ('ingreso_id', 0)
        ON CONFLICT (key) DO NOTHING;
        UPDATE admin_counters SET value = value + 1 WHERE key = 'ingreso_id' RETURNING value INTO n;
        RETURN 'ING-' || lpad(n::text, 4, '0');
      END;
      $$;
    `);
    await client.query('ALTER TABLE ingresos REPLICA IDENTITY FULL;');
    await client.query('ALTER TABLE ingresos ENABLE ROW LEVEL SECURITY;');
    await client.query('DROP POLICY IF EXISTS "admin_all_ingresos" ON ingresos;');
    await client.query(
      'CREATE POLICY "admin_all_ingresos" ON ingresos FOR ALL TO authenticated USING (true) WITH CHECK (true);'
    );
    await client.query(
      'ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ingresos numeric NOT NULL DEFAULT 0;'
    );
    return { ok: true, migrated: true };
  } catch (e) {
    return { ok: false, error: 'migration_failed', detail: String(e.message || e) };
  } finally {
    try {
      await client.end();
    } catch (e2) {}
  }
}

async function migratePendOrnDel() {
  const conn = postgresConnectionString();
  if (!conn) {
    return {
      ok: false,
      error: 'no_postgres_url',
      hint: 'En Vercel agregá SUPABASE_DB_PASSWORD (Database password en Supabase) o POSTGRES_URL.',
    };
  }
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(
      "INSERT INTO admin_counters (key, value) VALUES ('pend_del', 0) ON CONFLICT (key) DO NOTHING;"
    );
    await client.query(`
      CREATE OR REPLACE FUNCTION public.next_pend_del()
      RETURNS text
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE n bigint;
      BEGIN
        INSERT INTO admin_counters (key, value) VALUES ('pend_del', 0)
        ON CONFLICT (key) DO NOTHING;
        UPDATE admin_counters SET value = value + 1 WHERE key = 'pend_del' RETURNING value INTO n;
        RETURN 'PEND-DEL-' || lpad(n::text, 4, '0');
      END;
      $$;
    `);
    return { ok: true, migrated: true };
  } catch (e) {
    return { ok: false, error: 'migration_failed', detail: String(e.message || e) };
  } finally {
    try {
      await client.end();
    } catch (e2) {}
  }
}

async function migrateWaMessages() {
  const conn = postgresConnectionString();
  if (!conn) {
    return {
      ok: false,
      error: 'no_postgres_url',
      hint: 'En Vercel agregá SUPABASE_DB_PASSWORD (Database password en Supabase) o POSTGRES_URL.',
    };
  }
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_messages (
        id bigserial PRIMARY KEY,
        wa_message_id text UNIQUE,
        tel text NOT NULL,
        direction text NOT NULL CHECK (direction IN ('in', 'out')),
        body text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS wa_messages_tel_created_idx ON wa_messages (tel, created_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS wa_messages_created_idx ON wa_messages (created_at DESC);'
    );
    await client.query('ALTER TABLE wa_messages REPLICA IDENTITY FULL;');
    await client.query(`
      DO $$
      BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE wa_messages;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await client.query('GRANT ALL ON TABLE wa_messages TO service_role;');
    await client.query('GRANT ALL ON SEQUENCE wa_messages_id_seq TO service_role;');
    await client.query('ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;');
    await client.query('DROP POLICY IF EXISTS "service_all_wa_messages" ON wa_messages;');
    await client.query(`
      CREATE POLICY "service_all_wa_messages" ON wa_messages
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    `);
    await client.query("NOTIFY pgrst, 'reload schema';");
    return { ok: true, migrated: true };
  } catch (e) {
    return { ok: false, error: 'migration_failed', detail: String(e.message || e) };
  } finally {
    try {
      await client.end();
    } catch (e2) {}
  }
}

module.exports = {
  migrateEnCaminoColumn,
  migrateIngresosSchema,
  migratePendOrnDel,
  migrateWaMessages,
};
