# 🔥 BRAVA BURGERS - INSTRUCCIONES DE IMPLEMENTACIÓN

## ✅ PASO 1: Descargar/Abrir el archivo HTML

1. El archivo `index.html` está listo en tu carpeta
2. Puedes abrirlo **directamente en el navegador**
3. ¡Ya funciona! 🎉

---

## 📤 PASO 2: Subir a un servidor (GRATIS)

### Opción A: NETLIFY (Más fácil) ⭐

1. Ve a https://netlify.com
2. Haz login/registrate
3. Arrastra y suelta la carpeta `BRAVA BURGERS` 
4. ¡Listo! Te da una URL pública

### Opción B: VERCEL

1. Ve a https://vercel.com
2. Conecta tu GitHub o sube el proyecto
3. Deploy automático

### Opción C: GitHub Pages (GRATIS + Personalizado)

1. Sube el archivo a GitHub
2. Enable GitHub Pages en Settings
3. Accesible desde: `tu-usuario.github.io/brava-burgers`

---

## 🎨 PASO 3: PERSONALIZAR EL SISTEMA

### A. Cambiar datos básicos (dentro del HTML)

Busca estas líneas y cambia los valores:

```javascript
// Línea ~48
var g_telefono = '5491173721945';  ← Tu WhatsApp
```

### B. Agregar más productos

En la sección `var g_productos`:

```javascript
var g_productos = [
    {
        "id":"1",
        "nombre":"Cheeseburger Simple",
        "descripcion":"Medallon de 120gr...",
        "precio":"17000",
        "categoria":"Hamburguesas",
        "subcategoria":"Simples"
    },
    // Agrega más aquí
];
```

**Ejemplo - Agregar "Bacon Simple":**

```javascript
{
    "id":"3",
    "nombre":"Bacon Simple",
    "descripcion":"Medallon 120gr, bacon, cheddar, papas",
    "precio":"20000",
    "categoria":"Hamburguesas",
    "subcategoria":"Simples"
}
```

### C. Agregar nueva categoría

1. Copia este bloque HTML y pégalo en la sección de productos:

```html
<div class="col-md-12 categoria" data-categoria="2" id="categoria_2">
    <div class="categoria_titulo" onclick="mostrar_categoria('2');">
        <i class="fas fa-angle-down float-right icono_2 categoria_icono" style="margin-top: 4px;"></i>
        🥤 BEBIDAS
    </div>
</div>
```

2. Luego agrega los productos con `data-categoria="2"`

---

## 📊 OPCIÓN: SINCRONIZAR CON GOOGLE SHEETS

Si quieres **editar productos desde Google Sheets** (como BR Burgers):

### Crear el Google Sheet:

1. Ve a https://sheets.google.com
2. Crea nuevo spreadsheet: "Brava Burgers"
3. Crea una hoja llamada "productos" con columnas:

| id | nombre | descripcion | precio | categoria | subcategoria |
|----|--------|-------------|--------|-----------|--------------|
| 1 | Cheeseburger Simple | Medallon... | 17000 | Hamburguesas | Simples |
| 2 | Cheeseburger Doble | Doble medallon... | 22000 | Hamburguesas | Dobles |

4. **Compartir con "Viewer"** (público)
5. Copiar ID del sheet (está en la URL)

### Conectar al HTML:

Agrega este script en el HTML (antes de `</body>`):

```javascript
<script>
// IMPORTANTE: Reemplaza SHEET_ID con tu ID de Google Sheets
var SHEET_ID = 'TU_ID_AQUI';
var SHEET_NAME = 'productos';

// Cargar datos de Google Sheets
function cargar_desde_google_sheets() {
    var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/query?key=AIzaSyDaRmwq8D3nHghOnwIodoQW045-_9wqeQw&tq=SELECT%20*%20FROM%20%27' + SHEET_NAME + '%27';
    
    var query = new google.visualization.Query(url);
    query.send(function(response) {
        if (response.isError()) {
            console.log('Error: ' + response.getMessage());
            return;
        }
        
        var data = response.getDataTable();
        g_productos = [];
        
        for (var i = 0; i < data.getNumberOfRows(); i++) {
            g_productos.push({
                id: data.getValue(i, 0),
                nombre: data.getValue(i, 1),
                descripcion: data.getValue(i, 2),
                precio: data.getValue(i, 3),
                categoria: data.getValue(i, 4),
                subcategoria: data.getValue(i, 5)
            });
        }
        
        calcular_total();
    });
}

// Cargar al abrir la página
google.setOnLoadCallback(cargar_desde_google_sheets);
</script>
```

---

## 🎯 FUNCIONALIDADES ACTUALES

✅ Agregar productos al carrito
✅ Modificar cantidades
✅ Quitar productos
✅ Ver resumen del pedido
✅ Enviar por WhatsApp
✅ Guardar carrito en `localStorage` (lo recuerda)
✅ Diseño responsive (funciona en móvil)
✅ Tema oscuro + colores Brava Burgers

---

## 🚀 PRÓXIMAS MEJORAS (cuando hayas agregado más productos)

- [ ] Agregar horarios automáticos
- [ ] Agregar zonas de envío con costos
- [ ] Preguntas antes del pedido (nombre, dirección)
- [ ] Descuentos/Promos
- [ ] Mercado Pago integrado
- [ ] Búsqueda de productos
- [ ] Historial de pedidos

---

## ⚠️ CONSIDERACIONES IMPORTANTES

1. **El HTML está optimizado** para funcionar offline
2. **Necesitas conexión a internet** para:
   - Enviar por WhatsApp
   - Cargar desde Google Sheets (si lo implementas)
3. **Los datos se guardan en el navegador** (localStorage)
4. **Compatible con móvil**, tablet y desktop

---

## 📞 SOPORTE RÁPIDO

### El carrito no funciona
→ Verifica que el JavaScript esté habilitado

### No se envía por WhatsApp
→ Revisa que el número de teléfono sea correcto

### Quiero agregar horarios
→ Necesitas agregar código JavaScript (pido si lo necesitas)

---

¡**¡ LISTO PARA USAR!** 🔥
