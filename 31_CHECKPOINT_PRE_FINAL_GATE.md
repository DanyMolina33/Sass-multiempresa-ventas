# 31 — Checkpoint pre Final Gate

Fecha/hora: 2026-08-17 12:40 (hora local del entorno).
Branch: `feature/final-gate-audit`.
Commit actual: `d0df946` ("Final Gate audit: read-only schema drift reconciliation, stale verify-script fix").
`git status --short`: limpio (sin cambios pendientes).

## Estado de DB al inicio del bloque 31

### YC Telecomunicaciones (`cmrs70rk10019g4unlgr14mmj`)
```
customers: 631, sales: 631, econCalc: 633
reconImports: 0, reconResults: 0
settlements: 1, settlementDetails: 630, commissionsEarned: 150
financeEntries: 12, payrollEntries: 9, commissionRules: 0
salesByStatus: REGISTRADA:11, EN_VALIDACION:15, APROBADA:90, ACTIVADA:510, RECHAZADA:5
```

### Clínica Demo (`cmrs40on0000d54un7d1lat4j`) — fuera de alcance operativo, solo referencia de aislamiento
```
customers: 2, sales: 3, econCalc: 0
reconImports: 0, reconResults: 0
settlements: 0, settlementDetails: 0, commissionsEarned: 0
financeEntries: 0, payrollEntries: 0, commissionRules: 0
salesByStatus: REGISTRADA:1, APROBADA:1, ACTIVADA:1
```

## Tests relevantes antes de empezar

- `npx tsc --noEmit`: limpio.
- `npm run lint`: 0 errores, 1 warning preexistente (`<img>` en dashboard-shell.tsx).
- `npm run build`: exitoso.
- `npm run verify:economic-priority`: 19/19.
- `npm run verify:crm-features`: 15/15.
- `env APP_URL=http://localhost:3000 npx tsx scripts/verify-super-admin-crm.ts`: 8/8.

## Hallazgos que este bloque debe cerrar (del Final Gate anterior)

1. `Settlement`/`SettlementDetail`/`CommissionEarned` (liquidación Claro real, 2026-07-25) invisibles para
   Dashboard/Finanzas, que leen `ReconciliationImport`/`ReconciliationResult` (0 filas).
2. `CompensationCommissionRule` vacía (0 filas, toda la BD) — nómina futura calcularía comisión `null` para todos.
3. Venta propia de Supervisor con regla que incluye `supervisorCommission` queda `PENDING_ASSIGNMENT` permanente.
4. Portal "Mis comisiones" toma solo el período CLOSED/PAID más reciente, puede mostrar "Sin datos" habiendo un
   pago real en un período anterior.

Este archivo se conserva sin modificar como evidencia del estado previo — el cierre final se documenta en
`31_FINAL_GATE_CRM_FINANCE.md`.
