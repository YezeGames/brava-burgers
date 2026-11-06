-- Soporte repartidor ↔ cocina (chat in-app por ORN)

CREATE TABLE IF NOT EXISTS repartidor_support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repartidor_tel text NOT NULL,
  orn text NOT NULL,
  parada int,
  topic text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by text,
  creado_at timestamptz NOT NULL DEFAULT now(),
  cerrado_at timestamptz,
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repartidor_support_threads_tel_idx ON repartidor_support_threads (repartidor_tel, actualizado_at DESC);
CREATE INDEX IF NOT EXISTS repartidor_support_threads_orn_idx ON repartidor_support_threads (orn);
CREATE INDEX IF NOT EXISTS repartidor_support_threads_open_idx ON repartidor_support_threads (status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS repartidor_support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES repartidor_support_threads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('rider', 'admin', 'system')),
  body text NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repartidor_support_messages_thread_idx ON repartidor_support_messages (thread_id, creado_at ASC);

-- Realtime (admin + app repartidor): publicar tablas y RLS para JWT admin/repartidor.
ALTER TABLE repartidor_support_threads REPLICA IDENTITY FULL;
ALTER TABLE repartidor_support_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE repartidor_support_threads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE repartidor_support_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repartidor_support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE repartidor_support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_repartidor_support_threads" ON repartidor_support_threads;
CREATE POLICY "admin_all_repartidor_support_threads" ON repartidor_support_threads
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_all_repartidor_support_messages" ON repartidor_support_messages;
CREATE POLICY "admin_all_repartidor_support_messages" ON repartidor_support_messages
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "repartidor_select_own_support_threads" ON repartidor_support_threads;
CREATE POLICY "repartidor_select_own_support_threads" ON repartidor_support_threads
  FOR SELECT TO authenticated
  USING (repartidor_tel = coalesce(auth.jwt() ->> 'repartidor_tel', ''));

DROP POLICY IF EXISTS "repartidor_select_own_support_messages" ON repartidor_support_messages;
CREATE POLICY "repartidor_select_own_support_messages" ON repartidor_support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM repartidor_support_threads t
      WHERE t.id = repartidor_support_messages.thread_id
        AND t.repartidor_tel = coalesce(auth.jwt() ->> 'repartidor_tel', '')
    )
  );

GRANT SELECT ON TABLE repartidor_support_threads TO authenticated;
GRANT SELECT ON TABLE repartidor_support_messages TO authenticated;
