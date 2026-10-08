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
