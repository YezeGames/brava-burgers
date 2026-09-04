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
