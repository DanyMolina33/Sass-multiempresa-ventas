# Motor económico — FASE 3C-A

Una venta describe la operación comercial. Una `EconomicRule` describe su lógica económica y un `SaleEconomicCalculation` conserva el resultado como snapshot. Pagos, liquidaciones y conciliación no forman parte de este motor.

## Resolución y prioridad

Solo participan reglas activas del mismo `tenantId`, vigentes en la fecha de venta y cuyas dimensiones configuradas coinciden. La prioridad es:

1. Producto + plan + operación.
2. Producto + plan.
3. Producto + operación.
4. Producto.
5. Plan + operación.
6. Plan.
7. Operación.
8. Regla general.

Cada dimensión suma especificidad (`producto=4`, `plan=2`, `operación=1`). Si dos reglas compatibles empatan en la mayor especificidad, no se elige arbitrariamente: el cálculo queda `REQUIRES_REVIEW`.

## Valores y porcentajes

Cada componente puede quedar sin configurar, ser un monto fijo o un porcentaje. La base explícita de los porcentajes es `Sale.saleAmount`, registrada también en `inputSnapshot`. Si falta la base requerida, el cálculo queda `REQUIRES_REVIEW`; la ausencia nunca se transforma en cero.

El margen preliminar es `ingreso esperado - comisión promotor - comisión supervisor`. No representa utilidad neta.

## Historia

Los cálculos son revisiones append-only. Recalcular crea una revisión nueva y conserva importes, regla e inputs de revisiones anteriores, incluso si estaban confirmadas. La regla usada se copia en `ruleSnapshot`.

Sin regla se crea un snapshot `PENDING_RULE` con importes nulos. Si existe una comisión individual calculada pero no un usuario beneficiario confiable, se conserva el monto y la referencia histórica con estado `PENDING_ASSIGNMENT`; nunca se crea un usuario automáticamente.
