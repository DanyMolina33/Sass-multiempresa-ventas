// Meta Graph API / WhatsApp Cloud API payload shapes actually used by this integration. Intentionally partial —
// only the fields this codebase reads or sends, not a full SDK surface.

export type MetaTokenExchangeResponse = { access_token: string; token_type?: string; expires_in?: number };

export type MetaWabaInfo = { id: string; name?: string; message_template_namespace?: string };

export type MetaPhoneNumberInfo = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
};

export type MetaSendMessageResponse = { messages?: Array<{ id: string }> };

export type MetaTemplateListResponse = {
  data: Array<{ id: string; name: string; language: string; category?: string; status: string }>;
};

// Webhook payload (messages/statuses) — see Meta's "WhatsApp Business Account webhook payload" reference.
export type MetaWebhookEntry = {
  id: string; // WABA id
  changes: Array<{
    field: string;
    value: {
      metadata?: { display_phone_number?: string; phone_number_id?: string };
      contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
      messages?: Array<{ id: string; from: string; timestamp: string; type: string; text?: { body?: string } }>;
      statuses?: Array<{ id: string; status: string; timestamp: string; recipient_id: string }>;
    };
  }>;
};

export type MetaWebhookPayload = { object: string; entry: MetaWebhookEntry[] };
