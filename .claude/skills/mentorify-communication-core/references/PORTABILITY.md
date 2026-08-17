# Portabilidad — reutilización futura (Restaurant SaaS)

## Qué es portable tal cual

Todo `lib/communication-core/**`: contratos, cliente de Meta, verificación de webhook, cifrado, resolución de
tenant por `phone_number_id`, tipos de eventos. Ninguno de estos archivos importa `Customer`, `Sale`, `Lead`,
ni ningún concepto de CRM.

## Qué cambia por vertical

Solo el adapter. `lib/integrations/whatsapp/contact-center-adapter.ts` implementa `CommunicationAdapter` para
este SaaS (resuelve `Customer` por teléfono). Un futuro `packages/restaurant/.../restaurant-adapter.ts`
implementaría `RestaurantCommunicationAdapter` (ver `contracts/adapter.ts`) con su propia noción de
cliente/mesa/pedido — sin tocar el Core.

## Por qué NO se convirtió el repo en monorepo/workspace todavía

Se verificó que `package.json` no declara `workspaces` y no existe convención de `packages/` en este repo.
Reestructurar todo el proyecto en un monorepo real es una decisión arquitectónica mayor, fuera del alcance de
este bloque (sección 3: "Si no lo soporta, NO reestructurar todo el proyecto por esta fase"). En su lugar,
`lib/communication-core/` es una carpeta autocontenida que se puede **extraer literal** a un paquete propio el
día que el proyecto sí adopte un monorepo — no requiere reescritura, solo mover el directorio y ajustar imports.

## Contrato Restaurant — solo firma, sin implementación

```ts
export interface RestaurantCommunicationAdapter extends CommunicationAdapter {
  onCreateOrder(conversationId: string, payload: unknown): Promise<never>;
}
```

Deliberadamente sin cuerpo ni caller en este codebase (sección 23) — el Core nunca sabe qué es un "plato" o una
"mesa". `payload: unknown` es intencional: el Core no puede tipar algo que no le compete conocer.
