-- Cupones de compensación (reclamos) — ejecutar en Supabase SQL Editor

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

CREATE INDEX IF NOT EXISTS compensaciones_tel_idx ON compensaciones (telefono);
CREATE INDEX IF NOT EXISTS compensaciones_usado_idx ON compensaciones (usado, creado_at DESC);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cupon_codigo text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cupon_label text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS descuento numeric NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reenvio_de text;

ALTER TABLE compensaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_compensaciones" ON compensaciones;
CREATE POLICY "service_all_compensaciones" ON compensaciones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_compensaciones" ON compensaciones;
CREATE POLICY "admin_read_compensaciones" ON compensaciones
  FOR SELECT TO authenticated USING (true);
