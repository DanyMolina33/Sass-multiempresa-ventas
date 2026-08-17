# MentoriFY Enterprise Business Platform

Plataforma SaaS multiempresa y modular. El Core de empresas, planes, módulos y límites está preparado para persistencia PostgreSQL con Prisma. Guardian V0.1 continúa en modo de observación con datos simulados.

## Ejecutar en Windows

Requisitos: Node.js 22.13 o superior y npm.

```powershell
cd C:\Users\User\contact-center-saas
npm install
npm run dev
```

Abre la URL que imprime la terminal (normalmente `http://localhost:3000`). Sin PostgreSQL la interfaz abre, pero el área Empresas muestra claramente que la persistencia está pendiente.

## PostgreSQL local con Docker

El Panel Maestro permite provisionar una empresa completa desde **Empresas → Nueva empresa**. La operación crea en una transacción el tenant, branding, módulos, límite, plantilla vertical, funciones CRM, roles base y únicamente el COMPANY_ADMIN inicial. El cargo visible del usuario se guarda en `jobTitle` y no altera su rol funcional ni sus permisos.

El entorno local usa PostgreSQL 16 en el servicio `postgres` de Docker Compose, el contenedor `mentorify-postgres` y el volumen persistente `mentorify_postgres_data`. Las credenciales de `.env` son exclusivamente locales y el archivo está ignorado por Git.

Inicia PostgreSQL:

```powershell
docker compose up -d postgres
```

La primera vez, aplica la migración y el seed:

```powershell
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
```

El seed es idempotente: crea o actualiza el plan Business, las definiciones de límites, los seis módulos, **Clínica Demo** y **YC Telecomunicaciones** sin duplicarlos.

Detén PostgreSQL sin perder datos:

```powershell
docker compose stop postgres
```

Para volver a iniciarlo:

```powershell
docker compose start postgres
```

`docker compose down` elimina el contenedor y la red, pero conserva el volumen. No uses `docker compose down -v` salvo que quieras borrar permanentemente la base local.

En un VPS no se usa la credencial local: se proporciona una `DATABASE_URL` de producción mediante las variables seguras del servidor, sin modificar el código.

## Acceso local de demostración

El acceso white-label local de YC Telecomunicaciones está disponible en `http://localhost:3001/t/yc-telecomunicaciones/login`. La ruta resuelve el slug en el servidor, carga `TenantBranding` y limita el login a usuarios de esa empresa. Tras autenticar, el `tenantId` de la sesión continúa siendo la única fuente de verdad.

Inicia sesión en `http://localhost:3001/login`. Estas cuentas se crean mediante el seed y usan exclusivamente la contraseña local definida en `DEMO_PASSWORD`:

| Rol | Correo |
| --- | --- |
| SUPER_ADMIN | `superadmin@mentorify.test` |
| COMPANY_ADMIN | `admin@clinicademo.test` |
| SUPERVISOR | `supervisor@clinicademo.test` |
| AGENT | `agente@clinicademo.test` |

YC Telecomunicaciones usa cuentas independientes del tenant Clínica Demo:

| Rol | Correo |
| --- | --- |
| COMPANY_ADMIN | `admin@yctelecom.test` |
| SUPERVISOR | `supervisor@yctelecom.test` |
| AGENT | `promotor1@yctelecom.test` |
| AGENT | `promotor2@yctelecom.test` |

Contraseña del entorno local incluido: `MentoriFY-Demo-2026!`. Debe reemplazarse fuera del entorno demo y nunca reutilizarse en producción.

Las contraseñas se almacenan como hash bcrypt. Las sesiones utilizan tokens aleatorios; solamente su hash se guarda en PostgreSQL y el navegador recibe una cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción.

## Aislamiento multiempresa

Los endpoints derivan `tenantId` de la sesión autenticada. Un usuario de empresa no puede elegir otro tenant mediante parámetros o URL. `SUPER_ADMIN` es el único rol global. Los roles `COMPANY_ADMIN`, `SUPERVISOR`, `AGENT` y los futuros roles personalizados pertenecen a un tenant.

Para revisar el CRM, `SUPER_ADMIN` selecciona una empresa en el Panel Maestro. El servidor valida el tenant y guarda el contexto en una cookie `HttpOnly` firmada; ese contexto administrativo no se aplica a usuarios normales. Sin empresa seleccionada, `/crm` solicita elegir una antes de consultar datos.

Para subdominios futuros (`empresa.mentorify.com`) o dominios personalizados se resolverá el host a un `tenantId` y se comparará con el tenant de la sesión antes de procesar la solicitud. Esta fase no configura DNS ni dominios.

La resolución futura seguirá una única arquitectura: `host`, `subdomain` o `customDomain` resolverán el mismo tenant y cargarán su branding dentro de esta aplicación compartida. No se crean instalaciones, certificados ni repositorios separados.

El slug `yc-telecomunicaciones` queda preparado como identificador conceptual para un futuro host como `yc-telecomunicaciones.mentorify.com`. Esa arquitectura es solamente documental en esta fase: no se implementan DNS, dominio personalizado ni marca blanca.

## CRM Ventas Telecom

YC Telecomunicaciones utiliza la plantilla vertical reutilizable `CRM_TELECOM`. Sus funciones CRM se almacenan como configuración por tenant: Leads, Clientes, Ventas, Seguimientos, Productos y Planes Comerciales están activas; Comisiones, Conciliación, Finanzas y Dashboard avanzado permanecen inactivas. SUPER_ADMIN puede consultar y cambiar estas funciones desde Empresas → Plantilla y Funciones CRM. Desactivarlas no elimina datos.

El máximo de usuarios activos de YC es 7 mediante `TenantLimitOverride`; no está codificado dentro del CRM y puede editarse desde la misma sección del Panel Maestro.

El CRM utiliza exclusivamente el `tenantId` de la sesión y ofrece estas rutas:

- `/crm/leads`: leads, asignación y pipeline.
- `/crm/customers`: clientes y ficha básica.
- `/crm/sales`: registro, detalle y ciclo de vida de ventas.
- `/crm/follow-ups`: seguimientos programados.
- `/crm/products`: catálogo de productos.
- `/crm/commercial-plans`: planes que vende la empresa; son distintos de los planes SaaS de MentoriFY.

`COMPANY_ADMIN` administra todo el CRM de su tenant. `SUPERVISOR` trabaja con los usuarios cuyo `supervisorId` apunta a su cuenta. `AGENT` solamente consulta registros asignados a su propio usuario. Toda relación a usuarios, productos, leads, clientes o estados comerciales se vuelve a validar en el servidor.

El seed agrega a Clínica Demo el pipeline telecom configurable, dos promotores bajo un supervisor, dos leads, dos clientes, dos productos, dos planes comerciales, dos seguimientos y ventas demo en distintos estados.

YC Telecomunicaciones inicia con ocho productos maestros normalizados (`POSTPAGO`, `PREPAGO`, `RENOVACION`, `INTERNET_FIJO`, `TELEFONIA_FIJA`, `TV`, `INTERNET_INALAMBRICO` y `OTRO`) y sin planes inventados. Su COMPANY_ADMIN puede gestionar productos y planes desde las pestañas del CRM. La preparación de importación centraliza alias, documentos, teléfonos, fechas, SEC, SOT, asesores, estados, productos, planes y tipos de operación; los valores desconocidos se devuelven como `PENDIENTE_DE_MAPEO` sin insertar registros.

Las ventas conservan snapshots del cliente, producto, plan e importes al momento del registro. Cada transición genera `SaleStatusHistory` y, cuando existe un lead relacionado, sincroniza su pipeline dentro de la misma transacción. SEC, SOT y MSISDN tienen índices por tenant para conciliación futura, sin restricciones globales de unicidad.

## Validaciones

```powershell
npm run lint
npm run build
```

## Arquitectura

- `app/`: rutas web y estilos globales.
- `components/`: interfaz reutilizable del Panel Maestro.
- `lib/`: navegación, tipos y datos simulados centralizados.
- `prisma/`: schema, migración PostgreSQL y seed del Core SaaS.
- `app/api/core/`: API interna para empresas, planes y módulos por tenant.
- `public/`: recursos estáticos.

Las entidades persistentes parten de `Tenant` y mantienen `tenantId` como convención. `TenantModule` controla la activación por empresa. `LimitDefinition`, `PlanLimit` y `TenantLimitOverride` permiten ampliar límites sin codificarlos en la aplicación. Los usuarios continúan fuera del alcance de esta fase.

## Alcance y seguridad

Guardian V0.1 presenta exclusivamente telemetría simulada de **ViciBox-LAB** (`192.168.0.8`). No se conecta a ViciBox, Asterisk, VICIdial, Zadarma ni firewalld, y no ejecuta reinicios, instalaciones o acciones de recuperación.
