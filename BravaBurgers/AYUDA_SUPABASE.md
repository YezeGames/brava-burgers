# Supabase — panel admin en vivo (pedidos + caja)

**Menú / tienda Pedilo:** sigue en Google Sheets (Excel). No tocás eso.

**Panel `/admin`:** pedidos + gastos + caja en **Supabase**, actualización **en vivo**.

Cuando un cliente pide en la web → WhatsApp (como ahora) + el pedido entra en Supabase → el admin se entera al instante.

---

## Parte 1 — Crear Supabase (15 min, una sola vez)

1. Entrá a [supabase.com](https://supabase.com) → **Start your project** (gratis).
2. Creá un proyecto (nombre ej. `brava-burgers`, contraseña de base anotala).
3. Cuando termine de cargar, andá a **SQL Editor** → **New query**.
4. Abrí en tu PC el archivo `supabase/schema.sql` de este repo, **copiá todo**, pegá en Supabase y **Run**.

   **Si sale error `policy "admin_all_orders" already exists`:** la base **ya está casi lista**. No hace falta volver a pegar todo. En SQL Editor ejecutá solo esto y **Run**:

   ```sql
   DROP POLICY IF EXISTS "admin_all_orders" ON orders;
   DROP POLICY IF EXISTS "admin_all_gastos" ON gastos;
   CREATE POLICY "admin_all_orders" ON orders
     FOR ALL TO authenticated USING (true) WITH CHECK (true);
   CREATE POLICY "admin_all_gastos" ON gastos
     FOR ALL TO authenticated USING (true) WITH CHECK (true);
   ```

   O ignorá el error y seguí al paso 5.

5. **Usuario admin para “En vivo”** (menú izquierdo del proyecto Supabase):

   - Buscá el ícono **Authentication** (candado) o el texto **Auth** → entrá.
   - Pestaña **Users**.
   - Botón verde **Add user** / **Invite** → elegí **Create new user** (crear usuario, no invitar por mail).
   - **Email:** ej. `admin@brava.local` (después lo repetís en Vercel como `SUPABASE_ADMIN_EMAIL`).
   - **Password:** una clave que elijas (misma en Vercel como `SUPABASE_ADMIN_PASSWORD`).
   - Activá **Auto Confirm User** / **Confirm email** si aparece.
   - **Create user**.

   *Si no ves “Authentication”:* abrí el menú **☰** arriba a la izquierda dentro del proyecto, o la barra lateral con iconos (Home, Table Editor, SQL, **Auth**, Storage, etc.).

6. **Claves para Vercel** (URL y API keys):

   - Abajo a la izquierda: **Project Settings** (engranaje) → **API**.
   - Arriba copiá **Project URL** → `SUPABASE_URL`  
     (ej. `https://yjwikpwvjpymphiwuocz.supabase.co`).

   **Si ves “Publishable and secret API keys”** (pantalla nueva):

   | En Supabase | Variable en Vercel |
   |-------------|-------------------|
   | **Publishable key** (`sb_publishable_…`) | `SUPABASE_ANON_KEY` |
   | **Secret keys** → default → copiar (`sb_secret_…`) | `SUPABASE_SERVICE_ROLE_KEY` |

   Clic en el **ojo** o **Copy** del secret; no lo mandes por chat.

   **Si algo falla en Vercel**, en la misma página abrí la pestaña  
   **Legacy anon, service_role API keys** y usá:
   - **anon** → `SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY`

   *En el dashboard nuevo:* también puede estar **Connect** mostrando la URL.
### Si ya tenías pedidos con ORN-DEL-0032 en el sheet

En SQL Editor:

```sql
UPDATE admin_counters SET value = 32 WHERE key = 'orn_del';
```

(Cambiá `32` por el último número que uses.)

---

## Atajo: conectar Supabase con Vercel (recomendado)

Así Supabase **inyecta solo** URL + keys en Vercel (no hace falta copiar `sb_secret` a mano):

1. Supabase → proyecto **brava-burgers** → **Integrations** (o buscá **Vercel** en el menú).
2. **Vercel** → **Install** / **Connect**.
3. Autorizá Vercel y elegí el proyecto **brava-burgers** (team **bravaburgers**).
4. Al terminar, en Vercel → **Settings → Environment Variables** deberían aparecer variables del estilo `SUPABASE_URL`, keys, etc.

**Igual tenés que agregar a mano** (Add Environment Variable):

| Name | Value |
|------|--------|
| `SUPABASE_ADMIN_EMAIL` | `admin@brava.com` |
| `SUPABASE_ADMIN_PASSWORD` | clave del usuario Auth |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASSWORD` | clave del panel `/admin` |
| `ADMIN_SESSION_SECRET` | texto largo aleatorio |
| `BRAVA_ORDER_SECRET` | el de la tienda (ej. `BravaClavePedidos2026`) |

Si la integración usa otros nombres (`NEXT_PUBLIC_…`), el código del repo también los lee; podés duplicar o renombrar a `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Luego **Redeploy** en Vercel.

---

Proyecto **brava-burgers** → **Settings** → **Environment Variables**.

| Nombre | Valor |
|--------|--------|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role |
| `SUPABASE_ADMIN_EMAIL` | mismo email del usuario Auth |
| `SUPABASE_ADMIN_PASSWORD` | misma clave del usuario Auth |
| `ADMIN_USER` | usuario para entrar al panel (ej. `admin`) |
| `ADMIN_PASSWORD` | clave del panel (la que usás en `/admin`) |
| `ADMIN_SESSION_SECRET` | texto largo aleatorio (sesión del panel) |
| `BRAVA_ORDER_SECRET` | igual que antes (pedidos desde la tienda) |

**Ya no hace falta** `BRAVA_GAS_URL` para el **admin** (podés dejarlo si querés backup; los pedidos nuevos van a Supabase cuando Supabase está configurado).

**Redeploy** en Vercel después de guardar.

---

## Parte 3 — Probar

1. [brava-burgers.vercel.app/admin](https://brava-burgers.vercel.app/admin) → login con `ADMIN_USER` / `ADMIN_PASSWORD`.
2. Arriba debería decir **En vivo · Supabase**.
3. Hacé un pedido de prueba en la tienda → en unos segundos (o al instante) aparece en **Pendiente** y suena si activaste sonido.

---

## Qué va dónde

| Qué | Dónde |
|-----|--------|
| Productos, precios, menú | Google Sheet Pedilo |
| Pedido del cliente (web) | Supabase `orders` + WhatsApp |
| Aceptar / rechazar / entregar | Supabase (panel) |
| Gastos y caja | Supabase `gastos` (panel) |
| Cierre de caja + conteo hamburguesas | Supabase `cierres_caja` (panel) |

**Cierre de caja (ago 2026):** si el botón «Cierre de caja» falla al guardar, en **SQL Editor** ejecutá el archivo `supabase/cierres_caja_migration.sql` (una sola vez).

---

## Problemas comunes

- **`policy "admin_all_orders" already exists`** → El SQL ya corrió antes; seguí al paso 5 o ejecutá el bloque `DROP POLICY` del paso 4.
- **Login ok pero no dice “En vivo”** → revisá usuario Auth (paso 5) y `SUPABASE_ADMIN_*` en Vercel.
- **Pedido no aparece** → redeploy Vercel, mirá que existan las 3 variables `SUPABASE_*` keys.
- **Realtime no conecta** → en Supabase **Database** → **Publications** → `supabase_realtime` debe incluir `orders` y `gastos`.

Si querés, en otro paso importamos pedidos viejos del sheet a Supabase (una sola vez).
