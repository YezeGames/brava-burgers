-- Pedidos: timestamps de reparto y cocina
ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_camino_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_preparacion_at timestamptz;
