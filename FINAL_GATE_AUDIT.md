# FINAL GATE — Auditoría CRM/Liquidaciones/Comisiones/Finanzas (2026-08-17)

Auditoría profunda end-to-end antes de iniciar Call Center. Ver el reporte completo entregado en la conversación
para el detalle exhaustivo con IDs; este archivo documenta los hallazgos permanentes para que futuras sesiones no
los redescubran desde cero.

## CALL_CENTER_GATE = FAIL

Dos pilares obligatorios fallan con evidencia real (ver abajo): Comisiones y Liquidaciones. El resto del núcleo
(CRM, motor económico, matching, idempotencia, Dashboard, aislamiento, build) pasó verificación exhaustiva contra
datos reales.

## Hallazgo crítico 1 — Liquidación real invisible para el Dashboard

Existe una liquidación Claro real y completa para YC (`Settlement` id `cmrzrgjwj02g1founfrcdnfr9`,
`status=EARNINGS_DISTRIBUTED`, 630 `SettlementDetail`, 150 `CommissionEarned` PAID/EARNED, fecha 2026-07-25).
**Ningún código de aplicación lee estas tablas** — el Dashboard/Finanzas/Liquidaciones vive lee
`ReconciliationImport`/`ReconciliationResult`, que tenían 0 filas para YC antes de esta auditoría. Son dos
sistemas de liquidación reales y paralelos que nunca se conectaron. Modelado ahora en `schema.prisma` como
solo-lectura (`Settlement`, `SettlementDetail`, `CommissionEarned`, `CommissionAdjustment`) para que sea
consultable — **no se wireó a ningún cálculo de Dashboard/Finanzas**, decidir cómo unificarlos es una regla de
negocio fuera de la autoridad de esta auditoría.

## Hallazgo crítico 2 — Motor de comisiones de nómina sin configuración activa

`CompensationCommissionRule` tiene **0 filas en toda la base de datos** (cualquier tenant). Sin esa fila,
`lib/payroll-engine.ts#calculateCommission` retorna `amount: null` siempre — código correcto, dato ausente. Sin
embargo los `PayrollEntry` reales de mayo/junio/julio 2026 sí tienen `commissionAmount` no nulo (ej. S/ 133.37
para Dani en mayo), calculados el 2026-07-25 — misma fecha que el hallazgo 1. Esto prueba que la regla de
comisión SÍ existió en ese momento y fue eliminada después, dejando el historial intacto pero el motor
inoperante hacia adelante. **Si se corre nómina para un período nuevo hoy, la comisión de todos dará `null`
silenciosamente.** No se recreó la regla — sería inventar un valor económico.

## Hallazgo 3 — Venta propia de Supervisor queda PENDING_ASSIGNMENT

Una venta personal de un SUPERVISOR (Mario) coincide con una `EconomicRule` que incluye `supervisorCommission`,
pero `Sale.supervisorId` es `null` para una venta propia (no reporta a nadie) → el motor no puede asignar esa
comisión y el cálculo completo queda en `PENDING_ASSIGNMENT` en vez de `CALCULATED`, aunque la comisión del
propio promotor (Mario) sí se calculó y asignó correctamente. Demostrado con Sale real, limpiado tras la prueba.

## Hallazgo 4 — "Comisión confirmada" del Portal Promotor/Supervisor puede mostrar null habiendo dinero real pagado

`commissions.confirmed` en `/api/crm/promoter-space` y `/api/crm/supervisor-space` toma el `PayrollEntry` más
reciente con período CLOSED/PAID (no la suma, no el más reciente no-nulo). Dani tiene un `PayrollEntry` de mayo
con `commissionAmount=133.37` (PAID) pero el más reciente (julio) es `null` → el widget muestra "Sin datos"
ocultando el pago real de mayo. Confirmado comparando contra la vista admin de nómina (mismo valor real ahí).

## Verificado PASS (evidencia completa en el reporte de la conversación)

- Motor económico: prioridad determinística, 4 estados exhaustivos, verificado en vivo con regla real.
- Matching de liquidaciones: 6 estrategias en orden documentado, verificado con un archivo xlsx real subido dos
  veces — segunda subida rechazada 409, cero filas duplicadas.
- Dashboard vs cálculo manual: diferencia 0 para un período controlado real.
- Finanzas: sin doble contabilización estructuralmente posible (INGRESO reconciliación vs GASTO nómina,
  particionado por `payrollPeriodId`).
- Aislamiento multi-tenant: 8/8 en `verify:super-admin-crm`, Clínica Demo con conteos sin cambios (2/3) durante
  toda la auditoría.
- Metas/ranking: se actualizan automáticamente al cambiar el estado de una venta, sin copia manual.

## Correcciones aplicadas en este bloque

- `scripts/verify-crm-feature-independence.ts`: dos comparaciones usaban una lista de 8 features hardcodeada en
  vez de `NAVIGABLE_CRM_FEATURES` (12), dando falso negativo desde que se agregó `promoter-space`. Corregido para
  usar la lista real.
- `prisma/schema.prisma`: 7 modelos nuevos de solo lectura (`Settlement`, `SettlementDetail`, `CommissionEarned`,
  `CommissionAdjustment`, `CommercialZone`, `CommercialUnit`, `EmployeeAssignmentHistory`) — completa la
  reconciliación de visibilidad del drift de migraciones sin tocar ninguna tabla ni dato.

## Pendiente (decisión del usuario, no ejecutado)

- Reconciliar `prisma/migrations/` con el ledger real (`prisma migrate resolve --applied <name>` por cada una de
  las 10 migraciones ya aplicadas) — no ejecutado porque requeriría reconstruir el SQL original sin certeza de
  que coincida exactamente con lo que corrió históricamente.
- Decidir si/cómo unificar Settlement/CommissionEarned con ReconciliationResult, o tratarlos como sistemas
  separados intencionalmente.
- Recrear (o confirmar el valor correcto de) `CompensationCommissionRule` antes de correr nómina para agosto 2026.
