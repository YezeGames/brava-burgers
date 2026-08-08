-- Pedidos en reparto: timestamp opcional (estado en_camino)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_camino_at timestamptz;
