-- Ejecutar una vez en Supabase SQL Editor (histórico Cierre operativo completo).
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS snapshot_json jsonb;
