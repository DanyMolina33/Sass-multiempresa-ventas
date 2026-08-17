# MentoriFY Enterprise Business Platform — CLAUDE.md

Reglas permanentes para trabajar en este repositorio. Léelo completo antes de tocar código. Para el procedimiento paso a paso de continuación, usa el Skill `mentorify-enterprise`.

## Qué es esto

SaaS multiempresa (multi-tenant) construido con Codex y continuado con Claude Code. Contiene trabajo avanzado y datos reales importados. **Nunca reinicies, reestructures ni reviertas trabajo existente sin instrucción explícita.**

## Stack

- Next.js 16 (App Router, React 19), TypeScript, Tailwind v4 (`app/globals.css`, una sola hoja compacta por convención — no crear módulos CSS nuevos).
- PostgreSQL 16 vía Docker Compose (contenedor `mentorify-postgres`, volumen `mentorify_postgres_data`).
- Prisma 6 con `@prisma/adapter-pg` (`lib/prisma.ts` expone `getPrisma()`).
- `xlsx` (SheetJS) para lectura de plantillas de importación/liquidaciones.

## Comandos reales (de `package.json`)

```
npm run dev              # next dev
npm run lint             # eslint .
npm run build            # next build
npm run test             # lint + build (no hay test runner unitario separado)
npm run db:validate      # prisma validate
npm run db:generate      # prisma generate
npm run db:migrate       # prisma migrate deploy
npm run db:seed          # prisma db seed (idempotente)
npm run verify:*         # scripts/verify-phase-*.ts — verificaciones de fase, no destructivas
```

No existe un test runner tipo Jest/Vitest; `npm run test` = lint + build. Los scripts `verify:*` y `dry-run:*` son de solo lectura o idempotentes; no ejecutan seed ni importación real.

## Arquitectura multi-tenant

- `Tenant` es la entidad raíz; toda tabla de negocio cuelga de `tenantId`.
- `SUPER_ADMIN` es el único rol global; administra todo desde **Panel Maestro** (`app/[section]/page.tsx` → `DashboardShell`, sección `empresas`).
- `COMPANY_ADMIN`, `SUPERVISOR`, `AGENT` pertenecen a un tenant y nunca ven datos de otro. Los endpoints derivan `tenantId` de la sesión — nunca de un parámetro de cliente.
- Cada tenant tiene: `TenantBranding` (única fuente de verdad de apariencia), `TenantModule` (módulos activables), `TenantVerticalTemplate` + `TenantCrmFeature` (funciones CRM activables independientemente), `TenantLimitOverride` (límite de usuarios).
- Desactivar una función CRM solo la oculta y bloquea acceso directo; nunca borra datos. El CRM debe resolver dinámicamente la primera función activa — no asumir que "Leads" siempre lo está.

## Branding (`TenantBranding`)

Fuente de verdad única — no crear un segundo sistema de branding. Campos: `displayName`, `logoUrl`, `logoDarkUrl`, `faviconUrl`, `primaryColor`, `secondaryColor`, `loginTitle`, `loginSubtitle`, `loginBackgroundUrl`, `subdomain`, `customDomain`. Editor en `BrandingEditor` dentro de `components/dashboard-shell.tsx`; persistencia vía `PATCH /api/core/tenants/[tenantId]/branding`.

## Liquidaciones vs Comisiones

- Nombre visible: **Liquidaciones** (no "Conciliación"). La ruta técnica interna conserva `reconciliation` por compatibilidad — no renombrar rutas/tablas sin instrucción explícita.
- Liquidaciones: proveedores/entidades pagadoras, plantilla descargable, carga y matching, clasifica reconocidas/conformes/diferencias/no liquidadas/pendientes.
- Comisiones: motor de reglas por producto/plan/operación/combinación; la regla más específica prevalece; sin regla aplicable = `PENDING_RULE`. Son motores separados — no fusionarlos.
- Nunca inventar porcentajes o valores económicos.

## Alcance operativo actual — SOLO YC Telecomunicaciones

Desde 2026-07-20, el alcance operativo se restringió explícitamente a un único tenant:

- **YC Telecomunicaciones** (`yc-telecomunicaciones`, plantilla `CRM_TELECOM`) es el único tenant de trabajo. Dataset piloto ya importado e idempotente. Conteos de referencia confirmados el 2026-07-19: **Customer = 731, Sale = 767**. Estos números no deben cambiar salvo una importación explícitamente solicitada; si un cambio los toca sin pedirlo, es una señal de bug, no de progreso.
- **Clínica Demo** sigue existiendo técnicamente en PostgreSQL pero queda **fuera del alcance operativo**: no trabajar sobre ella, no modificarla, no crear datos ahí, no usarla para QA, no mezclarla en comparaciones o conteos, y no mencionarla en informes finales salvo que el usuario lo pida expresamente.
- Para validar aislamiento multi-tenant, basta con verificar que las consultas/escrituras de reglas, liquidaciones, comisiones y finanzas estén correctamente filtradas por el `tenantId` de YC — no es necesario tocar otro tenant para demostrarlo. En los informes, referirse a esto simplemente como "aislamiento multi-tenant validado".
- Nunca ejecutar `db:seed`, `import:yc-pilot` ni scripts de importación salvo instrucción explícita del usuario en esa sesión.

## Filosofía de cambios

Cambios quirúrgicos, acotados exactamente al objetivo pedido. No refactorizar módulos que ya funcionan, no auditar el proyecto completo sin necesidad, no adelantar trabajo de fases futuras (Dashboard Ejecutivo, Finanzas, Pipeline) sin que se solicite. Preferir editar sobre reescribir.
