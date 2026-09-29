-- Pin de entrega (checkout / geocode) para repartidor sin demora.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lng double precision;
