"use client";
import { useCallback, useEffect, useState } from "react";

type PhoneNumber = { id: string; phoneNumberId: string; displayPhoneNumber: string | null; verifiedName: string | null; status: string; isDefault: boolean };
type Connection = { status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR"; wabaId: string | null; businessId: string | null; displayName: string | null; connectedAt: string | null; disconnectedAt: string | null; lastErrorMessage: string | null; phoneNumbers: PhoneNumber[] } | null;
type Template = { id: string; name: string; language: string; category: string | null; status: string; bodyText: string | null };

declare global {
  interface Window {
    FB?: { init: (opts: Record<string, unknown>) => void; login: (callback: (response: { authResponse?: { code?: string } }) => void, opts: Record<string, unknown>) => void };
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_SRC = "https://connect.facebook.net/es_LA/sdk.js";
// Meta's own Embedded Signup message-event origins (real WA_EMBEDDED_SIGNUP postMessage source) — never accept
// this payload from any other origin.
const FB_MESSAGE_ORIGINS = ["https://www.facebook.com", "https://web.facebook.com"];

function loadFacebookSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();
    if (!appId) return reject(new Error("NEXT_PUBLIC_META_APP_ID no está configurada"));
    window.fbAsyncInit = () => { window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); resolve(); };
    if (document.getElementById("facebook-jssdk")) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk"; script.src = FB_SDK_SRC; script.async = true; script.defer = true;
    script.onerror = () => reject(new Error("No se pudo cargar el SDK de Meta"));
    document.body.appendChild(script);
  });
}

function statusLabel(status: string | undefined) {
  return { DISCONNECTED: "No conectado", CONNECTING: "Conectando", CONNECTED: "Conectado", ERROR: "Error" }[status ?? "DISCONNECTED"] ?? "No conectado";
}

export function WhatsAppWorkspace({ role }: { role: string }) {
  const isAdmin = role === "COMPANY_ADMIN" || role === "SUPER_ADMIN";
  const [connection, setConnection] = useState<Connection>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/integrations/meta/whatsapp/status");
    const result = await response.json();
    if (response.ok) setConnection(result.connection); else setMessage(result.message);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { if (!isAdmin) setLoading(false); else void load(); }, 0); return () => window.clearTimeout(timer); }, [load, isAdmin]);

  async function handleConnect() {
    setConnecting(true); setMessage("");
    const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
    const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID ?? "";
    if (!appId || !configId) { setMessage("Meta no está configurado todavía (faltan NEXT_PUBLIC_META_APP_ID / NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID)."); setConnecting(false); return; }
    try {
      await loadFacebookSdk(appId);
      const startResponse = await fetch("/api/integrations/meta/whatsapp/connect/start", { method: "POST" });
      const startResult = await startResponse.json();
      if (!startResponse.ok) { setMessage(startResult.message); setConnecting(false); return; }
      const state: string = startResult.state;

      let captured: { wabaId?: string; phoneNumberId?: string } = {};
      function onMessage(event: MessageEvent) {
        if (!FB_MESSAGE_ORIGINS.includes(event.origin)) return;
        try {
          const data = JSON.parse(typeof event.data === "string" ? event.data : "{}");
          if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") captured = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        } catch { /* ignore non-JSON messages from other embeds on the page */ }
      }
      window.addEventListener("message", onMessage);

      window.FB!.login(async (response) => {
        window.removeEventListener("message", onMessage);
        const code = response.authResponse?.code;
        if (!code || !captured.wabaId || !captured.phoneNumberId) { setMessage("No se completó la conexión con Meta."); setConnecting(false); return; }
        const callbackResponse = await fetch("/api/integrations/meta/whatsapp/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, wabaId: captured.wabaId, phoneNumberId: captured.phoneNumberId, state }) });
        const callbackResult = await callbackResponse.json();
        setConnecting(false);
        if (!callbackResponse.ok) return setMessage(callbackResult.message);
        void load();
      }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "whatsapp_business_app_onboarding" } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar la conexión con Meta.");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("¿Desconectar WhatsApp? El historial de conversaciones se conserva.")) return;
    const response = await fetch("/api/integrations/meta/whatsapp/disconnect", { method: "POST" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    void load();
  }

  if (!isAdmin) {
    return <><section className="page-title"><div><span className="eyebrow">WHATSAPP BUSINESS</span><h1>WhatsApp</h1><p>Este módulo está habilitado para tu cuenta.</p></div></section>
      <section className="card"><p className="promoter-empty-note" style={{ padding: 20 }}>Aún no hay una bandeja operativa disponible para Supervisor/Promotor en este bloque. Tu Gerente administra la conexión con Meta desde aquí.</p></section>
    </>;
  }

  if (loading) return <div className="empty-core">Cargando…</div>;

  return <>
    <section className="page-title"><div><span className="eyebrow">WHATSAPP BUSINESS</span><h1>WhatsApp</h1><p>Conexión de tu empresa con Meta WhatsApp Business.</p></div></section>
    {message && <p className="form-error">{message}</p>}

    <section className="card">
      <div className="card-head"><div><h2>Estado</h2></div><span className={`operational-status ${(connection?.status ?? "disconnected").toLowerCase()}`}>{statusLabel(connection?.status)}</span></div>
      {(!connection || connection.status === "DISCONNECTED") && <div style={{ padding: "10px 0" }}>
        <p className="promoter-empty-note">Tu empresa aún no tiene una cuenta de WhatsApp Business conectada.</p>
        <button className="primary" disabled={connecting} onClick={() => void handleConnect()}>{connecting ? "Conectando…" : "Conectar con Meta"}</button>
      </div>}
      {connection?.status === "ERROR" && <div style={{ padding: "10px 0" }}>
        <p className="form-error">{connection.lastErrorMessage ?? "Ocurrió un error al conectar."}</p>
        <button className="primary" disabled={connecting} onClick={() => void handleConnect()}>{connecting ? "Conectando…" : "Reintentar conexión"}</button>
      </div>}
      {connection?.status === "CONNECTED" && <div className="detail-section"><div>
        <article><small>EMPRESA</small><strong>{connection.displayName ?? "—"}</strong></article>
        <article><small>NÚMERO</small><strong>{connection.phoneNumbers[0]?.displayPhoneNumber ?? "Sin número verificado"}</strong></article>
        <article><small>WABA</small><strong>{connection.wabaId ?? "—"}</strong></article>
        <article><small>ESTADO</small><strong>Conectado</strong></article>
        <article><small>FECHA DE CONEXIÓN</small><strong>{connection.connectedAt ? new Date(connection.connectedAt).toLocaleString("es-PE") : "—"}</strong></article>
      </div>
        <div className="user-actions" style={{ marginTop: 14 }}>
          <button className="secondary" onClick={() => void handleConnect()}>Administrar conexión</button>
          <button className="secondary" onClick={() => void handleDisconnect()}>Desconectar</button>
        </div>
      </div>}
    </section>

    {connection?.status === "CONNECTED" && <TemplatesSection />}
    {connection?.status === "CONNECTED" && <TestMessageSection />}
  </>;
}

function TemplatesSection() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ name: "", language: "es", category: "UTILITY", bodyText: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    const response = await fetch(`/api/integrations/meta/whatsapp/templates${refresh ? "?refresh=1" : ""}`);
    const result = await response.json();
    if (response.ok) { setTemplates(result.templates); setMessage(""); } else setMessage(result.message);
    setRefreshing(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(false), 0); return () => window.clearTimeout(timer); }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/integrations/meta/whatsapp/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.message);
    setForm({ name: "", language: "es", category: "UTILITY", bodyText: "" });
    void load(false);
  }

  return <section className="card">
    <div className="card-head"><div><h2>Plantillas</h2><small>Base mínima — sin diseñador avanzado</small></div><button className="secondary" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? "Actualizando…" : "Actualizar desde Meta"}</button></div>
    {message && <p className="form-error">{message}</p>}
    {!templates || templates.length === 0 ? <p className="promoter-empty-note" style={{ padding: "10px 0" }}>Aún no hay plantillas registradas.</p> : <div className="table-scroll"><table className="operational-table"><thead><tr><th>Nombre</th><th>Idioma</th><th>Categoría</th><th>Estado</th></tr></thead><tbody>{templates.map((t) => <tr key={t.id}><td><strong>{t.name}</strong></td><td>{t.language}</td><td>{t.category ?? "—"}</td><td>{t.status}</td></tr>)}</tbody></table></div>}
    <form className="user-form" onSubmit={submit} style={{ marginTop: 14 }}>
      <label>Nombre<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ej. bienvenida_cliente" /></label>
      <label>Idioma<input required value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="es" /></label>
      <label>Categoría<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="UTILITY">Utilidad</option><option value="MARKETING">Marketing</option><option value="AUTHENTICATION">Autenticación</option></select></label>
      <label className="wide">Texto<textarea required value={form.bodyText} onChange={(e) => setForm({ ...form, bodyText: e.target.value })} /></label>
      <button className="primary wide" disabled={saving}>{saving ? "Enviando a Meta…" : "Enviar plantilla a Meta"}</button>
    </form>
  </section>;
}

function TestMessageSection() {
  const [toPhone, setToPhone] = useState(""); const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/integrations/meta/whatsapp/test-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toPhone, body }) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.message);
    setMessage("Mensaje de prueba enviado.");
    setBody("");
  }

  return <section className="card">
    <div className="card-head"><div><h2>Mensaje de prueba</h2><small>Solo Gerente — para evidencia de App Review</small></div></div>
    <form className="user-form" onSubmit={submit}>
      <label>Número destino (con código de país)<input required value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="51999999999" /></label>
      <label className="wide">Mensaje<textarea required value={body} onChange={(e) => setBody(e.target.value)} /></label>
      {message && <p className="wide form-error">{message}</p>}
      <button className="primary wide" disabled={saving}>{saving ? "Enviando…" : "Enviar mensaje de prueba"}</button>
    </form>
  </section>;
}
