# UX — Portal Supervisor

## Sidebar (`SUPERVISOR_NAV` en `components/dashboard-shell.tsx`)

```
Inicio                 → /crm/supervisor-space
Mi equipo               → /crm/supervisor-team
Metas                   → /crm/supervisor-goals
Ranking                 → /crm/supervisor-ranking
Rendimiento              → /crm/supervisor-performance
Ventas del equipo        → /crm/sales?scope=team
Mis ventas               → /crm/sales?scope=self
Clientes del equipo      → /crm/customers?scope=team
Seguimientos             → /crm/supervisor-followups
Mensajes                 → /crm/supervisor-messages
Planes de acción         → /crm/supervisor-action-plans
Agenda                   → /crm/supervisor-agenda
Alertas                  → /crm/supervisor-alerts
Mi perfil                → /crm/supervisor-profile
```

Nunca visible: Usuarios, Crear usuarios, Accesos, Restablecer contraseña ajena, Roles, Configuración global, Pago
de Personal global, Finanzas globales, Liquidaciones globales, Panel Maestro, Configuración tenant.

## Inicio — "Mi gestión"

1. KPIs: Promotores activos · Ventas del equipo (mes) · Cumplimiento de meta (promedio de metas activas del
   equipo) · Alertas pendientes.
2. Franja "Mi producción personal": mi código comercial, mis ventas hoy/mes, botón "+ Nueva venta" (mismo
   `NewSaleModal` del Promotor). Visualmente separada de la sección de supervisión — nunca sumada silenciosamente.
3. Fila de 3 tarjetas: Mi equipo (preview top 5) · Ranking de Supervisores (mi posición) · Alertas (preview).

## Estados vacíos

- Sin promotores asignados: "Aún no tienes promotores asignados."
- Sin metas activas del equipo: KPI "Cumplimiento de meta" muestra "Sin metas activas" (nunca 0% fingido).
- Sin alertas: "Sin alertas activas."
- Sin mensajes enviados: "Aún no has enviado mensajes."
- Sin planes de acción: "Aún no hay planes de acción."

## Ficha del Promotor (drawer, no ruta separada)

Se abre desde "Mi equipo" → tabs Resumen / Ventas / Seguimientos / Metas / Planes de acción. Nunca muestra
contraseña, link de acceso, reset ni módulos — eso es exclusivo del Gerente en Usuarios.

## Responsive

- Reutiliza las mismas clases `.promoter-day-grid` / `.operational-table` / `.reconciliation-shortcuts` ya
  responsive del Portal Promotor y del CRM operativo — colapsan bajo 1050px y 760px respectivamente.
- **No verificado visualmente** en navegador real en este bloque (mismo pendiente que el bloque Promotor).
- No se construyó bottom-navigation móvil dedicado para Supervisor — pendiente si se requiere específicamente.
