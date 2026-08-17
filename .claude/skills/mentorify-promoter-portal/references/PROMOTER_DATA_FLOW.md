# Flujo de datos — Portal Promotor

```
Promotor (AGENT)
  → POST /api/crm/sales            (agentId siempre = context.userId, nunca del cliente)
  → Sale real (Prisma)
  → calculateAndSnapshotSale()     (motor económico existente, sin cambios)
  ↓
GET /api/crm/promoter-space        (Mi día — recentSales, today/period vía getSalesMetrics)
GET /api/crm/sales                 (Mis ventas — mismo teamUserIds scoping)
GET /api/crm/promoter-space/ranking (ranking del equipo — mismo getSalesMetrics)
GET /api/crm/executive-dashboard   (Dashboard Gerente — ya consulta Sale directamente, sin cambios)
```

No hay una tabla ni un caché intermedio: cada vista arriba consulta `Sale`/`Customer` directamente (o vía
`getSalesMetrics`, que a su vez consulta `Sale`). Una venta nueva aparece automáticamente en todas las
vistas de arriba sin ningún paso manual de sincronización.

## Prueba de trazabilidad ejecutada (2026-08-17)

Usuario: Dani Molina (`cmrzvdbul000a44ung05py559`, AGENT).

1. `POST /api/crm/customers` → Customer `cmsxe9zkf0005n8unwcxfrbwa` ("QA DataFlow Test"), `ownerUserId`
   forzado a Dani pese a no enviarse.
2. `POST /api/crm/sales` → Sale `cmsxe9zs30006n8une6t672cu`, `agentId=Dani`, `supervisorId` derivado
   automáticamente a Mario Vivanco (jerarquía `User.supervisorId`), `status=REGISTRADA`.
3. `GET /api/crm/promoter-space` (Dani) → `recentSales` incluye la venta inmediatamente.
4. `GET /api/crm/sales` (Dani) → la venta aparece en "Mis ventas".
5. `GET /api/crm/executive-dashboard` (Yaki, COMPANY_ADMIN) → `ventasHoy: 1`, reflejando la venta sin
   ningún paso adicional.
6. Limpieza: se eliminaron `SaleStatusHistory`, `Sale` y `Customer` de prueba; conteos de YC confirmados
   de vuelta a su valor previo (`Customer=630, Sale=630`).

Conclusión: la cadena Promotor → Sale real → CRM → Dashboard Gerente queda demostrada end-to-end sin
tablas ni cálculos paralelos.
