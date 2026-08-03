# Hoja de cálculo Brava (formato Pedilo)

## Archivo único (recomendado)

**`BRAVA-BURGERS-Pedilo.xlsx`**

Dos pestañas, igual que BR Burgers / Pedilo:

| Pestaña | Contenido |
|---------|-----------|
| **productos** | Catálogo (una fila por variante) |
| **configuracion** | Clave / valor (WhatsApp, colores, zonas, horarios…) |

### Subir a Google Sheets

1. Abrí [tu Sheet de Brava](https://docs.google.com/spreadsheets/d/1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0/edit).
2. **Archivo → Importar → Subir** → elegí `BRAVA-BURGERS-Pedilo.xlsx`.
3. Opción: **Reemplazar hoja de cálculo** o **Insertar hojas nuevas** (si reemplazás, renombrá las pestañas a `productos` y `configuracion` si hace falta).
4. Compartir: **Lector** (público) para que la web lea el CSV.

---

## Archivos CSV (origen de datos)

Si editás los CSV y querés regenerar el Excel:

- `brava-productos.csv`
- `brava-configuracion.csv`

En PowerShell, desde la carpeta `sheets`:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-brava-xlsx-openxml.ps1
```

Se vuelve a crear **`BRAVA-BURGERS-Pedilo.xlsx`**.

(Si tenés Microsoft Excel instalado, podés probar `build-brava-xlsx.ps1`.)

---

## Alternativa: pegar CSV a mano

Ver pasos en la sección anterior del repo; los CSV siguen siendo válidos pestaña por pestaña.
