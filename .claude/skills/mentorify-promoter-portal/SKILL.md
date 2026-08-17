---
name: mentorify-promoter-portal
description: Fuente de verdad de la experiencia PROMOTOR (rol AGENT) de MentoriFY — portal, accesos cortos y flujo de datos. Úsalo antes de tocar cualquier cosa bajo /crm/promoter-*, /p/[code], o el flujo Gerente→Promotor en Usuarios.
---

# Portal Promotor — MentoriFY

Este Skill documenta la experiencia PROMOTOR (rol técnico `AGENT`) construida sobre el CRM real de
MentoriFY. No es específico de YC Telecomunicaciones — aplica a cualquier tenant con la función CRM
`promoter-space` activa.

## Principio absoluto

**El Portal Promotor no es otro CRM ni tiene base de datos paralela.** Es una vista personalizada sobre
`Sale`, `Customer`, `FollowUp`, `CommercialGoal`, `PayrollEntry`, etc. — los mismos modelos que usa el
CRM del Gerente. Antes de agregar cualquier dato al portal, verifica que ya exista un modelo/consulta real
y reutilízalo. No inventar números económicos ni un motor de metas paralelo.

## Antes de tocar código

1. Lee `CLAUDE.md` y `.claude/skills/mentorify-enterprise/SKILL.md`.
2. Lee `references/CURRENT_STATE.md` de este Skill — qué está conectado y qué no.
3. Revisa `git status` y confirma en qué branch estás (`feature/promoter-portal-v1` mientras no se
   fusione a `main`).
4. **Antes de asumir que un modelo "no existe", verifica contra la base de datos real**, no solo contra
   `prisma/schema.prisma` de tu working tree. Este repo tuvo una desincronización real entre el schema
   local y la base de datos (`CommercialGoal`, `ActionPlan`, `Settlement`, `CommissionEarned` existían en
   Postgres sin estar en el schema ni en `prisma/migrations/`) — ver `references/CURRENT_STATE.md`.

## Arquitectura de rutas

- `/crm/promoter-space` → **Mi día**. Agregador principal (una sola llamada a
  `GET /api/crm/promoter-space`), no 6 peticiones sueltas.
- `/crm/promoter-followups`, `/crm/promoter-ranking`, `/crm/promoter-commissions`,
  `/crm/promoter-agenda`, `/crm/promoter-goals`, `/crm/promoter-profile` → sub-páginas del portal.
  Se registran como valores adicionales de `PROMOTER_SUBVIEWS` en `app/crm/[view]/page.tsx`: no son
  funciones CRM independientes en `TenantVerticalTemplate` — heredan la activación de `promoter-space`.
- `/crm/sales` y `/crm/customers` (ya existentes) se **reutilizan tal cual** para "Mis ventas" / "Mis
  clientes" — ya estaban correctamente scoped por `teamUserIds` en `lib/crm-access.ts`.
- `/p/[code]` → enlace corto. Resuelve `User.accessCode` → tenant + email → redirige internamente a
  `/t/[slug]/login?email=...`. **Nunca autentica por sí mismo.**

## Enlace corto (`accessCode`)

- Campo `User.accessCode` (String? @unique) — código Base58 de 9 caracteres, generado en
  `lib/access-code.ts` (`generateUniqueAccessCode`). No contiene email, tenant ni contraseña.
- Se genera automáticamente al crear un usuario (`POST /api/users`) y puede regenerarse desde
  `POST /api/users/[userId]/access-code` (botón "Regenerar enlace" en el modal Editar/Acceso de
  `components/dashboard-shell.tsx`). Regenerar invalida el código anterior de inmediato (se sobreescribe).
- Un usuario `INACTIVE` con enlace corto ve "Tu acceso se encuentra desactivado" — nunca puede loguearse
  aunque el código sea válido.

## Reutilizado (no reconstruir)

- `lib/crm-access.ts` (`requireCrmContext`, `teamUserIds`, `assignedScope`) — el aislamiento AGENT/
  SUPERVISOR/COMPANY_ADMIN ya estaba correctamente implementado antes de este bloque.
- `lib/business-consolidation.ts` (`getSalesMetrics`) — única fuente de verdad para "ventas
  aprobadas/activadas". El ranking y el progreso de metas reutilizan esta misma función, nunca un
  cálculo paralelo.
- `components/promoter-space-workspace.tsx` → `NewSaleModal` (registrar venta) ya existía y persiste en
  `Sale`/`Customer` reales vía `/api/crm/sales` y `/api/crm/customers` — se preservó intacto.
- `/api/crm/[resource]?resource=follow-ups` y `/api/crm/[resource]/[id]` (PATCH) — Seguimientos y Agenda
  reutilizan este endpoint genérico existente, ya scoped, en vez de crear uno nuevo.

## Metas (`CommercialGoal`)

Ver `references/CURRENT_STATE.md` para el detalle completo del hallazgo. En resumen: **sí existe** un
motor de metas real (`CommercialGoal`, único metric soportado hoy: `ACTIVATED_SALES`, scope `EMPLOYEE`),
aplicado directamente contra la base de datos fuera de este working tree. El widget "Meta del mes" lee
`CommercialGoal` real por `employeeId` + período vigente; el avance ("achieved") reutiliza
`getSalesMetrics(...).aprobadas` — nunca un número inventado. Si no hay una meta `ACTIVE` vigente para el
empleado, se muestra el estado vacío "Aún no tienes una meta asignada." — nunca una meta simulada.

## Seguridad (no negociable)

- `tenantId` siempre deriva de la sesión (`requireCrmContext`), nunca de un parámetro de cliente.
- Para AGENT, `context.userId` es la única fuente de "quién soy" en toda escritura (venta, cliente,
  seguimiento) — el backend ignora cualquier `agentId`/`ownerUserId` que el cliente intente enviar.
- El ranking solo expone nombre, posición y ventas del propio equipo (mismo `supervisorId`) — nunca
  correo, comisión ni datos de otro equipo.
- Ver `references/PROMOTER_SECURITY.md` para la matriz de pruebas negativas ejecutadas y su resultado.

## Qué NO se tocó en este bloque

Portal Supervisor, Guardian, Call Center, WhatsApp, SMS, motor financiero nuevo, liquidaciones,
rediseño de la experiencia Gerente. Ver `references/CURRENT_STATE.md` para pendientes justificados.
