# UX — Portal Promotor

## Sidebar (rol AGENT, `AGENT_NAV` en `components/dashboard-shell.tsx`)

```
Mi día              → /crm/promoter-space
Mis clientes        → /crm/customers        (vista reutilizada, ya scoped)
Mis ventas          → /crm/sales            (vista reutilizada, ya scoped)
Seguimientos        → /crm/promoter-followups
Mis metas           → /crm/promoter-goals
Mi ranking          → /crm/promoter-ranking
Mis comisiones      → /crm/promoter-commissions
Agenda              → /crm/promoter-agenda
Mi perfil           → /crm/promoter-profile
Cerrar sesión       → botón en el footer del sidebar (existente, sin cambios)
```

Nunca visible para AGENT: Usuarios, Configuración, Liquidaciones, Finanzas, Pago de Personal, Gestión
Comercial, Reportes globales, Call Center/SMS/WhatsApp administrativo, Guardian.

## Mi día — estructura (inspirada en la referencia adjunta)

1. Encabezado: "Hola, {nombre}" + "Hoy tienes N clientes por atender y estás #N en tu equipo." + botón
   "Registrar venta".
2. Fila de 4 KPI: Ventas hoy · Ventas del mes (con objetivo si hay meta) · Cumplimiento · Mi ranking.
3. Fila de 3 tarjetas: Meta del mes (barra de progreso o vacío) · Mi ranking (top 5, resalta al usuario) ·
   Mis comisiones (proyectada/confirmada, o vacío si no hay plan).
4. Fila de 3 tarjetas: Clientes para hoy · Seguimientos de hoy · Mis ventas recientes — cada una con
   "Ver todos/completo/mis ventas →".

Todas las tarjetas están vacías con un mensaje humano (nunca `S/ 0.00` ni `0%` fingidos) cuando no hay
datos — ver la lista de estados vacíos en `SKILL.md`.

## Estados vacíos exactos usados

- Sin meta: "Aún no tienes una meta asignada."
- Sin plan de compensación: "Sin plan de compensación asignado."
- Sin ventas del mes: "Aún no tienes ventas registradas este mes."
- Sin clientes hoy: "No tienes clientes pendientes por atender hoy."
- Sin seguimientos hoy: "No tienes seguimientos pendientes para hoy."
- Sin datos de ranking: "Aún no hay datos de ranking." / "Aún no hay ventas registradas en este período."
- Enlace corto no generado: "Aún no generado" (Editar/Acceso) con botón "Generar enlace".

## Responsive

- Grids de 3 columnas (`promoter-day-grid`) colapsan a 1 columna bajo `max-width:1050px`
  (`app/globals.css`).
- El sidebar ya colapsaba en `max-width:760px` (mecanismo preexistente, sin cambios).
- **No verificado visualmente** en este bloque (sin herramienta de navegador/Playwright disponible en la
  sesión) — solo revisado a nivel de CSS/grid. Ver `CURRENT_STATE.md` → pendientes.
- No se implementó bottom-navigation móvil dedicado (sección 49 del bloque original) — pendiente.
