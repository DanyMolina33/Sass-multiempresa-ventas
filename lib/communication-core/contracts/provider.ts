// Provider-agnostic contract — Meta WhatsApp is the only implementation today
// (lib/communication-core/providers/meta-whatsapp/), but nothing in the Core or in the adapters is allowed to
// assume Meta specifically beyond this shape.

export type SendMessageInput = {
  toPhone: string;
  body?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown;
};

export type SendMessageResult = { externalMessageId: string };

export type TemplateSummary = {
  externalTemplateId: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
};

export interface CommunicationProvider {
  sendMessage(connectionId: string, input: SendMessageInput): Promise<SendMessageResult>;
  listTemplates(connectionId: string): Promise<TemplateSummary[]>;
}
