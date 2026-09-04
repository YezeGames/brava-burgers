-- WhatsApp inbox (webhook → panel admin). Ejecutar en Supabase → SQL → Run

CREATE TABLE IF NOT EXISTS wa_messages (
  id bigserial PRIMARY KEY,
  wa_message_id text UNIQUE,
  tel text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_messages_tel_created_idx ON wa_messages (tel, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_messages_created_idx ON wa_messages (created_at DESC);

ALTER TABLE wa_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE wa_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- PostgREST + service_role (Vercel webhook/inbox)
GRANT ALL ON TABLE wa_messages TO service_role;
GRANT ALL ON SEQUENCE wa_messages_id_seq TO service_role;

ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_wa_messages" ON wa_messages;
CREATE POLICY "service_all_wa_messages" ON wa_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
