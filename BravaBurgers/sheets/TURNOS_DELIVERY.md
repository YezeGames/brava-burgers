# Turnos delivery — configuración Sheet

Pestaña **`configuracion`** (columnas Nombre / Valor). Independiente de **Control horario** y **Horario abierto SÁBADO**, etc.

## Activar

| Nombre | Valor |
|--------|--------|
| Control turnos delivery | SI |

Con **NO** o sin fila: la tienda sigue como antes (todos los turnos del desplegable Pedilo).

## Horarios y cupos

| Nombre | Ejemplo |
|--------|---------|
| Pedidos web desde | 19:00 |
| Máx pedidos por hora | 4 |
| Turno 1 - Entrega desde | 20:00 |
| Turno 1 - Entrega hasta | 21:00 |
| Turno 1 - Cierre pedidos | 20:30 |
| Turno 2 - Entrega desde | 21:00 |
| Turno 2 - Entrega hasta | 22:00 |
| Turno 2 - Cierre pedidos | 21:30 |
| Turno 3 - Entrega desde | 22:00 |
| Turno 3 - Entrega hasta | 23:00 |
| Turno 3 - Cierre pedidos | 22:40 |

El cliente ve en el checkout: **Turno 1 — 20:00 a 21:00** (generado automáticamente).

Desde **Pedidos web desde** puede elegir turno 1, 2 o 3 si no cerró y hay cupo.

Los cupos se cuentan en **Supabase** (pedidos del día, excl. cancelados/rechazados).

API: `GET /api/turno-cupos` · validación al crear pedido en `/api/pedido`.
