-- Si ya creaste cierres_caja sin turnos: ejecutá esto en Supabase → SQL (una vez).

ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS turno text NOT NULL DEFAULT '';
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ventana_desde timestamptz;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ventana_hasta timestamptz;
