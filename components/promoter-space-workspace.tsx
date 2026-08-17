"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type SalesSlice = { total: number; aprobadas: number; rechazadas: number; canceladas: number; pendientes: number; tasaAprobacion: number };
type Employee = { id: string; name: string; jobPosition: { name: string }; store: { id: string; name: string } | null; compensationPlan: { name: string; mode: string } } | null;
type Goal = { targetValue: number; periodStart: string; periodEnd: string; achieved: number; daysRemaining: number } | null;
type RankingEntry = { id: string; name: string; sales: number; tasaAprobacion?: number; isSelf: boolean };
type Ranking = { position: number; total: number; entries: RankingEntry[] };
type FollowUpItem = { id: string; scheduledAt: string; type: string; notes: string | null; customer: { id: string; name: string; phone: string } | null };
type FollowUpListItem = FollowUpItem & { status: string };
type RecentSale = { id: string; customerName: string; productName: string; amount: number | null; saleDate: string; status: string };
type FeaturedMessage = { id: string; title: string; body: string; type: string; fromName: string; createdAt: string } | null;
type PromoterData = { user: { name: string; email: string; status: string } | null; employee: Employee; supervisorName: string | null; today: SalesSlice; period: SalesSlice; commissions: { projected: number | null; confirmed: number | null }; goal: Goal; featuredMessage: FeaturedMessage; ranking: Ranking; followUpsToday: FollowUpItem[]; recentSales: RecentSale[] };
type CustomerMatch = { id: string; name: string; document: string | null; phone: string };
export type Meta = { products: Array<{ id: string; name: string }>; commercialPlans: Array<{ id: string; name: string; productId: string }> };

const OPERATIONS = ["PORTABILIDAD", "ALTA_NUEVA", "PORTABILIDAD_POSTPAGO", "ALTA_NUEVA_POSTPAGO", "MIGRACION", "PREPAGO", "RENOVACION", "LINEA_FIJA", "INTERNET_FIJO", "OTRO"];
function money(value: number | null) { return value === null ? "Sin datos" : `S/ ${value.toFixed(2)}`; }
function timeOf(iso: string) { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }
function dayLabel(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" }); }
function firstName(name: string) { return name.split(" ")[0]; }
function initials(name: string) { return name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase(); }

function useLoadPromoterData() {
  const [data, setData] = useState<PromoterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/crm/promoter-space");
    const result = await response.json();
    if (response.ok) setData(result); else setMessage(result.message);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { data, loading, message, reload: load };
}

export function PromoterSpaceWorkspace() {
  const { data, loading, message, reload } = useLoadPromoterData();
  const [meta, setMeta] = useState<Meta>({ products: [], commercialPlans: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => { const timer = window.setTimeout(async () => { const response = await fetch("/api/crm/meta"); if (response.ok) setMeta(await response.json()); }, 0); return () => window.clearTimeout(timer); }, []);

  if (loading && !data) return <div className="empty-core">Cargando tu día…</div>;
  if (!data) return <div className="operational-empty"><strong>No pudimos cargar tu espacio</strong><span>{message}</span><button className="secondary" onClick={() => void reload()}>Reintentar</button></div>;

  const cumplimiento = data.goal && data.goal.targetValue > 0 ? Math.round((data.goal.achieved / data.goal.targetValue) * 1000) / 10 : null;
  const restantes = data.goal ? Math.max(0, data.goal.targetValue - data.goal.achieved) : null;
  const clientesHoy = data.followUpsToday.filter(f => f.customer);

  return <>
    <section className="page-title crm-title"><div><span className="eyebrow">PROMOTOR</span><h1>Hola, {data.user ? firstName(data.user.name) : "Promotor"}</h1><p>Hoy tienes {clientesHoy.length} cliente{clientesHoy.length === 1 ? "" : "s"} por atender{data.ranking.total > 1 ? ` y estás #${data.ranking.position} en tu equipo.` : "."}</p></div><button className="primary" onClick={() => setOpen(true)}>＋ Registrar venta</button></section>

    {data.featuredMessage && <section className="card promoter-featured-message"><span className="eyebrow">MENSAJE DE TU SUPERVISOR</span><h3>{data.featuredMessage.title}</h3><p>{data.featuredMessage.body}</p><div className="promoter-message-meta"><strong>{data.featuredMessage.fromName}</strong><small>{new Date(data.featuredMessage.createdAt).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div></section>}

    <section className="stats">
      <Kpi label="Ventas hoy" value={String(data.today.total)} />
      <Kpi label="Ventas del mes" value={String(data.period.total)} sub={data.goal ? `Objetivo: ${data.goal.targetValue} ventas` : undefined} />
      <Kpi label="Cumplimiento" value={cumplimiento === null ? "Sin meta asignada" : `${cumplimiento}%`} />
      <Kpi label="Mi ranking" value={data.ranking.total ? `#${data.ranking.position} de ${data.ranking.total}` : "—"} />
    </section>

    <section className="grid-main promoter-day-grid">
      <section className="card promoter-goal-card">
        <div className="card-head"><div><h2>Meta del mes</h2></div><Link href="/crm/promoter-goals">Ver detalle →</Link></div>
        {data.goal ? <>
          <div className="promoter-goal-value"><strong>{data.goal.achieved}</strong><span>de {data.goal.targetValue} ventas</span><b>{cumplimiento}%</b></div>
          <div className="promoter-goal-bar"><i style={{ width: `${Math.min(100, cumplimiento ?? 0)}%` }} /></div>
          <div className="promoter-goal-meta"><span>Te faltan <strong>{restantes}</strong> ventas</span><span><strong>{data.goal.daysRemaining}</strong> días restantes</span></div>
        </> : <p className="promoter-empty-note">Aún no tienes una meta asignada.</p>}
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Mi ranking</h2></div><Link href="/crm/promoter-ranking">Ver ranking completo →</Link></div>
        {data.ranking.entries.length ? <div className="promoter-ranking-list">{data.ranking.entries.map((entry, index) => <div key={entry.id} className={`promoter-ranking-row${entry.isSelf ? " self" : ""}`}><span className="promoter-rank-index">{index + 1}</span><span className="grow">{entry.name}{entry.isSelf ? " (Tú)" : ""}</span><strong>{entry.sales} ventas</strong></div>)}</div> : <p className="promoter-empty-note">Aún no hay datos de ranking.</p>}
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Mis comisiones</h2></div><Link href="/crm/promoter-commissions">Ver detalle de comisiones →</Link></div>
        {data.employee?.compensationPlan ? <div className="promoter-commission-list"><div><small>Proyectada</small><strong>{money(data.commissions.projected)}</strong></div><div><small>Confirmada</small><strong>{money(data.commissions.confirmed)}</strong></div></div> : <p className="promoter-empty-note">Sin plan de compensación asignado.</p>}
      </section>
    </section>

    <section className="grid-main promoter-day-grid">
      <section className="card">
        <div className="card-head"><div><h2>Clientes para hoy</h2></div><Link href="/crm/customers">Ver todos →</Link></div>
        {clientesHoy.length ? <div className="promoter-client-list">{clientesHoy.slice(0, 5).map(item => <div key={item.id} className="promoter-client-row"><span className="user-avatar">{initials(item.customer!.name)}</span><div className="grow"><strong>{item.customer!.name}</strong><small>{item.type}</small></div><span>{timeOf(item.scheduledAt)}</span></div>)}</div> : <p className="promoter-empty-note">No tienes clientes pendientes por atender hoy.</p>}
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Seguimientos de hoy</h2></div><Link href="/crm/promoter-agenda">Ver agenda completa →</Link></div>
        {data.followUpsToday.length ? <div className="promoter-followup-list">{data.followUpsToday.slice(0, 5).map(item => <div key={item.id} className="promoter-followup-row"><span>{timeOf(item.scheduledAt)}</span><div className="grow"><strong>{item.type}</strong><small>{item.customer?.name ?? "Sin cliente"}</small></div></div>)}</div> : <p className="promoter-empty-note">No tienes seguimientos pendientes para hoy.</p>}
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Mis ventas recientes</h2></div><Link href="/crm/sales">Ir a mis ventas →</Link></div>
        {data.recentSales.length ? <div className="promoter-sales-list">{data.recentSales.map(sale => <div key={sale.id} className="promoter-sale-row"><div className="grow"><strong>{sale.customerName}</strong><small>{sale.productName}</small></div><div className="promoter-sale-meta"><span>{money(sale.amount)}</span><em className={`operational-status ${sale.status.toLowerCase()}`}>{sale.status}</em></div></div>)}</div> : <p className="promoter-empty-note">Aún no tienes ventas registradas este mes.</p>}
      </section>
    </section>

    {open && <NewSaleModal meta={meta} storeName={data.employee?.store?.name ?? null} close={() => setOpen(false)} onCreated={() => { setOpen(false); void reload(); }} />}
  </>;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) { return <article><span className="stat-icon purple">◎</span><div><small>{label.toUpperCase()}</small><strong>{value}</strong>{sub && <p>{sub}</p>}</div></article>; }

export function PromoterFollowUpsWorkspace() {
  const [items, setItems] = useState<FollowUpListItem[] | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/crm/follow-ups"); const result = await response.json(); if (response.ok) setItems(result.items); else setMessage(result.message); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function complete(id: string) { await fetch(`/api/crm/follow-ups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) }); void load(); }
  async function reschedule(id: string) { const value = window.prompt("Nueva fecha y hora (YYYY-MM-DDTHH:mm)"); if (!value) return; await fetch(`/api/crm/follow-ups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledAt: value }) }); void load(); }

  return <><section className="page-title crm-title"><div><span className="eyebrow">PROMOTOR</span><h1>Seguimientos</h1><p>Tus seguimientos pendientes y completados.</p></div></section>
    {message && <p className="form-error">{message}</p>}
    <section className="card">{!items ? <div className="empty-core">Cargando…</div> : items.length === 0 ? <p className="promoter-empty-note" style={{ padding: 20 }}>No tienes seguimientos pendientes para hoy.</p> : <div className="promoter-followup-list wide-list">{items.map(item => <div key={item.id} className="promoter-followup-row"><span>{dayLabel(item.scheduledAt)} · {timeOf(item.scheduledAt)}</span><div className="grow"><strong>{item.type}</strong><small>{item.customer?.name ?? "Sin cliente"}{item.notes ? ` · ${item.notes}` : ""}</small></div><span className={`crm-state ${item.status.toLowerCase()}`}>{item.status}</span>{item.status === "PENDING" && <div className="user-actions"><button className="secondary" onClick={() => void complete(item.id)}>Completar</button><button className="secondary" onClick={() => void reschedule(item.id)}>Reprogramar</button>{item.customer && <Link className="secondary" href="/crm/customers">Ver cliente</Link>}</div>}</div>)}</div>}</section>
  </>;
}

export function PromoterAgendaWorkspace() {
  const [items, setItems] = useState<FollowUpListItem[] | null>(null);
  const [range, setRange] = useState<"today" | "week">("today");
  useEffect(() => { const timer = window.setTimeout(async () => { const response = await fetch("/api/crm/follow-ups"); const result = await response.json(); if (response.ok) setItems(result.items); }, 0); return () => window.clearTimeout(timer); }, []);
  const now = new Date();
  const filtered = (items ?? []).filter(item => { const d = new Date(item.scheduledAt); if (range === "today") return d.toDateString() === now.toDateString(); const diff = (d.getTime() - now.getTime()) / 86400000; return diff >= -7 && diff <= 7; }).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return <><section className="page-title crm-title"><div><span className="eyebrow">PROMOTOR</span><h1>Agenda</h1><p>Tus próximas actividades.</p></div></section>
    <div className="reconciliation-shortcuts"><button className={range === "today" ? "active" : ""} onClick={() => setRange("today")}>Hoy</button><button className={range === "week" ? "active" : ""} onClick={() => setRange("week")}>Semana</button></div>
    <section className="card">{!items ? <div className="empty-core">Cargando…</div> : filtered.length === 0 ? <p className="promoter-empty-note" style={{ padding: 20 }}>No tienes actividades programadas en este rango.</p> : <div className="promoter-agenda-timeline">{filtered.map(item => <div key={item.id} className="promoter-agenda-row"><div className="promoter-agenda-time"><strong>{timeOf(item.scheduledAt)}</strong><small>{dayLabel(item.scheduledAt)}</small></div><div className="grow"><strong>{item.type}</strong><small>{item.customer?.name ?? "Sin cliente"}</small></div></div>)}</div>}</section>
  </>;
}

export function PromoterRankingWorkspace() {
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [scope, setScope] = useState<"today" | "week" | "month">("month");
  const [message, setMessage] = useState("");
  useEffect(() => { const timer = window.setTimeout(async () => { const response = await fetch(`/api/crm/promoter-space/ranking?range=${scope}`); const result = await response.json(); if (response.ok) setRanking(result); else setMessage(result.message); }, 0); return () => window.clearTimeout(timer); }, [scope]);

  return <><section className="page-title crm-title"><div><span className="eyebrow">PROMOTOR</span><h1>Mi ranking</h1><p>Ranking de tu equipo por ventas aprobadas. Solo se muestran nombre, posición y ventas.</p></div></section>
    <div className="reconciliation-shortcuts">{(["today", "week", "month"] as const).map(s => <button key={s} className={scope === s ? "active" : ""} onClick={() => setScope(s)}>{s === "today" ? "Hoy" : s === "week" ? "Semana" : "Mes"}</button>)}</div>
    {message && <p className="form-error">{message}</p>}
    <section className="card">{!ranking ? <div className="empty-core">Cargando…</div> : ranking.entries.length === 0 ? <p className="promoter-empty-note" style={{ padding: 20 }}>Aún no hay ventas registradas en este período.</p> : <div className="promoter-ranking-list wide-list">{ranking.entries.map((entry, index) => <div key={entry.id} className={`promoter-ranking-row${entry.isSelf ? " self" : ""}`}><span className="promoter-rank-index">{index + 1}</span><span className="grow">{entry.name}{entry.isSelf ? " (Tú)" : ""}</span>{entry.tasaAprobacion !== undefined && <small>{entry.tasaAprobacion}% aprobación</small>}<strong>{entry.sales} ventas</strong></div>)}</div>}</section>
  </>;
}

export function PromoterCommissionsWorkspace() {
  const { data, loading, message } = useLoadPromoterData();
  if (loading && !data) return <div className="empty-core">Cargando…</div>;
  if (!data) return <div className="operational-empty"><strong>No pudimos cargar tus comisiones</strong><span>{message}</span></div>;
  return <><section className="page-title crm-title"><div><span className="eyebrow">PROMOTOR</span><h1>Mis comisiones</h1><p>{data.employee?.compensationPlan ? `Plan: ${data.employee.compensationPlan.name}` : "Cálculo de comisiones del período."}</p></div></section>
    {data.employee?.compensationPlan ? <section className="economic-summary"><article><small>PROYECTADA</small><strong>{money(data.commissions.projected)}</strong><span>Período abierto o en revisión</span></article><article><small>CONFIRMADA</small><strong>{money(data.commissions.confirmed)}</strong><span>Período cerrado o pagado</span></article></section> : <section className="card"><p className="promoter-empty-note" style={{ padding: 20 }}>Sin plan de compensación asignado.</p></section>}
  </>;
}

type MyActionPlan = { id: string; title: string; problemDescription: string; actionDescription: string; status: string; priority: string; dueAt: string | null };
export function PromoterGoalsWorkspace() {
  const { data, loading, message } = useLoadPromoterData();
  const [plans, setPlans] = useState<MyActionPlan[] | null>(null);
  const loadPlans = useCallback(async () => { const response = await fetch("/api/crm/promoter-space/action-plans"); const result = await response.json(); if (response.ok) setPlans(result.plans); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadPlans(), 0); return () => window.clearTimeout(timer); }, [loadPlans]);
  async function advance(id: string, status: string) { await fetch(`/api/crm/action-plans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); void loadPlans(); }

  if (loading && !data) return <div className="empty-core">Cargando…</div>;
  if (!data) return <div className="operational-empty"><strong>No pudimos cargar tu meta</strong><span>{message}</span></div>;
  const cumplimiento = data.goal && data.goal.targetValue > 0 ? Math.round((data.goal.achieved / data.goal.targetValue) * 1000) / 10 : null;
  return <><section className="page-title crm-title"><div><span className="eyebrow">PROMOTOR</span><h1>Mis metas</h1><p>Meta comercial asignada para el período actual.</p></div></section>
    <section className="card promoter-goal-card">{data.goal ? <>
      <div className="promoter-goal-value"><strong>{data.goal.achieved}</strong><span>de {data.goal.targetValue} ventas activadas</span><b>{cumplimiento}%</b></div>
      <div className="promoter-goal-bar"><i style={{ width: `${Math.min(100, cumplimiento ?? 0)}%` }} /></div>
      <p style={{ fontSize: 9, color: "#8b90a1", marginTop: 10 }}>Período: {new Date(data.goal.periodStart).toLocaleDateString("es-PE")} – {new Date(data.goal.periodEnd).toLocaleDateString("es-PE")}</p>
    </> : <p className="promoter-empty-note" style={{ padding: 20 }}>Todavía no tienes una meta asignada.</p>}</section>
    <section className="card"><div className="card-head"><div><h2>Mis planes de acción</h2></div></div>
      {!plans ? <p className="promoter-empty-note" style={{ padding: 20 }}>Cargando…</p> : plans.length === 0 ? <p className="promoter-empty-note" style={{ padding: 20 }}>Tu supervisor no te ha asignado planes de acción.</p> : <div className="promoter-followup-list wide-list">{plans.map((p) => <div key={p.id} className="promoter-followup-row"><div className="grow"><strong>{p.title}</strong><small>{p.problemDescription}</small></div><span className={`crm-state ${p.status.toLowerCase()}`}>{p.status}</span>{p.status !== "COMPLETED" && p.status !== "CANCELLED" && <div className="user-actions"><button className="secondary" onClick={() => void advance(p.id, "IN_PROGRESS")}>En progreso</button><button className="secondary" onClick={() => void advance(p.id, "COMPLETED")}>Completar</button></div>}</div>)}</div>}
    </section>
  </>;
}

export function PromoterProfileWorkspace() {
  const { data, loading, message } = useLoadPromoterData();
  if (loading && !data) return <div className="empty-core">Cargando…</div>;
  if (!data) return <div className="operational-empty"><strong>No pudimos cargar tu perfil</strong><span>{message}</span></div>;
  return <><section className="page-title crm-title"><div><span className="eyebrow">PROMOTOR</span><h1>Mi perfil</h1><p>Información de tu cuenta. Solo un administrador puede modificarla.</p></div></section>
    <section className="card"><div className="detail-section"><div>
      <article><small>NOMBRE</small><strong>{data.user?.name ?? "—"}</strong></article>
      <article><small>CORREO</small><strong>{data.user?.email ?? "—"}</strong></article>
      <article><small>SUPERVISOR</small><strong>{data.supervisorName ?? "Sin supervisor asignado"}</strong></article>
      <article><small>TIENDA</small><strong>{data.employee?.store?.name ?? "Sin tienda asignada"}</strong></article>
      <article><small>CARGO</small><strong>{data.employee?.jobPosition.name ?? "Sin cargo asignado"}</strong></article>
      <article><small>ESTADO</small><strong>{data.user?.status === "ACTIVE" ? "Activo" : "Inactivo"}</strong></article>
    </div></div></section>
  </>;
}

export function NewSaleModal({ meta, storeName, close, onCreated }: { meta: Meta; storeName: string | null; close: () => void; onCreated: () => void }) {
  const [search, setSearch] = useState(""); const [matches, setMatches] = useState<CustomerMatch[] | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null); const [customerLabel, setCustomerLabel] = useState("");
  const [name, setName] = useState(""), [document, setDocument] = useState(""), [phone, setPhone] = useState("");
  const [productId, setProductId] = useState(""), [commercialPlanId, setCommercialPlanId] = useState(""), [transactionType, setTransactionType] = useState("");
  const [sec, setSec] = useState(""), [sot, setSot] = useState(""), [notes, setNotes] = useState("");
  const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const plans = meta.commercialPlans.filter((p) => !productId || p.productId === productId);

  async function searchCustomer() {
    setMessage("");
    const response = await fetch(`/api/crm/customers?search=${encodeURIComponent(search)}`);
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setMatches(result.items ?? []);
  }
  function pickCustomer(item: CustomerMatch) { setCustomerId(item.id); setCustomerLabel(`${item.name}${item.document ? ` · ${item.document}` : ""}`); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    let finalCustomerId = customerId;
    if (!finalCustomerId) {
      if (!name.trim() || !phone.trim()) { setSaving(false); return setMessage("Busca un cliente existente o completa nombre y teléfono para crear uno nuevo."); }
      const response = await fetch("/api/crm/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, document, phone }) });
      const result = await response.json();
      if (!response.ok) { setSaving(false); return setMessage(result.message); }
      finalCustomerId = result.item.id;
    }
    const response = await fetch("/api/crm/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: finalCustomerId, productId, commercialPlanId: commercialPlanId || undefined, transactionType, sec: sec || undefined, sot: sot || undefined, notes: notes || undefined, saleDate: new Date().toISOString().slice(0, 10) }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(result.message);
    onCreated();
  }

  return <div className="detail-backdrop"><aside className="detail-panel reconciliation-modal"><header><h2>Nueva venta</h2><button onClick={close}>×</button></header>
    <form className="reconciliation-form" onSubmit={submit}>
      <div className="wide"><label>Buscar cliente por DNI, teléfono o nombre<div style={{ display: "flex", gap: 8 }}><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="DNI o teléfono" /><button type="button" className="secondary" onClick={() => void searchCustomer()}>Buscar</button></div></label></div>
      {matches && <div className="wide provider-list">{matches.length ? matches.map((m) => <article key={m.id}><div><strong>{m.name}</strong><small>{m.document ?? "Sin documento"} · {m.phone}</small></div><button type="button" className="secondary" onClick={() => pickCustomer(m)}>Usar este cliente</button></article>) : <p className="form-error">Sin coincidencias. Completa los datos abajo para crear un cliente nuevo.</p>}</div>}
      {customerId && <p className="wide"><strong>Cliente seleccionado:</strong> {customerLabel} <button type="button" className="secondary" onClick={() => { setCustomerId(null); setCustomerLabel(""); }}>Cambiar</button></p>}
      {!customerId && <>
        <label>Nombre del cliente<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>DNI<input value={document} onChange={(e) => setDocument(e.target.value)} /></label>
        <label>Teléfono<input required value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </>}
      <label>Producto<select required value={productId} onChange={(e) => { setProductId(e.target.value); setCommercialPlanId(""); }}><option value="">Seleccionar</option>{meta.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Plan comercial<select value={commercialPlanId} onChange={(e) => setCommercialPlanId(e.target.value)}><option value="">Sin plan</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Operación<select required value={transactionType} onChange={(e) => setTransactionType(e.target.value)}><option value="">Seleccionar</option>{OPERATIONS.map((op) => <option key={op} value={op}>{op}</option>)}</select></label>
      <label>SEC (opcional)<input value={sec} onChange={(e) => setSec(e.target.value)} /></label>
      <label>SOT (opcional)<input value={sot} onChange={(e) => setSot(e.target.value)} /></label>
      <label className="wide">Observación (opcional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <p className="wide" style={{ fontSize: 9, color: "#8b90a1" }}>Fecha: hoy · Promotor: tú mismo · Tienda: {storeName ?? "sin tienda asignada"} — se asignan automáticamente, no son editables.</p>
      {message && <p className="wide form-error">{message}</p>}
      <button className="primary wide" disabled={saving}>{saving ? "Registrando…" : "Registrar venta"}</button>
    </form>
  </aside></div>;
}
