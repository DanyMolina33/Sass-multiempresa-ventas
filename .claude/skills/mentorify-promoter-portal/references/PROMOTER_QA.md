# QA — Portal Promotor V1

Usuarios QA del tenant `yc-telecomunicaciones` (no hardcodeados en código, solo usados para probar):

- **Yaki Chávez** (`yaki.chavez@yc-telecomunicaciones.crm`) — `COMPANY_ADMIN` / Gerente.
- **Mario Vivanco** (`mario.vivanco@yc-telecomunicaciones.crm`) — `SUPERVISOR`, supervisa a Dani.
- **Dani Molina** (`dani.molina@yc-telecomunicaciones.crm`) — `AGENT` / Promotor, `supervisorId` = Mario.

## QA Gerente (Yaki) — ejecutado

- [x] `GET /api/users` con sesión de Yaki → 200, lista completa.
- [x] `POST /api/users` (crear Promotor con `supervisorId`) → 201, `accessCode` generado automáticamente.
- [x] `PATCH /api/users/[id]` (editar nombre + resetear contraseña) → 200; login con la nueva contraseña
      confirmado.
- [x] `POST /api/users/[id]/access-code` (generar / regenerar enlace) → confirmado, código anterior
      queda inválido de inmediato.
- Pendiente de prueba manual en navegador: clic real en "Copiar enlace"/"Abrir portal" en la UI (la
  lógica de portapapeles/apertura se revisó en código, no se accionó desde un navegador real).

## QA Promotor (Dani) — ejecutado

- [x] Login vía `/t/yc-telecomunicaciones/login` con `tenantSlug` → sesión `AGENT`.
- [x] Login vía enlace corto `/p/[code]` → resuelve a `/t/.../login?email=...` con correo precargado
      (confirmado por HTML: `value="dani.molina@yc-telecomunicaciones.crm"`).
- [x] Redirección automática a `/crm/promoter-space` (tanto desde login como desde `/empresa` y
      `/t/.../login` ya autenticada).
- [x] `GET /usuarios` → redirect a `/crm/promoter-space`; `GET /api/users` → 403.
- [x] Las 9 rutas del sidebar responden 200: promoter-space, customers, sales, promoter-followups,
      promoter-goals, promoter-ranking, promoter-commissions, promoter-agenda, promoter-profile.
- [x] Registrar venta end-to-end (ver `PROMOTER_DATA_FLOW.md`) — Sale real, visible en Mis ventas,
      Mi día y el Dashboard Ejecutivo del Gerente.
- [x] Intento directo a `/usuarios`, a una venta/cliente/seguimiento de otro promotor, y a crear un
      usuario → todos rechazados (ver `PROMOTER_SECURITY.md`).

## No ejecutado en este bloque

- Verificación visual en navegador real (Playwright/`/run`) de las 6 páginas nuevas y de "Mi día" contra
  la imagen de referencia — la construcción se hizo por código + curl, no hay captura de pantalla que
  confirme fidelidad pixel a pixel.
- Prueba de los breakpoints 1920/1366/1024/768/430/390/360 en un viewport real.
- PWA (instalación, funcionamiento offline) — no se tocó infraestructura PWA existente, tampoco se
  verificó que el portal sea compatible con ella si ya existía.
