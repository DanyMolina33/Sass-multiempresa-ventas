# Seguridad — Portal Promotor

## Reglas

- `tenantId` deriva siempre de `requireCrmContext()` (sesión), nunca de un parámetro del cliente.
- Para AGENT, todo `agentId`/`ownerUserId`/`assignedUserId` en escrituras se fuerza a `context.userId`
  en el servidor — el valor que envíe el cliente se ignora.
- El link corto (`/p/[code]`) nunca crea una sesión — solo resuelve tenant+email y redirige a la pantalla
  de login real, que sigue exigiendo contraseña.
- Un usuario `INACTIVE` no puede autenticarse aunque tenga un `accessCode` válido.
- El ranking solo expone nombre, posición y ventas del mismo equipo (`supervisorId` compartido) — nunca
  correo, comisión ni datos de otro equipo.

## Pruebas negativas ejecutadas (2026-08-17, contra el servidor real)

| Prueba | Resultado esperado | Resultado real |
|---|---|---|
| Dani → `GET /api/users` | 403 | 403 (mensaje real, no genérico) |
| Dani → `GET /usuarios` (página) | redirect a `/crm/promoter-space` | confirmado |
| Dani → `POST /api/users` (crear usuario) | 403 | 403 |
| Dani → `GET /api/crm/sales/[id]` de otro promotor | 403 | 403 |
| Dani → `POST /api/crm/customers` con `ownerUserId` de otro usuario | se ignora, usa su propio id | confirmado (`ownerUserId` devuelto = Dani) |
| `/p/[code-inexistente]` | "Enlace no válido", sin redirect | confirmado |
| `/p/[code]` de usuario `INACTIVE` | "Tu acceso se encuentra desactivado", sin redirect | confirmado |
| Regenerar `accessCode` | el código anterior deja de resolver de inmediato | confirmado |
| `POST /api/users` con `supervisorId` de otro tenant o rol no permitido | 400 con mensaje real | confirmado |
| Dani → `PATCH /api/crm/follow-ups/[id]` de otro promotor | 403 | 403 (`"Seguimiento fuera de alcance"`) |
