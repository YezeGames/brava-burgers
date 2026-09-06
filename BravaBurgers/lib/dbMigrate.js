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
    await client.query('DROP POLICY IF EXISTS "admin_all_wa_messages" ON wa_messages;');
    await client.query(`
      CREATE POLICY "admin_all_wa_messages" ON wa_messages
        FOR SELECT TO authenticated USING (true);
    `);
    await client.query('GRANT SELECT ON TABLE wa_messages TO authenticated;');
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

async function migrateCompensacionesSchema() {
  const conn = postgresConnectionString();
  if (!conn) {
    return {
      ok: false,
      error: 'no_postgres_url',
      hint: 'En Vercel agregá SUPABASE_DB_PASSWORD o POSTGRES_URL.',
    };
  }
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS compensaciones (
        codigo text PRIMARY KEY,
        telefono text NOT NULL,
        tipo text NOT NULL CHECK (tipo IN ('pct', 'monto', 'envio', 'item')),
        valor numeric NOT NULL DEFAULT 0,
        motivo text NOT NULL DEFAULT '',
        orn_origen text NOT NULL DEFAULT '',
        usado boolean NOT NULL DEFAULT false,
        usado_orn text,
        usado_at timestamptz,
        creado_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS compensaciones_tel_idx ON compensaciones (telefono);');
    await client.query('CREATE INDEX IF NOT EXISTS compensaciones_usado_idx ON compensaciones (usado, creado_at DESC);');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cupon_codigo text;');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cupon_label text;');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS descuento numeric NOT NULL DEFAULT 0;');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS reenvio_de text;');
    await client.query('ALTER TABLE compensaciones ENABLE ROW LEVEL SECURITY;');
    await client.query('DROP POLICY IF EXISTS "service_all_compensaciones" ON compensaciones;');
    await client.query(`
      CREATE POLICY "service_all_compensaciones" ON compensaciones
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    `);
    await client.query('DROP POLICY IF EXISTS "admin_read_compensaciones" ON compensaciones;');
    await client.query(`
      CREATE POLICY "admin_read_compensaciones" ON compensaciones
        FOR SELECT TO authenticated USING (true);
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

async function migrateManualOrderSchema() {
  const conn = postgresConnectionString();
  if (!conn) {
    return {
      ok: false,
      error: 'no_postgres_url',
      hint: 'En Vercel agregá SUPABASE_DB_PASSWORD o POSTGRES_URL para migrar.',
    };
  }
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        telefono text PRIMARY KEY,
        nombre text NOT NULL DEFAULT '',
        direccion text NOT NULL DEFAULT '',
        localidad text NOT NULL DEFAULT '',
        piso text NOT NULL DEFAULT '',
        ultimo_pedido_at timestamptz,
        origen_ultimo text NOT NULL DEFAULT 'web',
        creado_at timestamptz NOT NULL DEFAULT now(),
        actualizado_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS clientes_nombre_idx ON clientes (nombre);');
    await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'web';");
    await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS nota_pedido text NOT NULL DEFAULT '';");
    await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS ajuste_label text NOT NULL DEFAULT '';");
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS ajuste_monto numeric NOT NULL DEFAULT 0;');
    await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS ajuste_motivo text NOT NULL DEFAULT '';");
    await client.query(`
      INSERT INTO clientes (telefono, nombre, direccion, localidad, piso, ultimo_pedido_at, origen_ultimo, creado_at, actualizado_at)
      SELECT DISTINCT ON (regexp_replace(telefono, '[^0-9]', '', 'g'))
        regexp_replace(telefono, '[^0-9]', '', 'g'),
        COALESCE(cliente, ''),
        COALESCE(direccion, ''),
        COALESCE(localidad, ''),
        COALESCE(piso, ''),
        fecha_creado,
        COALESCE(origen, 'web'),
        fecha_creado,
        now()
      FROM orders
      WHERE telefono IS NOT NULL AND trim(telefono) <> ''
        AND length(regexp_replace(telefono, '[^0-9]', '', 'g')) >= 8
      ORDER BY regexp_replace(telefono, '[^0-9]', '', 'g'), fecha_creado DESC
      ON CONFLICT (telefono) DO NOTHING;
    `);
    await client.query('ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;');
    await client.query('DROP POLICY IF EXISTS "service_all_clientes" ON clientes;');
    await client.query(`
      CREATE POLICY "service_all_clientes" ON clientes
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    `);
    await client.query('DROP POLICY IF EXISTS "admin_read_clientes" ON clientes;');
    await client.query(`
      CREATE POLICY "admin_read_clientes" ON clientes
        FOR SELECT TO authenticated USING (true);
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
  migrateCompensacionesSchema,
  migrateManualOrderSchema,
};
