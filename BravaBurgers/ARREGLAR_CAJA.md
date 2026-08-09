# Arreglar caja / ingresos (1 minuto)

**No hace falta saber programación.** Si el cierre de caja falla, hacé **solo esto**:

## Paso 1 — Supabase (obligatorio una vez)

1. Entrá: https://supabase.com/dashboard/project/yjwikpwvjpymphiwuocz/sql/new  
2. Pegá **todo** este texto en el cuadro:

```sql
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS ingresos numeric NOT NULL DEFAULT 0;
```

3. Tocá **Run** (o Ctrl+Enter). Debe decir Success.

Para **+ Ingreso** en el admin, en el mismo SQL Editor ejecutá también el archivo  
`supabase/ingresos_migration.sql` del repo (copiar/pegar completo → Run).

## Paso 2 — Admin

1. Abrí https://brava-burgers.vercel.app/admin/  
2. **Ctrl+Shift+R** (recarga fuerte).  
3. Abrí caja → probá **Cierre de caja** y **Ticket** (comanda).

---

## Opcional (para que el sitio migre solo en el futuro)

En **Vercel** → Environment Variables:

| Name | Dónde sacarlo |
|------|----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **Secret key** |
| `SUPABASE_DB_PASSWORD` | Supabase → Settings → **Database** → database password |

Después **Redeploy** en Vercel.

**No pegues esas claves en chats ni fotos.**
