# Apps Script — Brava Burgers pedidos

## 1. En Google Sheets

1. Abrí el Sheet de Brava (`productos` + `configuracion`).
2. **Extensiones → Apps Script**.
3. Borrá el contenido por defecto y pegá **`Code.gs`** de esta carpeta.
4. Guardá el proyecto (nombre ej. `Brava Pedidos`).

## 2. Propiedades del script (claves secretas)

Acá guardás la contraseña del admin y el secreto de pedidos. **No van en el código** ni en la web pública.

### Cómo llegar (interfaz actual de Google)

1. Tené abierto el editor de **Apps Script** (pestaña del navegador, no el Sheet).
2. A la **izquierda**, columna de iconos:
   - Clic en **⚙ Configuración del proyecto** (engranaje).  
   - En algunas cuentas dice **Project settings**.
3. Bajá hasta la sección **Propiedades del script** / **Script properties**.
4. Clic en **Agregar propiedad del script** / **Add script property** (puede haber que hacerlo **3 veces**, una por fila).

### Qué cargar (exacto en “Propiedad” / “Property”)

| Propiedad (copiar tal cual) | Valor (ejemplo — inventá los tuyos) |
|-----------------------------|-------------------------------------|
| `ORDER_SECRET` | `brava_xK9mP2vL8nQ4wR7tY1` (string largo, difícil de adivinar) |
| `ADMIN_USER` | `admin` (o el usuario que quieras para `/admin`) |
| `ADMIN_PASSWORD` | Tu clave del panel (ej. una frase que solo vos sepas) |
| `OPERATIONS_SHEET_ID` | *(Opcional)* ID del Sheet **privado** de pedidos + gastos. Si está vacío, usa el Sheet donde está bound el script. |

Hoja **`gastos`**: se crea sola al primer gasto desde `/admin` (columnas: id, fecha, concepto, monto, pagado_con, creado_at).

- **Nombre de propiedad:** respetá mayúsculas → `ORDER_SECRET`, no `order_secret`.
- **Valor:** sin comillas.
- Después de cada una: **Guardar propiedad del script** / **Save**.
4. Cerrá configuración y volvé al editor (**`<>` Editor** o **Editor** en la barra lateral).

### Mismo secreto en Vercel (más adelante)

El valor de **`ORDER_SECRET`** tiene que ser **idéntico** a la variable **`BRAVA_ORDER_SECRET`** en Vercel (paso 4 del deploy).

`ADMIN_USER` y `ADMIN_PASSWORD` **solo** viven en Apps Script; no van a Vercel.

### Si no ves “Propiedades del script”

- Asegurate de estar en **Configuración del proyecto** (engranaje), no en “Activadores” ni “Implementaciones”.
- Proyecto guardado al menos una vez (Ctrl+S en el editor).

## 3. Publicar web app

1. **Implementar → Nueva implementación → Aplicación web**
2. Ejecutar como: **Yo**
3. Quién tiene acceso: **Cualquiera**
4. Copiá la URL que termina en `/exec` → es **`BRAVA_GAS_URL`** en Vercel.

## 4. Hoja `pedidos`

Se crea sola al primer pedido. Columnas: ver `sheets/brava-pedidos.csv`.

Contador ORN: propiedad interna `LAST_ORN_DEL` (se incrementa solo).

## 5. Probar

```bash
curl -X POST "TU_URL_EXEC" \
  -H "Content-Type: application/json" \
  -d '{"action":"createOrder","secret":"TU_ORDER_SECRET","order":{"cliente":"Test","telefono":"1112345678","items":[],"subtotal":17000,"envio":800,"total":17800,"pago":"Efectivo"}}'
```

Deberías ver `{ "ok": true, "orn": "ORN-DEL-0001", ... }` y una fila nueva en `pedidos`.

GET a la misma URL (sin POST) debe responder `"version": 2` cuando el código nuevo está publicado.

## 6. Publicar desde Windows (1 clic)

En PowerShell, desde la carpeta del proyecto:

```powershell
.\scripts\publicar-apps-script.ps1
```

Copia `Code.gs` al portapapeles y abre el Sheet. Solo pegás en Apps Script y **nueva versión** de la implementación web.

## 7. Publicar con clasp (opcional, para automatizar)

1. Instalá [Node.js](https://nodejs.org/) y `npm i -g @google/clasp`
2. `clasp login`
3. En Apps Script → ⚙ → **ID del script** → copiá el ID
4. Copiá `apps-script/.clasp.json.example` a `apps-script/.clasp.json` y pegá el ID
5. Desde `apps-script/`: `clasp push` y luego nueva versión web en la consola de Google

Cursor no puede entrar a tu Google sin `clasp login` en tu PC o que pegues el código una vez.
