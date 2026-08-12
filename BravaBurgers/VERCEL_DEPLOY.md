# Deploy en Vercel (Brava Burgers)

## Error: `invalid name: "'BRAVA BURGERS/api/admin.js'"` (espacio en la ruta)

Vercel **no permite espacios** en la ruta del proyecto. Si la carpeta se llama `BRAVA BURGERS`, el deploy **siempre falla** al crear `/api`.

**Solución A (recomendada):** carpeta del proyecto **`BravaBurgers`** (sin espacios), ej. `Documents\BravaBurgers`.

**Solución B (solo upload):** al hacer el zip, comprimí **el contenido** (`index.html`, `api/`, `lib/`, …), **no** la carpeta padre `BRAVA BURGERS`. En Vercel, **Root Directory** vacío.

**Solución C:** en Vercel → **Settings → General → Root Directory**, si apunta a una carpeta con espacio, cambiarla a una ruta sin espacios.

Las variables de entorno no causan este error.

---

`BRAVA_GAS_URL` y `BRAVA_ORDER_SECRET` se usan **en runtime** (cuando alguien pide o guarda un pedido). Si el deploy falla en **Building**, casi siempre es:

- Falta la carpeta **`api/`** o **`lib/`** en lo que subiste
- **`vercel.json`** inválido
- Algún archivo en **`api/`** mal formado

## Ver el error exacto

1. **Deployments** → clic en el deploy **Error** (rojo)
2. Pestaña **Building** (o **Logs**)
3. Copiá las últimas líneas rojas (ej. `Invalid route`, `Cannot find module`, `No exports found`)

## Subir el proyecto completo

Si usás **Upload**, el zip debe incluir **en la raíz** (no adentro de otra carpeta):

- `index.html`, `brava-*.js`, `brava-brand.css`
- `vercel.json`, `package.json`
- **`api/`** (`pedido.js`, `admin.js`)
- **`lib/`** (`gasFetch.js`)
- **`admin/`** (`index.html`, `admin.js`)

Proyecto → **Settings** → **General** → **Root Directory** debe estar **vacío** (raíz del repo).

## Si necesitás la web ya

Deployments → el deploy **Ready** verde (el de hace ~2 h) → **⋯** → **Redeploy**  
Eso vuelve a la tienda **sin** `/api` ni `/admin` nuevos hasta que un deploy nuevo pase.

## Después de arreglar archivos

1. Subí de nuevo **todo** el proyecto (o push a GitHub si conectaste repo)
2. **Redeploy**
3. Probar: `https://brava-burgers.vercel.app/api/pedido` → POST only; GET puede dar 405 (normal)
