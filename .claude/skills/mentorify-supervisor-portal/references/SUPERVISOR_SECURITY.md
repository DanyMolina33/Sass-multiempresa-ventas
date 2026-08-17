# Seguridad — Portal Supervisor

## Reglas

- `tenantId`/`userId` siempre de `requireCrmContext()` (sesión), nunca de parámetro de cliente.
- `users.manage`/`users.read`/`users.credentials.reset` son exclusivos de `COMPANY_ADMIN`, verificado por **código**
  (`isCompanyAdmin()`/`isSuperAdmin()` en `lib/auth.ts`) en `/api/users*`, no solo por `RolePermission` en DB —
  esos datos ya driftaron una vez (ver `CURRENT_STATE.md`).
- "Mi equipo" siempre = `User.supervisorId === session.userId`. Todo endpoint de Supervisor
  (`goals`, `messages`, `action-plans`, `team/[userId]`) valida esto explícitamente antes de leer o escribir.
- `?scope=self` siempre resuelve a `[userId]` exacto; `?scope=team` siempre resuelve a subordinados reales vía
  consulta directa — nunca se deriva de `teamUserIds` cuando es `null` (Modo Tienda), que mezclaría datos de
  tienda con datos de jerarquía.
- Mensajes: `audienceType=SELECTED/INDIVIDUAL` con `recipientIds` fuera del equipo real se descartan
  silenciosamente en el servidor (nunca se confía en la lista del cliente).
- Planes de acción: el Promotor asignado solo puede cambiar `status`; título/problema/acciones quedan bloqueados
  al creador (Supervisor).
- Módulos: `PATCH /api/users/[userId]/modules` rechaza `enabled=true` si el tenant no tiene ese módulo contratado.

## Pruebas negativas ejecutadas (2026-08-17, contra el servidor real)

| Prueba | Resultado esperado | Resultado real |
|---|---|---|
| Mario (SUPERVISOR) → `GET /api/users` | 403 | 403 |
| Mario → `POST /api/users/[dani]/access-code` | 403 | 403 (`"Sin permiso para gestionar accesos"`) |
| Mario → `POST /api/crm/supervisor-space/goals` para un `promoterId` que no es su subordinado (Yaki) | 403 | 403 (`"Promotor fuera de tu equipo"`) |
| Mario → `GET /api/crm/supervisor-space/team/[Yaki]` (no es su subordinada) | 403 | 403 |
| Mario → mensaje `SELECTED` con `recipientIds=[Yaki]` | rechazado | 400 (`"Selecciona al menos un promotor de tu equipo."`) |
| Dani (AGENT) → `GET /api/crm/supervisor-space` | 403 | 403 |
| Dani → `POST /api/crm/supervisor-space/goals` | 403 | 403 |
| Dani → `GET /crm/supervisor-team` (página) | redirect | 307 a `/empresa` |
| Yaki → habilitar módulo no contratado (Guardian) para Mario | 400 | 400 |
| Yaki revoca CRM a Mario → Mario intenta `/api/crm/supervisor-space` | 403 inmediato | 403 confirmado, sin caché |
| Yaki restaura CRM a Mario | acceso recuperado | 200 confirmado |
| Dani con `mustChangePassword=true` → cualquier página protegida | redirect a `/cambiar-password` | 307 confirmado en `/empresa` y `/crm/promoter-space` |
| Cambio de contraseña voluntario sin `currentPassword` | 400 | 400 |
| Cambio de contraseña voluntario con `currentPassword` incorrecta | 401 | 401 |

## Password security

Confirmado explícitamente: no existe ningún campo `plainPassword`/`visiblePassword` en el esquema. Solo
`User.passwordHash` (bcrypt, costo 12). Ni Gerente ni Super Admin pueden recuperar una contraseña existente —
solo restablecerla (lo que genera una temporal nueva y fuerza `mustChangePassword=true`). Verificado que el
reset de Gerente invalida las demás sesiones del usuario (`session.deleteMany` ya existía de bloques previos) y
que el cambio de contraseña (forzado o voluntario) invalida toda sesión salvo la que hizo el cambio.
