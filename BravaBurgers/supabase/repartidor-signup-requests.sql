-- Solicitudes de cuenta desde app repartidor (aprobación en admin Reparto)

CREATE TABLE IF NOT EXISTS repartidor_signup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  apellido text NOT NULL,
  telefono text NOT NULL,
  login_requested text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  creado_at timestamptz NOT NULL DEFAULT now(),
  resuelto_at timestamptz
);

CREATE INDEX IF NOT EXISTS repartidor_signup_requests_status_idx ON repartidor_signup_requests (status, creado_at DESC);
CREATE INDEX IF NOT EXISTS repartidor_signup_requests_tel_idx ON repartidor_signup_requests (telefono);
