# QA — Portal Supervisor V1

Usuarios QA reales de `yc-telecomunicaciones` (no hardcodeados en código): Yaki Chávez (COMPANY_ADMIN), Mario
Vivanco (SUPERVISOR, supervisa a Dani), Dani Molina (AGENT, supervisorId=Mario).

No se creó un segundo Supervisor QA (sección 87) — el aislamiento entre equipos se validó por construcción
(`getSubordinates` siempre filtra por `supervisorId === session.userId`) más una prueba negativa directa: Mario
pidiendo la ficha o enviando un mensaje a Yaki (que no es su subordinada) fue rechazado en ambos casos.

## QA Gerente (Yaki) — ejecutado

- [x] `GET /api/users` sigue funcionando sin cambios.
- [x] `PATCH /api/users/[mario]/modules` → revocar/restaurar el grant de CRM, con efecto inmediato confirmado.
- [x] Intento de habilitar un módulo no contratado (Guardian) para Mario → 400.
- [x] `PATCH /api/users/[dani]` con `password` → confirmado `mustChangePassword: true` en la respuesta.

## QA Supervisor (Mario) — ejecutado

- [x] Login real, `/crm/supervisor-space` y las 10 sub-vistas devuelven 200.
- [x] Ve a Dani en "Mi equipo" (`GET /api/crm/supervisor-space` → `team: [Dani]`).
- [x] Registra una venta propia (`POST /api/crm/sales` sin `agentId`) → `agentId=Mario`, `supervisorId=null`,
      tienda derivada de su propio Employee. Aparece en `?scope=self`, no en `?scope=team`.
- [x] Asigna una meta a Dani → visible de inmediato en el Mi día de Dani.
- [x] Envía un mensaje a "Todo mi equipo" → visible de inmediato en el Mi día de Dani, marcado leído, contado
      en el historial de Mario ("1 de 1 leyeron").
- [x] `GET /api/crm/supervisor-space/team/[id-fuera-de-equipo]` → 403.
- [x] Mensaje a un `userId` fuera de su equipo → rechazado.
- [x] `GET /api/users`, `POST /api/users/[id]/access-code` → 403 ambos (ver `SUPERVISOR_SECURITY.md`).
- [x] Enlace corto (`/p/[code]`) generado y regenerado igual que para un Promotor — mismo resolver, sin ruta
      nueva.

## QA Promotor (Dani) — ejecutado

- [x] Ve la meta asignada por Mario y el mensaje destacado en Mi día, sin duplicación.
- [x] `GET /crm/supervisor-team` (página) → redirect, no contenido.
- [x] `GET /api/crm/supervisor-space` → 403.
- [x] Password reset por Yaki → login con la temporal → `mustChangePassword=true` → cualquier página protegida
      redirige a `/cambiar-password` → cambio sin pedir la temporal de nuevo → acceso normal restaurado.
- [x] Cambio de contraseña voluntario posterior (desde estado ya activo): exige contraseña actual, rechaza una
      incorrecta, acepta la correcta.

## Hallazgos corregidos durante QA (no quedaron como bugs latentes)

1. `?scope=self`/`?scope=team` devolvían el mismo resultado sin filtrar para un Supervisor en "Modo Tienda"
   (Mario tiene `storeId` asignado) — la función de scope hacía el chequeo de `teamUserIds` antes que el de
   `scope`. Corregido: `lib/crm-access.ts#resolveScopedTeamUserIds` ahora resuelve `self`/`team` siempre primero,
   con `team` yendo a una consulta directa por `supervisorId` en vez de depender de `teamUserIds`.
2. La venta propia de un Supervisor no heredaba su tienda (solo AGENT lo hacía), dejándola fuera de cualquier
   vista con scope de tienda. Corregido en `app/api/crm/sales/route.ts`.
3. `CommercialGoal` como modelo Prisma le faltaban columnas reales NOT NULL (`createdByUserId`) — nunca había
   fallado porque el bloque anterior solo leía la tabla. Corregido agregando las columnas reales al modelo.
4. El primer backfill de `UserModuleGrant` no filtró por tenant y creó 9 filas en Clínica Demo por error —
   detectado y revertido en la misma sesión antes de continuar. Ver `CURRENT_STATE.md`.

## No ejecutado en este bloque

- Verificación visual en navegador real (Playwright) de las 14 páginas nuevas contra la imagen de referencia.
- Breakpoints 1920/1366/1024/768/430/390/360 en un viewport real.
- Bottom-navigation móvil dedicado para Supervisor.
- Composición de campañas (`kind=CAMPAIGN`) desde la UI — el modelo lo soporta, el formulario actual no lo expone.
