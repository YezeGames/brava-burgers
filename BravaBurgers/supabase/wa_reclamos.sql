-- Sesiones del bot de reclamo + reclamos confirmados (WhatsApp post-entrega).
-- En producción: migración automática (migrateWaReclamos / ensureWaReclamoSchema en Vercel).
-- Este archivo es referencia manual si hiciera falta.

CREATE TABLE IF NOT EXISTS wa_reclamo_sessions (
  tel text PRIMARY KEY,
  orn text,
  step text,
  motivo text,
  descripcion text,
  reclamo_id text,
  photo_media_id text,
  open boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_reclamos (
  reclamo_id text PRIMARY KEY,
  orn text NOT NULL,
  tel text NOT NULL,
  motivo text,
  descripcion text,
  photo_media_id text,
  estado text DEFAULT 'abierto',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_reclamos_tel_idx ON wa_reclamos (tel, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_reclamos_estado_idx ON wa_reclamos (estado, created_at DESC);

ALTER TABLE wa_reclamo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_reclamos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_wa_reclamo_sessions" ON wa_reclamo_sessions;
CREATE POLICY "service_all_wa_reclamo_sessions" ON wa_reclamo_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_wa_reclamos" ON wa_reclamos;
CREATE POLICY "service_all_wa_reclamos" ON wa_reclamos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE wa_reclamo_sessions TO service_role;
GRANT ALL ON TABLE wa_reclamos TO service_role;
