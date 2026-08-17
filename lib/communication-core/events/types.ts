// Internal event shapes (block 32, section 24) — extension points only. Nothing in this codebase subscribes to
// these yet; no n8n, no rules engine, no AI. A future automation layer plugs in by listening to these types
// without the Core needing to change.

export type MessageReceivedEvent = { type: "message.received"; tenantId: string; conversationId: string; messageId: string; occurredAt: string };
export type MessageSentEvent = { type: "message.sent"; tenantId: string; conversationId: string; messageId: string; occurredAt: string };
export type ConversationCreatedEvent = { type: "conversation.created"; tenantId: string; conversationId: string; occurredAt: string };
export type ConversationAssignedEvent = { type: "conversation.assigned"; tenantId: string; conversationId: string; assignedToUserId: string; occurredAt: string };

export type CommunicationEvent = MessageReceivedEvent | MessageSentEvent | ConversationCreatedEvent | ConversationAssignedEvent;
