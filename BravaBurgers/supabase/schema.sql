-- Brava Burgers — panel admin (pedidos + caja)
-- Ejecutá todo este archivo en Supabase → SQL → New query → Run

-- Contador ORN (mismo formato que antes: ORN-DEL-0001)
CREATE TABLE IF NOT EXISTS admin_counters (
  key text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0
);
INSERT INTO admin_counters (key, value) VALUES ('orn_del', 0)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_orn_del()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  UPDATE admin_counters SET value = value + 1 WHERE key = 'orn_del' RETURNING value INTO n;
  RETURN 'ORN-DEL-' || lpad(n::text, 4, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS orders (
  orn text PRIMARY KEY,
  fecha_creado timestamptz NOT NULL DEFAULT now(),
  estado text NOT NULL DEFAULT 'pendiente',
  cliente text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  direccion text NOT NULL DEFAULT '',
  localidad text NOT NULL DEFAULT '',
  piso text NOT NULL DEFAULT '',
  turno text NOT NULL DEFAULT '',
  zona text NOT NULL DEFAULT '',
  envio numeric NOT NULL DEFAULT 0,
  pago text NOT NULL DEFAULT '',
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  modificado text NOT NULL DEFAULT '',
  modificado_at timestamptz,
  entregado_at timestamptz,
  cancelado_at timestamptz,
  aceptado_at timestamptz,
  en_camino_at timestamptz,
  rechazado_at timestamptz,
  rechazo_mensaje text NOT NULL DEFAULT '',
  idempotency_key text UNIQUE
);

CREATE INDEX IF NOT EXISTS orders_fecha_idx ON orders (fecha_creado DESC);
CREATE INDEX IF NOT EXISTS orders_estado_idx ON orders (estado);

CREATE TABLE IF NOT EXISTS gastos (
  id text PRIMARY KEY,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  concepto text NOT NULL,
  monto numeric NOT NULL,
  pagado_con text NOT NULL DEFAULT '',
  creado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gastos_fecha_idx ON gastos (fecha DESC);

CREATE OR REPLACE FUNCTION public.next_gasto_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO admin_counters (key, value) VALUES ('gasto_id', 0)
  ON CONFLICT (key) DO NOTHING;
  UPDATE admin_counters SET value = value + 1 WHERE key = 'gasto_id' RETURNING value INTO n;
  RETURN 'GAS-' || lpad(n::text, 4, '0');
END;
$$;

ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE gastos REPLICA IDENTITY FULL;

-- Realtime (si falla "already member", ignorá esas dos líneas)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE gastos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS: solo usuarios autenticados (admin) leen/escriben; inserts de tienda van con service_role en Vercel
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_orders" ON orders;
DROP POLICY IF EXISTS "admin_all_gastos" ON gastos;

CREATE POLICY "admin_all_orders" ON orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "admin_all_gastos" ON gastos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Cierres de caja (snapshot al cerrar turno / día)
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

ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_cierres" ON cierres_caja;
CREATE POLICY "admin_all_cierres" ON cierres_caja
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE cierres_caja REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cierres_caja;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migración: pedidos «en camino» (ejecutar en Supabase si orders ya existía)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_camino_at timestamptz;
