-- Pegar en Supabase → SQL Editor → Run (arregla cierre + ingresos manuales)

ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ingresos numeric NOT NULL DEFAULT 0;

-- Si el error decía que no existe cierres_caja, ejecutá antes:
-- supabase/cierres_caja_migration.sql
