# WhatsApp — operación, panel admin y coexistencia

Documentación para Brava Burgers (Cloud API + inbox en `/admin/`). Última actualización: sep 2026 — v1 en producción; descartadas plantillas Meta y purge 24 h.

---

## Estado actual (producción)

| Pieza | Estado |
|-------|--------|
| Envío / recepción texto vía Cloud API | ✅ |
| Webhook Vercel `/api/whatsapp-webhook` | ✅ |
| Inbox Supabase `wa_messages` | ✅ |
| Panel lateral: lista, hilo, snippets | ✅ |
| Pestañas **Pedidos activos** / **Consultas** | ✅ |
| Badges de no leídos por pestaña | ✅ |
| Imágenes entrantes / salientes | ✅ |
| Bienvenida automática (1× por teléfono) | ✅ |
| Limpieza chats de pedido al **cerrar turno** | ✅ |
| Borrador auto al aceptar / en camino (envío manual) | ✅ |
| Fallback `wa.me` si falla API | ✅ |
| Realtime inbox (entrantes ~instantáneos) | ✅ |
| Dedup mensajes al enviar | ✅ |

Variables: ver `WHATSAPP_VERCEL_ENV.txt` y `.env.example` (`WHATSAPP_WELCOME_MESSAGE` opcional).

Número producción: **+54 9 11 7372-1945** (Phone ID `1335204069669693`, WABA `1062857739856943`, app **BRAVADELI**).

> **Pendiente planificado:** más adelante se **cambiará el número de WhatsApp** público de Brava. Hoy todo (API, webhook, inbox, tienda) opera con **7372-1945** hasta ese cambio. Ver sección [Cambio de número (pendiente)](#cambio-de-número-pendiente).

---

## Cambio de número (pendiente)

**Decisión acordada:** en algún momento futuro se reemplazará el número actual **+54 9 11 7372-1945** por otro (definitivo de marca, chip prepago de transición, coexistencia con celu, etc.). **No está hecho todavía**; documentado para no olvidarlo al migrar.

### Qué habrá que actualizar cuando cambie

| Dónde | Qué |
|-------|-----|
| **Vercel** | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_ACCESS_TOKEN` (si aplica), redeploy |
| **Meta** | Webhook (misma URL `/api/whatsapp-webhook`), suscripción `messages`, app **BRAVADELI** o la que use el número nuevo |
| **Tienda / Sheet** | Teléfono en `configuracion`, mensajes de checkout, Linktree |
| **Materiales** | Cartelería, QR, redes — cualquier `wa.me/` o número impreso |
| **Admin** | Inbox: el histórico en Supabase (`wa_messages`) queda ligado al tel anterior; definir si se conserva solo lectura o se arranca limpio en el número nuevo |

### Consideraciones operativas

- Los clientes que escribieron al **número viejo** no tendrán ventana de 24 h en el **nuevo** hasta que manden un mensaje al número nuevo (texto libre desde el panel).
- Si el cambio implica **desregistrar** el número actual de la API o pasar a **coexistencia**, seguir la sección [Coexistencia](#coexistencia-celu--api-mismo-número) y el checklist al final de este doc.
- Anotar acá el número destino cuando esté definido: **`_________________`** (completar antes del cambio).

---

## Coexistencia (celu + API, mismo número)

**Coexistencia** = WhatsApp Business en el celu **y** Cloud API en el panel, **mismo número**, chats 1 a 1 sincronizados.

- Mensajes desde el **celu** → $0 de API.
- Mensajes desde el **panel** → gratis dentro de 24 h tras escribir el cliente; plantillas fuera de ventana.
- **Estados, grupos, llamadas, catálogo** → solo en el celu (no en el panel).

### Qué pasó con Brava

En el onboarding se registró el número en modo **API pura** (no flujo “Conectar cuenta existente de WhatsApp Business”). Por eso **hoy el celu no puede usar ese número** en la app hasta desregistrarlo de la API o activar coexistencia.

### ¿Hay que esperar 30 días?

**No es una regla fija de Meta.** Los plazos que se mezclan:

| Plazo | Significado |
|-------|-------------|
| **~7 días** | Uso activo mínimo en WhatsApp Business antes de elegir coexistencia (recomendación Meta/BSPs) |
| **1–2 meses** | “Cooldown” si el número **ya estuvo en API** y querés volver a app + coexistencia |
| **~14 días** | Con coexistencia activa: abrir la app principal o Meta puede cortar el sync |
| **~30 días** | Inactividad de **dispositivo vinculado** (WhatsApp Web / companion), no el celu principal |

### Opciones a futuro

#### Opción A — Segundo chip (prepago) **recomendada en fase pre-apertura**

Barato e inmediato mientras Brava no opera a escala.

1. **Chip prepago** → registrar en Cloud API → probar panel con ese número.
2. **Desregistrar 7372-1945** de WhatsApp Manager → reinstalar **WhatsApp Business** en el celu con el número “de marca”.
3. Cerca del lanzamiento: **coexistencia en 7372-1945** (Embedded Signup “onboarding business app users”) o quedarse API-only en el panel.

Ventaja: no esperás meses; el número público vuelve al celu cuando quieras.

#### Opción B — Coexistencia en el mismo número (sin chip)

1. WhatsApp Manager → **desregistrar** el número de la API.
2. Esperar liberación (minutos a horas).
3. Instalar WhatsApp Business ≥ **2.24.17** en el celu.
4. Usar el número con actividad real (**7+ días**; si estuvo en API, conviene **varias semanas**).
5. Re-onboarding eligiendo **Coexistence** (no “eliminar cuenta / migrar solo API”).
6. Actualizar token / Phone ID en Vercel si cambian.

Riesgo: downtime del panel; plazo de elegibilidad incierto si el número ya usó API.

#### Opción C — Solo API (estado actual)

Panel + webhook; celu con **otro** número o sin WhatsApp Business en 7372-1945.

### Referencias Meta

- [Onboard WhatsApp Business app users (Coexistence)](https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/)
- [Migrate existing number](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/migrate-existing-whatsapp-number-to-a-business-account/)

---

## Decisiones inbox (sep 2026)

| Tema | Decisión |
|------|----------|
| **Sonido al mensaje WA** | **No** — panel visible; zumbido solo para pedidos web nuevos. |
| **Audios entrantes** | **No** por ahora. |
| **Historial de chats** | **Eliminar manual:** 🗑 en chat o **Vaciar** en pestaña Consultas (borra panel + Supabase). Al **cerrar caja** se ocultan chats de pedidos del turno (solo UI). |
| **Purge automático 24 h** | **Descartado** — no implementar. |
| **Plantillas Meta** | **Descartado** — fuera de ventana 24 h: pedir al cliente que escriba al abrir turno o usar wa.me. |

---

## Panel admin — estado

### ✅ Hecho (v1 producción)

- Inbox `wa-panel.js`: pestañas Pedidos activos / Consultas, badges, ORN, imágenes, envío texto.
- Webhook, Supabase `wa_messages`, Realtime, bienvenida 1× por teléfono.
- Limpieza chats de pedido al **cerrar turno** (solo UI).
- **Eliminar chat** (🗑) y **Vaciar consultas** en pestaña Consultas (borra Supabase + panel).
- Borrador auto al aceptar / en camino; fallback wa.me.
- **Pedido manual** desde toolbar admin (no desde chat) — ver [`PEDIDO_MANUAL.md`](PEDIDO_MANUAL.md).

### No vamos a implementar

- Plantillas Meta aprobadas para mensajes fuera de 24 h.
- Purge automático de historial cada 24 h.
- Reproducir audios / notas de voz.

### Mejoras opcionales (baja prioridad)

- Estados de entrega en hilo (✓✓ sent/delivered/read).
- Enviar auto al cambiar estado (hoy borrador + botón).
- Buscar chat por nombre/tel en inbox.
- Cambio de número WA definitivo — ver [Cambio de número (pendiente)](#cambio-de-número-pendiente).
- Coexistencia celu + API — sección coexistencia abajo.

---

## Checklist rápido coexistencia (fin de semana sin ventas)

- [ ] Backup: token, Phone ID, WABA, webhook URL en Vercel.
- [ ] WhatsApp Manager → desregistrar número (si aplica).
- [ ] Celu: WhatsApp Business instalado, chats respaldados si Meta lo pide.
- [ ] Embedded Signup → **Conectar cuenta existente** / Coexistence.
- [ ] Verificar webhook + suscripción `messages`.
- [ ] Probar: mensaje celu → aparece en panel; mensaje panel → aparece en celu.
- [ ] Abrir app Business al menos cada **14 días** con coexistencia activa.

---

## Costos orientativos (Argentina)

- Cloud API respuesta dentro de 24 h: **gratis**.
- Plantilla utilidad fuera de 24 h: ~**USD 0,026**/msg.
- Mensajes desde app Business (coexistencia): **$0**.
- Chip prepago prueba: **pocos miles ARS** (descartable).
