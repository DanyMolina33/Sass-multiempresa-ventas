import { getPrisma } from "@/lib/prisma";
import type { CommunicationAdapter, IncomingMessageContext } from "@/lib/communication-core/contracts/adapter";

// The only file in this integration allowed to know about Customer (section 3/22). Resolution is deliberately
// conservative: a phone number match within the tenant is unambiguous enough to link automatically; anything
// less certain leaves the conversation unlinked rather than guessing (section 18).
export const contactCenterAdapter: CommunicationAdapter = {
  async resolveCustomer(context: IncomingMessageContext) {
    const digits = context.externalContactPhone.replace(/\D/g, "");
    if (!digits) return null;
    const matches = await getPrisma().customer.findMany({
      where: { tenantId: context.tenantId, phone: { contains: digits.slice(-9) } },
      select: { id: true },
      take: 2,
    });
    // Exactly one match required — section 18: "Si no [es inequívoco]: dejar conversación sin vínculo."
    return matches.length === 1 ? { id: matches[0].id } : null;
  },

  async onConversationCreated() {
    // No side effect yet by design (section 16/22: no automatic Lead/Sale creation from an inbound message).
  },

  async onMessageReceived() {
    // Intentionally empty — this is the extension point a future automation would hook, not implemented here
    // (section 24: events are defined, nothing subscribes to them yet).
  },
};
