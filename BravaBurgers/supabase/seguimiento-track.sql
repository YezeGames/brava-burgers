-- Ubicación en vivo para seguimiento cliente (parada activa en_camino)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS track_lat double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS track_lng double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS track_at timestamptz;
