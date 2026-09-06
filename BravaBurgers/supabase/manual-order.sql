-- Pedido manual: agenda clientes + columnas en orders
-- Supabase → SQL Editor → pegar todo → Run
-- Proyecto: https://supabase.com/dashboard/project/yjwikpwvjpymphiwuocz/sql/new

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

CREATE INDEX IF NOT EXISTS clientes_nombre_idx ON clientes (nombre);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'web';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nota_pedido text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ajuste_label text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ajuste_monto numeric NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ajuste_motivo text NOT NULL DEFAULT '';

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

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_clientes" ON clientes;
CREATE POLICY "service_all_clientes" ON clientes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_clientes" ON clientes;
CREATE POLICY "admin_read_clientes" ON clientes
  FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
