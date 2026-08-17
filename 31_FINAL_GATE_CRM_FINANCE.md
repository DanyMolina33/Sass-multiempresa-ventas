# 31 — Cierre Final CRM / Comisiones / Liquidaciones / Finanzas

## 1. Estado inicial

Ver `31_CHECKPOINT_PRE_FINAL_GATE.md` — branch `feature/final-gate-audit`, commit `927abd7`, working tree limpio.
YC: 631 Customer / 631 Sale / 0 ReconciliationImport / 1 Settlement (630 detalles, 150 comisiones) /
9 PayrollEntry / 0 CompensationCommissionRule.

## 2. Hallazgos (causa raíz probada con datos, no supuesta)

### Liquidaciones — dos libros paralelos
`Settlement`/`SettlementDetail`/`CommissionEarned` (real, distribuido 2026-07-25) nunca fue leído por
`getLiquidacionesMetrics`/`getFinanceConsolidation`, que solo consultaban `ReconciliationResult` (0 filas para
YC). Probado con datos reales: `SettlementDetail.comisionEsperada` = `SaleEconomicCalculation.expectedCompanyIncome`
exacto en cada fila muestreada (145.00 = 145.0000) — misma magnitud económica, dos nombres distintos.

### CompensationCommissionRule vacía — motor nunca usado, no "perdido"
`CompensationCommissionRule` tiene 0 filas en toda la base de datos, cualquier tenant. Los `PayrollEntry`
históricos de mayo/junio/julio con comisión real (ej. Dani mayo = S/133.37) **no** vienen de ese motor —
coinciden exacto (agregado y por venta individual) con `sum(CommissionEarned.monto)` agrupado por
empleado+período, y a su vez cada `CommissionEarned.monto` individual coincide exacto con
`EconomicRule.promoterCommissionValue% × Sale.saleAmount` usando las mismas 8 reglas que siguen activas hoy.
Conclusión con evidencia: opción **B** (retirar como fuente, `SaleEconomicCalculation` pasa a ser la única
fuente oficial) — nunca fue una configuración perdida, fue un motor paralelo que nunca calculó estos números.

### Supervisor vendedor — PENDING_ASSIGNMENT permanente
Una venta propia de Supervisor con regla que incluye `supervisorCommission` quedaba con status
`PENDING_ASSIGNMENT` para siempre porque `Sale.supervisorId` es `null` por diseño (nadie es su propio
supervisor) — el motor interpretaba "sin asignar" en vez de "no aplica".

### Portal "Mis comisiones" — selector incorrecto, no dato incorrecto
El widget tomaba el único `PayrollEntry` CLOSED/PAID más reciente; si ese período no tenía comisión, mostraba
"Sin datos" aunque un período anterior sí tuviera una comisión real pagada (mayo S/133.37 quedaba invisible en
julio).

## 3. Decisiones adoptadas (aprobadas por el usuario, aplicadas literalmente)

1. `SaleEconomicCalculation` es la fuente económica oficial única; Payroll consolida desde ahí, no recalcula.
2. `Settlement`/`SettlementDetail`/`CommissionEarned` = libro histórico canónico; `ReconciliationImport`/
   `ReconciliationResult` = proceso de importación en vivo. Un mismo `Sale` nunca aporta desde ambas fuentes a la
   vez — el resultado en vivo, si existe y es CONFORME/DIFERENCIA, siempre reemplaza al histórico para esa venta.
3. Venta propia de Supervisor: comisión de vendedor SÍ, comisión de supervisor sobre sí mismo NO — tratada como
   NOT_APPLICABLE, nunca PENDING_ASSIGNMENT por ese motivo.
4. `CompensationCommissionRule` retirada como fuente de cálculo (opción B, con evidencia — sección 2). El
   cierre de un período de nómina se bloquea si una venta aprobada del período no tiene una regla económica
   resuelta (`PENDING_RULE`/`REQUIRES_REVIEW`).
5. Mayo/junio/julio (PAID) no se tocaron — el guard preexistente (`period.status===CLOSED/PAID → 409`) ya lo
   impedía estructuralmente; no fue necesario agregar nada nuevo para cumplir esto.
6. Portal Promotor / Portal Supervisor / vista administrativa / Payroll muestran el mismo importe para el mismo
   empleado + mismo período — verificado con diferencia 0 en la prueba E2E (sección 9).

## 4. Archivos modificados

- `lib/economic-engine.ts` — `calculateSaleEconomics`/`calculateAndSnapshotSale`: NOT_APPLICABLE para supervisor
  sin superior.
- `lib/payroll-engine.ts` — retira `calculateCommission`/`CompensationCommissionRule` como fuente; agrega
  `deriveEconomicCommission`, `getCommissionSummary`, `findUnresolvedEconomicGaps`.
- `lib/business-consolidation.ts` — exporta `APPROVED_SALE_STATUSES` (fuente única, ya no duplicada como
  literal); agrega `getSettlementLedgerContribution` y la fusiona en `getLiquidacionesMetrics`/
  `getFinanceConsolidation` sin duplicar (solo resultados en vivo CONFORME/DIFERENCIA excluyen al histórico).
- `app/api/crm/personnel/periods/[id]/route.ts` — bloquea `close` si hay huecos económicos sin resolver.
- `app/api/crm/promoter-space/route.ts`, `app/api/crm/supervisor-space/route.ts` — usan `getCommissionSummary`.
- `components/promoter-space-workspace.tsx`, `components/supervisor-space-workspace.tsx` — nueva UI de
  "Período actual" vs "Última pagada", sin inventar datos.
- `components/payroll-workspace.tsx` — nota informativa: la sección de comisión del plan ya no afecta el
  cálculo real (evita confundir al Gerente).

## 5. Cambios DB/schema

Ninguno. Todo el cierre fue lógica de lectura/cálculo — cero migraciones, cero cambios de schema, cero tablas
tocadas. `CompensationCommissionRule`/`Tier` siguen existiendo intactas (solo dejaron de leerse para el cálculo).

## 6. Pruebas ejecutadas

Lint: 0 errores. Typecheck: limpio. Build: exitoso. `verify:economic-priority` 19/19. `verify:crm-features`
15/15. `verify:super-admin-crm` 8/8 (incluye SUPERVISOR/AGENT bloqueados de cambiar de tenant).

## 7. Datos de prueba (creados y eliminados en esta sesión, ninguno permanece)

QA GATE / E2E 31D / 31E Idempotency Test — clientes, ventas, período de nómina 2026-08, reconciliaciones.
Todos con IDs registrados en el chat de la sesión, todos limpiados; conteos de YC verificados de vuelta a
631 Customer / 631 Sale / 0 ReconciliationImport tras cada prueba.

## 8. Evidencia E2E (diferencia 0 en cada paso)

Cadena real: Sale `cmsxo7kjy...` (Dani) → EconomicRule `R-INT-6500` → SaleEconomicCalculation
(145.00 / 26.00 / 9.75, CALCULATED) → PayrollPeriod 2026-08 → PayrollEntry Dani (commissionAmount=26.00) →
ReconciliationImport (SEC match, CONFORME) → Dashboard agosto (recognizedIncome=145, coincide con suma manual
en DB). Segunda venta propia de Mario en la misma cadena: CALCULATED (no PENDING_ASSIGNMENT),
supervisorCommission=NULL, PayrollEntry Mario=35.75 (26.00 propio + 9.75 de override sobre la venta de Dani).
Comparación de pantallas: Portal Promotor Dani=26 / Portal Supervisor Mario=35.75 / vista admin=26 y 35.75 /
Payroll=26 y 35.75 — cuatro coincidencias exactas.

## 9. Resultados PASS/FAIL

Ver tabla completa en el informe entregado al usuario. Resumen: **todos PASS**.

## 10. Riesgos restantes

- El drift de `prisma/migrations/` (10 migraciones aplicadas fuera del working tree) sigue sin reconciliar en
  el ledger de Prisma — deliberadamente no se intentó `prisma migrate resolve` (requeriría reconstruir SQL
  histórico sin certeza de que coincida exactamente).
- La UI de administración de `CompensationCommissionRule` (Pago de Personal → Planes) sigue existiendo y
  permite crear/editar reglas que ya no tienen efecto — se agregó una nota visible, no se removió la sección
  (fuera del alcance pedido: "no rediseñar UI").

## 11. Deuda técnica no bloqueante

- `getSettlementLedgerContribution` re-consulta `Settlement`/`SettlementDetail` sin relación Prisma directa
  (dos queries en vez de un `include`) — deliberado, mantiene los modelos de solo lectura sin agregar
  relaciones nuevas al schema en este bloque.
- No se agregó un test runner (Jest/Vitest) — el proyecto no tiene uno; se reutilizó el patrón `scripts/verify-*`
  ya establecido en vez de introducir infraestructura nueva.

## 12. FINAL GATE

**PASS**

## 13. CALL CENTER GATE

**PASS**
