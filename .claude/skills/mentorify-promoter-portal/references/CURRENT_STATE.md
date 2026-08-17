# Estado actual — Portal Promotor V1

Última actualización: bloque "Promoter Portal V1" (branch `feature/promoter-portal-v1`).

## Hallazgo crítico: drift entre `prisma/schema.prisma` y la base de datos real

Al intentar `prisma migrate dev` para el campo `accessCode`, Prisma detectó que la base de datos de
desarrollo (`mentorify-postgres`, contenedor Docker) tiene **27 migraciones aplicadas**, mientras que
`prisma/migrations/` en este working tree solo tenía **17**. Las 10 faltantes (ya aplicadas en la BD,
ausentes del repo):

```
20260722011245_add_commercial_zone_unit
20260722013533_add_structural_type_and_assignment_history
20260722150809_commercial_goals_bloque1
20260722224500_action_plans_block1
20260723213458_commission_adjustments
20260725000126_settlement_claro_reconciliation
20260725003129_settlement_date_and_notes
20260725004244_settlement_payments
20260725005931_commission_earned
20260725051651_add_commercial_goal_product
```

Estas migraciones crearon tablas reales con datos reales: `CommercialGoal` (15 filas, YC), `ActionPlan`
(0 filas), `CommissionEarned` (150 filas), `Settlement` (1 fila), `CommercialZone`, `CommercialUnit`,
`EmployeeAssignmentHistory`, `PaymentReconciliation`, `SettlementDetail`. Ninguna tiene código de
aplicación (API/UI) en este working tree que las use — son schema+datos "desconectados".

**No se ejecutó `prisma migrate reset`** (habría borrado todos los datos). Para el único campo nuevo que
este bloque necesitaba (`User.accessCode`), se aplicó el `ALTER TABLE`/`CREATE UNIQUE INDEX` directamente
vía `psql` (ver `prisma/migrations/20260817000000_user_access_code/migration.sql`), y se corrió
`prisma generate` (que no toca la BD) para que Prisma Client lo reconociera. El modelo `CommercialGoal` se
agregó a `schema.prisma` como **modelo parcial de solo lectura** (sin relaciones a `CommercialZone`/
`CommercialUnit`/`Product`/`ActionPlan`, que no están modeladas aquí) — suficiente para leer, nunca para
escribir esas tablas.

**Pendiente real, fuera de este bloque**: reconciliar `prisma/migrations/` con el historial real de la
BD (probablemente con `prisma db pull` + revisión manual) antes de que cualquier futuro `prisma migrate
dev` vuelva a funcionar sin este rodeo. No se intentó porque implica decisiones sobre `ActionPlan`/
`Settlement`/`CommercialZone`/`CommercialUnit` que no eran parte del alcance de este bloque.

## Metas: SÍ existe un motor real

Contradice lo reportado en el bloque anterior ("Bloque Promotor 01"), que asumió — correctamente en ese
momento, dado que solo se había revisado `prisma/schema.prisma` de este working tree — que no había motor
de metas. La tabla real `CommercialGoal` sí existe y tiene datos reales para YC (15 metas, todas
`metric=ACTIVATED_SALES`, `scopeType=EMPLOYEE`, único valor de metric soportado por el enum actual).
Dani Molina (Employee `cmrwu7hvb00083oun46fsr13n`) no tiene ninguna meta asignada hoy — por eso su "Meta
del mes" muestra el estado vacío, que es el comportamiento correcto, no un fallback por falta de motor.

## Reutilizado vs. nuevo

| Pieza | Estado |
|---|---|
| `lib/crm-access.ts`, `lib/business-consolidation.ts` | Reutilizados sin cambios |
| `components/promoter-space-workspace.tsx` → `NewSaleModal` | Reutilizado sin cambios |
| `/api/crm/[resource]` (follow-ups) | Reutilizado sin cambios |
| `/api/crm/sales`, `/api/crm/customers` | Reutilizados sin cambios (ya scoped) |
| `GET /api/crm/promoter-space` | Existía (Mi día básico) — **extendido**: goal, ranking, clientesHoy, seguimientosHoy, ventasRecientes, perfil |
| `GET /api/crm/promoter-space/ranking` | Nuevo — filtro Hoy/Semana/Mes |
| `lib/promoter-ranking.ts` | Nuevo — lógica de "mi equipo" compartida por el agregador y el endpoint de ranking |
| `lib/access-code.ts`, `POST /api/users/[userId]/access-code`, `app/p/[code]/page.tsx` | Nuevos — enlace corto |
| `User.accessCode` | Nueva columna (aditiva, nullable, unique) |
| `CommercialGoal` en `schema.prisma` | Nuevo (modelo parcial de solo lectura sobre tabla ya existente) |
| Páginas `/crm/promoter-followups`, `-ranking`, `-commissions`, `-agenda`, `-goals`, `-profile` | Nuevas |

## Pendientes justificados

- **Portal Supervisor**: explícitamente fuera de alcance de este bloque.
- **PWA / verificación visual en navegador real**: no se usó herramienta de navegador en esta sesión;
  la verificación fue a nivel de código + `curl` contra la API/HTML renderizado, no captura de pantalla.
  Recomendado correr `/run` con Playwright antes de dar el diseño por bueno pixel a pixel.
- **Bottom navigation móvil dedicado** (sección 49 del bloque): no se implementó un componente aparte;
  el sidebar existente colapsa en móvil (`@media max-width:760px` ya en `app/globals.css`) pero no hay
  una barra inferior con accesos rápidos. Pendiente si se requiere específicamente.
- **"Pendiente" en Mis comisiones**: la API de comisiones actual (`PayrollEntry`) solo distingue
  proyectada (período abierto/en revisión) y confirmada (cerrado/pagado); no existe un tercer estado
  "pendiente" separado sin inventar un cálculo. Se muestran solo los dos KPIs reales.
- **Reconciliación de migraciones** (ver arriba) — recomendado como bloque dedicado.
