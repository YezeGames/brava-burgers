-- Eventos de ruta para Realtime app repartidor (sin exponer tabla orders al JWT repartidor).
-- Ejecutar en Supabase SQL Editor o migrateRepartidorRealtimeEvents desde Vercel.

CREATE TABLE IF NOT EXISTS repartidor_route_events (
  id bigserial PRIMARY KEY,
  repartidor_tel text NOT NULL,
  event_type text NOT NULL DEFAULT 'route_changed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repartidor_route_events_tel_idx
  ON repartidor_route_events (repartidor_tel, created_at DESC);

ALTER TABLE repartidor_route_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE repartidor_route_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repartidor_route_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repartidor_route_events_select_own" ON repartidor_route_events;

CREATE POLICY "repartidor_route_events_select_own" ON repartidor_route_events
  FOR SELECT TO authenticated
  USING (repartidor_tel = coalesce(auth.jwt() ->> 'repartidor_tel', ''));
