-- Brava Burgers — catálogo tienda (menú, horarios, promos)
-- Ejecutá en Supabase → SQL → New query (o action migrateStoreCatalogSchema desde admin)

CREATE TABLE IF NOT EXISTS store_menu_meta (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  published_at timestamptz,
  draft_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO store_menu_meta (id, draft_json) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS menu_categories (
  id bigint PRIMARY KEY,
  nombre text NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  orden int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_subcategories (
  id bigint PRIMARY KEY,
  cat_id bigint NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  orden int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS menu_subcategories_cat_idx ON menu_subcategories (cat_id, orden);

CREATE TABLE IF NOT EXISTS menu_products (
  id bigint PRIMARY KEY,
  cat_id bigint NOT NULL REFERENCES menu_categories(id),
  sub_id bigint REFERENCES menu_subcategories(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  precio numeric NOT NULL DEFAULT 0,
  ingredientes text NOT NULL DEFAULT '',
  atajo text NOT NULL DEFAULT '',
  agotado boolean NOT NULL DEFAULT false,
  oculto boolean NOT NULL DEFAULT false,
  sin_promo_menu boolean NOT NULL DEFAULT false,
  sin_promo_cat boolean NOT NULL DEFAULT false,
  imagen text NOT NULL DEFAULT '',
  orden int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS menu_products_cat_idx ON menu_products (cat_id, orden);
CREATE INDEX IF NOT EXISTS menu_products_visible_idx ON menu_products (oculto, agotado);

CREATE TABLE IF NOT EXISTS menu_extras (
  id bigint PRIMARY KEY,
  cat_id bigint NOT NULL,
  nombre text NOT NULL,
  precio numeric NOT NULL DEFAULT 0,
  atajo text NOT NULL DEFAULT '',
  oculto boolean NOT NULL DEFAULT false,
  orden int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS menu_extras_cat_idx ON menu_extras (cat_id, orden);

CREATE TABLE IF NOT EXISTS store_days (
  dow int PRIMARY KEY CHECK (dow >= 0 AND dow <= 6),
  abierto boolean NOT NULL DEFAULT false,
  desde text NOT NULL DEFAULT '20:00',
  hasta text NOT NULL DEFAULT '23:00'
);

CREATE TABLE IF NOT EXISTS store_turnos (
  id bigint PRIMARY KEY,
  nombre text NOT NULL,
  desde text NOT NULL,
  hasta text NOT NULL,
  cierre text NOT NULL,
  orden int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS store_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS menu_promos (
  id bigint PRIMARY KEY,
  nombre text NOT NULL,
  modo text NOT NULL DEFAULT 'codigo',
  codigo text NOT NULL DEFAULT '',
  tipo text NOT NULL,
  alcance text NOT NULL DEFAULT '',
  alcance_label text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0,
  hasta date,
  activa boolean NOT NULL DEFAULT true,
  un_telefono boolean NOT NULL DEFAULT true,
  no_combinar boolean NOT NULL DEFAULT true,
  exceptuados bigint[] NOT NULL DEFAULT '{}'::bigint[]
);

ALTER TABLE store_menu_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_promos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_store_menu_meta" ON store_menu_meta;
CREATE POLICY "service_all_store_menu_meta" ON store_menu_meta
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_store_menu_meta" ON store_menu_meta;
CREATE POLICY "admin_all_store_menu_meta" ON store_menu_meta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_menu_categories" ON menu_categories;
CREATE POLICY "service_all_menu_categories" ON menu_categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_menu_categories" ON menu_categories;
CREATE POLICY "admin_all_menu_categories" ON menu_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_menu_subcategories" ON menu_subcategories;
CREATE POLICY "service_all_menu_subcategories" ON menu_subcategories
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_menu_subcategories" ON menu_subcategories;
CREATE POLICY "admin_all_menu_subcategories" ON menu_subcategories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_menu_products" ON menu_products;
CREATE POLICY "service_all_menu_products" ON menu_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_menu_products" ON menu_products;
CREATE POLICY "admin_all_menu_products" ON menu_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_menu_extras" ON menu_extras;
CREATE POLICY "service_all_menu_extras" ON menu_extras
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_menu_extras" ON menu_extras;
CREATE POLICY "admin_all_menu_extras" ON menu_extras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_store_days" ON store_days;
CREATE POLICY "service_all_store_days" ON store_days
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_store_days" ON store_days;
CREATE POLICY "admin_all_store_days" ON store_days
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_store_turnos" ON store_turnos;
CREATE POLICY "service_all_store_turnos" ON store_turnos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_store_turnos" ON store_turnos;
CREATE POLICY "admin_all_store_turnos" ON store_turnos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_store_settings" ON store_settings;
CREATE POLICY "service_all_store_settings" ON store_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_store_settings" ON store_settings;
CREATE POLICY "admin_all_store_settings" ON store_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_menu_promos" ON menu_promos;
CREATE POLICY "service_all_menu_promos" ON menu_promos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_all_menu_promos" ON menu_promos;
CREATE POLICY "admin_all_menu_promos" ON menu_promos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE menu_products REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE menu_products;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
