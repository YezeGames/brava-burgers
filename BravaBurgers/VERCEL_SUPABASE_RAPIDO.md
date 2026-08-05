# Vercel — cargar variables Supabase (5 min)

Abrí esta página (con tu cuenta de Vercel):

**https://vercel.com/bravaburgers/brava-burgers/settings/environment-variables**

Por cada fila: **Add Environment Variable** → Name / Value → marcar **Production** (y Preview si querés) → Save.

---

## Valores que ya sabemos

| Name | Value |
|------|--------|
| `SUPABASE_URL` | `https://yjwikpwvjpymphiwuocz.supabase.co` |
| `SUPABASE_ADMIN_EMAIL` | `admin@brava.com` |
| `SUPABASE_ADMIN_PASSWORD` | *(la que pusiste en Supabase Auth — no la pegues en chats)* |
| `ADMIN_USER` | `admin` *(o el usuario que quieras para `/admin`)* |
| `ADMIN_PASSWORD` | *(clave para entrar al panel `/admin`)* |
| `ADMIN_SESSION_SECRET` | *(inventá un texto largo, 32+ caracteres)* |
| `BRAVA_ORDER_SECRET` | `BravaClavePedidos2026` *(si ya usabas eso con la tienda; si no, el mismo que tenés en Apps Script ORDER_SECRET)* |

## Copiá desde Supabase (Settings → API)

| Name | Value |
|------|--------|
| `SUPABASE_ANON_KEY` | **Publishable key** (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret key** (`sb_secret_…`) — botón Copy |

*(Si falla, pestaña **Legacy anon, service_role** → anon + service_role.)*

---

## Después

1. **Deployments** → último deploy → **⋯** → **Redeploy** (ideal sin cache).
2. Probá **https://brava-burgers.vercel.app/admin** → debería decir **En vivo · Supabase**.

---

**Nota:** Desde acá no puedo guardar las keys en Vercel por vos porque las **secret** solo las ves vos en Supabase (Copy) y no deben pasar por el chat.
