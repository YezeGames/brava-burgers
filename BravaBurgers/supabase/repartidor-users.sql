-- Cuentas app repartidor (login + contraseña; teléfono para asignación de pedidos)

CREATE TABLE IF NOT EXISTS repartidor_users (
  login text PRIMARY KEY,
  telefono text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repartidor_users_tel_idx ON repartidor_users (telefono);
CREATE INDEX IF NOT EXISTS repartidor_users_activo_idx ON repartidor_users (activo);
