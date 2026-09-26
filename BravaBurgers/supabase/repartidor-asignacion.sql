-- Asignación de ruta al repartidor (app) — ejecutar en Supabase SQL Editor si no usás migrateRepartidorAssign desde admin

ALTER TABLE orders ADD COLUMN IF NOT EXISTS repartidor_tel text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reparto_parada integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reparto_asignado_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reparto_ruta_id text;

CREATE INDEX IF NOT EXISTS orders_repartidor_tel_idx ON orders (repartidor_tel, estado);
