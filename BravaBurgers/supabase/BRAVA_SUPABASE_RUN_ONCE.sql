-- Brava Burgers — pegar TODO en Supabase SQL Editor → Run (una vez)

-- ========== CIERRES DE CAJA ==========
CREATE TABLE IF NOT EXISTS cierres_caja (
  id text PRIMARY KEY,
  cerrado_at timestamptz NOT NULL DEFAULT now(),
  periodo_desde date NOT NULL,
  periodo_hasta date NOT NULL,
  efectivo numeric NOT NULL DEFAULT 0,
  mercado_pago numeric NOT NULL DEFAULT 0,
  ventas_total numeric NOT NULL DEFAULT 0,
  gastos numeric NOT NULL DEFAULT 0,
  ingresos numeric NOT NULL DEFAULT 0,
  resultado numeric NOT NULL DEFAULT 0,
  cancelados numeric NOT NULL DEFAULT 0,
  hamb_simples bigint NOT NULL DEFAULT 0,
  hamb_dobles bigint NOT NULL DEFAULT 0,
  hamb_total bigint NOT NULL DEFAULT 0,
  notas text NOT NULL DEFAULT '',
  turno text NOT NULL DEFAULT '',
  ventana_desde timestamptz,
  ventana_hasta timestamptz
);

CREATE INDEX IF NOT EXISTS cierres_caja_cerrado_idx ON cierres_caja (cerrado_at DESC);

ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ingresos numeric NOT NULL DEFAULT 0;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ventana_desde timestamptz;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ventana_hasta timestamptz;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS snapshot_json jsonb;

INSERT INTO admin_counters (key, value) VALUES ('cierre_id', 0)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_cierre_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO admin_counters (key, value) VALUES ('cierre_id', 0)
  ON CONFLICT (key) DO NOTHING;
  UPDATE admin_counters SET value = value + 1 WHERE key = 'cierre_id' RETURNING value INTO n;
  RETURN 'CIE-' || lpad(n::text, 4, '0');
END;
$$;

ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_cierres" ON cierres_caja;
CREATE POLICY "admin_all_cierres" ON cierres_caja
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== INGRESOS MANUALES (admin) ==========
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
