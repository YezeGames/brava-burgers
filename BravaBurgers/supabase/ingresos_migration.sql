-- Ingresos manuales (mostrador / fuera web) + columna en cierres
-- Ejecutar en Supabase SQL Editor (producción Brava)

CREATE TABLE IF NOT EXISTS ingresos (
  id text PRIMARY KEY,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  concepto text NOT NULL,
  monto numeric NOT NULL,
  cobrado_con text NOT NULL DEFAULT '',
  creado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingresos_fecha_idx ON ingresos (fecha DESC);

INSERT INTO admin_counters (key, value) VALUES ('ingreso_id', 0)
ON CONFLICT (key) DO NOTHING;

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

ALTER TABLE ingresos REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE ingresos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ingresos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_ingresos" ON ingresos;

CREATE POLICY "admin_all_ingresos" ON ingresos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ingresos numeric NOT NULL DEFAULT 0;
