# CHEAT SHEET - AGREGAR PRODUCTOS RÁPIDO

## 🏃 FORMA MÁS RÁPIDA: EDITA EL HTML

### PASO 1: Abre el archivo con editor de texto
```
Click derecho en index.html → Abrir con → Bloc de notas (o VSCode)
```

### PASO 2: Busca esta sección (línea ~670)
```javascript
var g_productos = [
    {
        "id":"1",
        "nombre":"Cheeseburger Simple",
        ...
    },
    ...
];
```

### PASO 3: Agregar un nuevo producto
Copia este template y reemplaza los valores:

```javascript
{
    "id":"3",
    "nombre":"NOMBRE_DEL_PRODUCTO",
    "descripcion":"DESCRIPCION_CORTA",
    "precio":"PRECIO_EN_PESOS",
    "categoria":"CATEGORIA",
    "subcategoria":"SUBCATEGORIA"
}
```

---

## 📝 EJEMPLOS PRÁCTICOS

### Agregar "Bacon Simple"
```javascript
{
    "id":"3",
    "nombre":"Bacon Simple",
    "descripcion":"Medallon 120gr, bacon, cheddar, manteca y miel, papas",
    "precio":"20000",
    "categoria":"Hamburguesas",
    "subcategoria":"Simples"
}
```

### Agregar "Bacon Doble"
```javascript
{
    "id":"4",
    "nombre":"Bacon Doble",
    "descripcion":"Doble medallon 120gr, bacon, cheddar, manteca y miel, papas",
    "precio":"25000",
    "categoria":"Hamburguesas",
    "subcategoria":"Dobles"
}
```

### Agregar bebida "Coca Cola"
```javascript
{
    "id":"5",
    "nombre":"Coca Cola",
    "descripcion":"Lata 355ml",
    "precio":"5000",
    "categoria":"Bebidas",
    "subcategoria":"Gaseosas"
}
```

### Agregar cerveza "Heineken"
```javascript
{
    "id":"6",
    "nombre":"Heineken",
    "descripcion":"Lata 473ml",
    "precio":"7000",
    "categoria":"Cervezas",
    "subcategoria":"Lager"
}
```

---

## ✅ CHECKLIST DESPUÉS DE AGREGAR

- [ ] El JSON está **correcto** (sin comas faltantes)
- [ ] Cada `"id"` es **único**
- [ ] Los precios están en **números sin símbolos** (17000 ✅ / $17000 ❌)
- [ ] La `"categoria"` existe en el HTML
- [ ] La `"subcategoria"` existe en el HTML
- [ ] **Guardaste el archivo**
- [ ] Recargaste la página (F5)

---

## 🐛 ERRORES COMUNES

### ❌ "No aparece el producto"
**Causa:** Falta coma después de }
**Solución:** Verifica que haya coma entre productos

```javascript
{...},  ← Aquí falta la coma
{...}   ← Error!
```

Debe ser:
```javascript
{...},  ← Bien
{...}   ← Bien (último no lleva coma)
```

### ❌ "Se rompe la página"
**Causa:** Falta comilla en un valor
**Solución:** Todos los valores deben tener comillas

```javascript
"precio":"17000"  ← Bien
"precio":17000    ← Sin comillas! MALO
```

### ❌ "No reconoce la categoría"
**Causa:** La categoría no existe en HTML
**Solución:** Agrégala primero

Si quieres "Promos", añade en HTML:
```html
<div class="col-md-12 categoria" data-categoria="3" id="categoria_3">
    <div class="categoria_titulo" onclick="mostrar_categoria('3');">
        <i class="fas fa-angle-down float-right icono_3 categoria_icono"></i>
        🎉 PROMOS
    </div>
</div>
```

---

## 🎯 ESTRUCTURA DE DATOS COMPLETA

```javascript
{
    "id":"NUMERO_UNICO",                    // 1, 2, 3, 4...
    "nombre":"NOMBRE_VISIBLE",              // Lo que ve el cliente
    "descripcion":"DETALLES_CORTOS",        // Ej: "Medallon 120gr..."
    "precio":"PRECIO_EN_PESOS",             // "17000" (no $)
    "categoria":"GRUPO_PRINCIPAL",          // Hamburguesas, Bebidas, etc
    "subcategoria":"GRUPO_SECUNDARIO"       // Simples, Dobles, Gaseosas, etc
}
```

---

## 🔄 CÓMO AGREGAR MÚLTIPLES PRODUCTOS RÁPIDO

Si tienes muchos, crea primero el array vacío:

```javascript
var g_productos = [
    // Aquí pegas todos los productos
];
```

---

## 💾 GUARDAR CAMBIOS

### Si usas Bloc de Notas:
1. Presiona **Ctrl + S**
2. Asegúrate que guarde como `.html`

### Si usas VSCode:
1. Presiona **Ctrl + S**
2. Automáticamente guarda como HTML

### Luego:
1. Recarga la página del navegador (F5)
2. ¡Los nuevos productos aparecen!

---

## 🆘 VALIDADOR JSON

Si tienes dudas, copia tu array en:
```
https://jsonlint.com/
```
Te dice si hay errores.

---

## 🚀 PRÓXIMO NIVEL: AGREGAR SUBCATEGORÍA

Para agregar "Picantes" junto a "Simples" y "Dobles":

### 1. Agrega HTML:
```html
<div class="col-md-12 subcategoria" data-categoria="1" data-subcategoria="3" style="display:none;">
    <div class="subcategoria_titulo" onclick="mostrar_subcategoria('3');">
        <i class="fas fa-angle-down float-right icono_3 subcategoria_icono"></i>
        PICANTES
    </div>
</div>
```

### 2. Agrega productos con data-subcategoria="3":
```html
<div class="col-md-12 producto" data-categoria="1" data-subcategoria="3" style="display:none;" id="producto_7">
    <!-- Contenido del producto -->
</div>
```

### 3. Y en JavaScript:
```javascript
{
    "id":"7",
    "nombre":"Picante Simple",
    "descripcion":"Medallon 120gr, jalapeños, mayo picante, papas",
    "precio":"19000",
    "categoria":"Hamburguesas",
    "subcategoria":"Picantes"
}
```

---

## 📊 TABLA DE REFERENCIA RÁPIDA

| id | nombre | precio | categoria | subcategoria |
|----|--------|--------|-----------|--------------|
| 1 | Cheeseburger Simple | 17000 | Hamburguesas | Simples |
| 2 | Cheeseburger Doble | 22000 | Hamburguesas | Dobles |
| 3 | Bacon Simple | 20000 | Hamburguesas | Simples |
| 4 | Bacon Doble | 25000 | Hamburguesas | Dobles |
| 5 | Coca Cola | 5000 | Bebidas | Gaseosas |
| 6 | Heineken | 7000 | Cervezas | Lager |

---

¡**Ahora ya sabes cómo agregar productos!** 🎉
