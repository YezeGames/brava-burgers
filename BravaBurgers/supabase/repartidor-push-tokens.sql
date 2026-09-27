-- Tokens FCM app repartidor (Android). Ejecutar en Supabase SQL Editor o migrateRepartidorPush desde admin.

CREATE TABLE IF NOT EXISTS repartidor_push_tokens (
  id bigserial PRIMARY KEY,
  telefono text NOT NULL,
  fcm_token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repartidor_push_tokens_tel_idx ON repartidor_push_tokens (telefono);
CREATE INDEX IF NOT EXISTS repartidor_push_tokens_updated_idx ON repartidor_push_tokens (updated_at DESC);
