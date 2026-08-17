---
name: mentorify-enterprise
description: Procedimiento de continuación para el proyecto MentoriFY Enterprise Business Platform (SaaS multiempresa). Úsalo al retomar trabajo en este repositorio para no romper el estado existente ni desviarte del objetivo pedido.
---

# Continuación del proyecto MentoriFY Enterprise

Este Skill documenta cómo retomar trabajo en `contact-center-saas` sin perder el trabajo existente ni desviarte del alcance pedido.

## Procedimiento

1. **Lee `CLAUDE.md` completo** en la raíz del repo antes de tocar nada. Contiene arquitectura, stack, comandos reales y reglas de no reimportación.
2. **Revisa el estado actual antes de editar**: `git status`, y lee los archivos concretos que vas a modificar (no asumas su contenido desde memoria de otra sesión). Los conteos de datos (Customer/Sale de YC, etc.) pueden verificarse con una consulta de solo lectura contra Postgres si el contenedor está activo (`docker ps`).
3. **Identifica la fase actual** a partir de lo que pide el usuario en este turno, no desde un plan general asumido. Si no está claro qué fase corresponde, pregunta antes de tocar código.
4. **Trabaja solo sobre el objetivo solicitado.** No amplíes el alcance a módulos vecinos (CRM, Clientes, Ventas, Comisiones, Liquidaciones, autenticación, roles, aislamiento multiempresa) a menos que se pida explícitamente.
5. **No audites todo el proyecto** si la tarea es puntual. Una auditoría general solo cuando se solicite expresamente.
6. **Preserva el aislamiento multi-tenant** en cualquier cambio: los endpoints siempre derivan `tenantId` de la sesión, nunca de un parámetro de cliente; no mezcles datos entre tenants (p. ej. YC Telecomunicaciones y Clínica Demo).
7. **No ejecutes seed ni reimportaciones** (`npm run db:seed`, `npm run import:yc-pilot`, ni scripts equivalentes) salvo instrucción expresa del usuario en ese mismo turno.
8. **Ejecuta las pruebas relevantes** al terminar un cambio. Este proyecto no tiene un test runner unitario separado — `npm run test` equivale a lint + build. Si existe un script `verify:*` relevante a lo que tocaste, ejecútalo también (son de solo lectura o idempotentes).
9. **Ejecuta lint**: `npm run lint`.
10. **Ejecuta build cuando corresponda** (cambios de UI/lógica que compilan): `npm run build`.
11. **Informa al final**: qué archivos modificaste, resultado visual/funcional, resultado de tests/lint/build, y si algún conteo de datos (Customer/Sale de YC u otro tenant) se verificó sin cambios.
12. **No avances automáticamente a otra fase.** Si terminaste el objetivo pedido y ves trabajo pendiente relacionado, menciónalo como sugerencia y espera confirmación — no lo implementes sin que te lo pidan.

## Cuándo NO aplicar este Skill

Si el usuario pide algo completamente ajeno al SaaS (una pregunta general, otro repositorio), este procedimiento no aplica.
