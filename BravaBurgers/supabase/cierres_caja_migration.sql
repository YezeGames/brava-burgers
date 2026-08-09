-- Si ya tenías schema.sql aplicado antes de ago 2026: ejecutá solo este archivo en Supabase → SQL.

CREATE TABLE IF NOT EXISTS cierres_caja (
  id text PRIMARY KEY,
  cerrado_at timestamptz NOT NULL DEFAULT now(),
  periodo_desde date NOT NULL,
  periodo_hasta date NOT NULL,
  efectivo numeric NOT NULL DEFAULT 0,
  mercado_pago numeric NOT NULL DEFAULT 0,
  ventas_total numeric NOT NULL DEFAULT 0,
  gastos numeric NOT NULL DEFAULT 0,
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

ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ingresos numeric NOT NULL DEFAULT 0;

ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_cierres" ON cierres_caja;
CREATE POLICY "admin_all_cierres" ON cierres_caja
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
