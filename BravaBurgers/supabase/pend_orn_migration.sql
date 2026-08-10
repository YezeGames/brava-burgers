-- Pedidos pendientes/rechazados sin ORN-DEL (ORN solo al aceptar en admin)
INSERT INTO admin_counters (key, value) VALUES ('pend_del', 0)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_pend_del()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO admin_counters (key, value) VALUES ('pend_del', 0)
  ON CONFLICT (key) DO NOTHING;
  UPDATE admin_counters SET value = value + 1 WHERE key = 'pend_del' RETURNING value INTO n;
  RETURN 'PEND-DEL-' || lpad(n::text, 4, '0');
END;
$$;
