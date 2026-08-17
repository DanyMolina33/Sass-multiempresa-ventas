import type { MetaPhoneNumberInfo, MetaSendMessageResponse, MetaTemplateListResponse, MetaTokenExchangeResponse, MetaWabaInfo } from "@/lib/communication-core/providers/meta-whatsapp/types";

// Single centralized place for the Graph API version — never hardcoded elsewhere in this codebase. Override via
// env if Meta deprecates this version before the code is revisited.
export const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no está configurada`);
  return value;
}

async function graphFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Response((body as { error?: { message?: string } })?.error?.message || "Error de Meta Graph API", { status: response.status >= 400 && response.status < 600 ? response.status : 502 });
  return body as T;
}

// Embedded Signup token exchange (section 12) — short-lived code from the frontend -> long-lived-ish access
// token, server-side only. App Secret never leaves this function.
export async function exchangeCodeForToken(code: string): Promise<MetaTokenExchangeResponse> {
  // App ID isn't a secret (Meta requires it in the browser too, to load the SDK) — NEXT_PUBLIC_META_APP_ID is the
  // single source of truth, readable both server- and client-side. App Secret stays server-only, always.
  const appId = requireEnv("NEXT_PUBLIC_META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");
  const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  return graphFetch<MetaTokenExchangeResponse>(`/oauth/access_token?${params}`);
}

export async function getWabaInfo(wabaId: string, accessToken: string): Promise<MetaWabaInfo> {
  return graphFetch<MetaWabaInfo>(`/${wabaId}?fields=id,name,message_template_namespace`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

export async function getPhoneNumberInfo(phoneNumberId: string, accessToken: string): Promise<MetaPhoneNumberInfo> {
  return graphFetch<MetaPhoneNumberInfo>(`/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

export async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, toPhone: string, body: string): Promise<MetaSendMessageResponse> {
  return graphFetch<MetaSendMessageResponse>(`/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body } }),
  });
}

export async function listTemplates(wabaId: string, accessToken: string): Promise<MetaTemplateListResponse> {
  return graphFetch<MetaTemplateListResponse>(`/${wabaId}/message_templates?fields=id,name,language,category,status`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

// Minimal template submission (section 19: "base mínima... sin diseñador avanzado") — a single BODY component,
// no header/footer/buttons/variables editor. Enough to demonstrate the real capability for App Review.
export async function createTemplate(wabaId: string, accessToken: string, input: { name: string; language: string; category: string; bodyText: string }): Promise<{ id: string; status: string }> {
  return graphFetch<{ id: string; status: string }>(`/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, language: input.language, category: input.category, components: [{ type: "BODY", text: input.bodyText }] }),
  });
}
