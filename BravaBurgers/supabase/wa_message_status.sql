-- Estados de entrega WhatsApp (webhook statuses → diagnóstico post-entrega / interactivos)
-- Migración automática: migrateWaMessageStatus en lib/dbMigrate.js

CREATE TABLE IF NOT EXISTS wa_message_status (
  id bigserial PRIMARY KEY,
  wa_message_id text NOT NULL,
  tel text NOT NULL DEFAULT '',
  status text NOT NULL,
  error_code int,
  error_title text,
  error_details text,
  meta_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wa_message_id, status)
);

CREATE INDEX IF NOT EXISTS wa_message_status_wamid_idx ON wa_message_status (wa_message_id);
CREATE INDEX IF NOT EXISTS wa_message_status_failed_idx ON wa_message_status (status, created_at DESC)
  WHERE status = 'failed';

GRANT ALL ON TABLE wa_message_status TO service_role;
GRANT ALL ON SEQUENCE wa_message_status_id_seq TO service_role;

ALTER TABLE wa_message_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_wa_message_status" ON wa_message_status;
CREATE POLICY "service_all_wa_message_status" ON wa_message_status
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_wa_message_status" ON wa_message_status;
CREATE POLICY "admin_read_wa_message_status" ON wa_message_status
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON TABLE wa_message_status TO authenticated;

NOTIFY pgrst, 'reload schema';
