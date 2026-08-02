# GOOGLE SHEETS TEMPLATE - BRAVA BURGERS

## 📋 ESTRUCTURA DEL GOOGLE SHEET

Crea un nuevo Google Sheet con estos tabs (hojas):

---

## HOJA 1: "productos"

| id | nombre | descripcion | variedad1 | precio1 | variedad2 | precio2 | categoria | subcategoria | ocultar |
|----|--------|-------------|----------|---------|----------|---------|-----------|--------------|---------|
| 1 | Cheeseburger Simple | Medallon 120gr, cheddar, salsa mil islas, cebolla picada | Sin Extra | 17000 | Extra Bacon | 18500 | Hamburguesas | Simples | |
| 2 | Cheeseburger Simple | Medallon 120gr, cheddar, salsa mil islas, cebolla picada | Extra Cheddar | 18000 | Extra Cheddar x2 | 18500 | Hamburguesas | Simples | |
| 3 | Cheeseburger Doble | Doble medallon 120gr, cheddar, salsa mil islas, cebolla picada | Sin Extra | 22000 | Extra Bacon | 24000 | Hamburguesas | Dobles | |
| 4 | Cheeseburger Doble | Doble medallon 120gr, cheddar, salsa mil islas, cebolla picada | Extra Cheddar | 23000 | Extra Cheddar x2 | 24000 | Hamburguesas | Dobles | |

---

## HOJA 2: "configuracion"

| llave | valor |
|-------|-------|
| titulo | BRAVA BURGERS |
| whatsapp | 5491173721945 |
| instagram | @bravaburgers.ok |
| horarios | Sábados 20:00 a 23:00 |
| zona1_nombre | Olivos |
| zona1_costo | 500 |
| zona2_nombre | Martinez |
| zona2_costo | 800 |
| zona3_nombre | Villa Adelina |
| zona3_costo | 1000 |
| zona4_nombre | Carapachay |
| zona4_costo | 1000 |

---

## CÓMO CREAR EL GOOGLE SHEET

### Paso 1: Crear el Sheet
1. Abre Google Sheets: https://sheets.google.com
2. Click en "+ Nuevo"
3. Dale nombre: "Brava Burgers"

### Paso 2: Primera Hoja - PRODUCTOS
1. Renombra "Hoja1" a "productos" (botón derecho)
2. Agrega los encabezados de la tabla arriba
3. Copia y pega tus productos

### Paso 3: Segunda Hoja - CONFIGURACION
1. Haz click en "+" para agregar nueva hoja
2. Renómbrala "configuracion"
3. Agrega key:value

### Paso 4: Compartir (IMPORTANTE)
1. Click en "Compartir" (arriba a la derecha)
2. Cambiar a "Cualquier persona con el enlace"
3. Permiso: "Visor"
4. Copiar el ID de la URL

**La URL se ve así:**
```
https://docs.google.com/spreadsheets/d/ESTE_ES_TU_ID/edit
```

Copia: `ESTE_ES_TU_ID`

---

## CÓMO CONECTAR AL HTML

Una vez que tengas el Google Sheet ID, edita el HTML y busca:

```javascript
// Línea ~48
var SHEET_ID = 'TU_ID_AQUI';  ← Pega tu ID aquí
```

---

## VENTAJAS DE USAR GOOGLE SHEETS

✅ Editar desde cualquier lugar (web)
✅ Múltiples usuarios pueden editar
✅ Historial de cambios
✅ Sincronización automática
✅ No necesitas programación

---

## EJEMPLO COMPLETO

### Google Sheet ID: 
```
1jE3JIsjs1ivx-Co1o9UnI4dhz8vrnI5sWyAvELwFwXg
```

### En el HTML pegarías:
```javascript
var SHEET_ID = '1jE3JIsjs1ivx-Co1o9UnI4dhz8vrnI5sWyAvELwFwXg';
```

---

## TIPS

💡 **Si quieres cambiar un producto:** Ve al Sheet → Edita → Guarda → La web se actualiza automáticamente

💡 **Si quieres agregar una categoría:** Agrega una fila con nueva "categoria" en el Sheet

💡 **Si quieres ocultar un producto:** Pon "SI" en la columna "ocultar"

💡 **Haz backups:** El Sheet guarda historial (Ver > Historial de versiones)

---

## ALTERNATIVA: SIN GOOGLE SHEETS

Si no quieres usar Google Sheets, simplemente:
1. Edita directamente el array `g_productos` en el HTML
2. Recarga la página
3. ¡Listo!

Es más simple pero necesitas acceso al código cada vez que cambies algo.
