// The Communication Core never imports CRM/vertical-specific code (no Customer, Sale, Lead, "producto", "plato",
// "mesa"...). A vertical plugs in by implementing this contract; the Core only ever calls through it.

export type IncomingMessageContext = {
  tenantId: string;
  connectionId: string;
  whatsappPhoneNumberId: string;
  externalContactPhone: string;
  externalContactName: string | null;
};

// Base contract every vertical adapter implements. Contact Center's implementation lives in
// lib/integrations/whatsapp/contact-center-adapter.ts — the only file allowed to import Customer.
export interface CommunicationAdapter {
  // MUST return null rather than guess when the match isn't unambiguous (section 18) — an unresolved conversation
  // is safe; a wrongly-linked one is not.
  resolveCustomer(context: IncomingMessageContext): Promise<{ id: string } | null>;
  onConversationCreated(conversationId: string, context: IncomingMessageContext): Promise<void>;
  onMessageReceived(conversationId: string, messageId: string, body: string | null): Promise<void>;
}

// Future vertical (block 32, section 23) — contract only, deliberately unimplemented in this codebase. The Core
// must stay ignorant of "plato"/"mesa"/"delivery"; onCreateOrder exists here purely so a future Restaurant SaaS
// package can implement it against the same Core without any change to lib/communication-core itself.
export interface RestaurantCommunicationAdapter extends CommunicationAdapter {
  onCreateOrder(conversationId: string, payload: unknown): Promise<never>;
}
