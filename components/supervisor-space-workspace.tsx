"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NewSaleModal, type Meta } from "@/components/promoter-space-workspace";

type SalesSlice = { total: number; aprobadas: number; rechazadas: number; canceladas: number; pendientes: number; tasaAprobacion: number };
type Employee = { id: string; jobPosition: string; store: string | null; commercialCode: string | null } | null;
type TeamGoal = { target: number; achieved: number; cumplimiento: number } | null;
type TeamMember = { id: string; name: string; jobPosition: string | null; store: string | null; salesMonth: number; salesPrevMonth: number; tasaAprobacion: number; trend: "up" | "down" | "flat"; goal: TeamGoal };
type Alert = { key: string; severity: "info" | "warning" | "critical"; message: string; userId?: string; userName?: string };
type SupervisorRankingEntry = { id: string; name: string; teamSales: number; ownSales: number; teamSize: number; isSelf: boolean };
type SupervisorData = {
  user: { name: string; email: string; status: string } | null; employee: Employee;
  today: SalesSlice; period: SalesSlice; team: TeamMember[];
  teamSummary: { activePromoters: number; teamSalesToday: number; teamSalesMonth: number; avgCumplimiento: number | null };
  supervisorRanking: { position: number; total: number; entries: SupervisorRankingEntry[] };
  alerts: Alert[];
};

function money(value: number | null) { return value === null ? "Sin datos" : `S/ ${value.toFixed(2)}`; }
function dayLabel(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" }); }
function timeOf(iso: string) { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }

function useLoadSupervisorData() {
  const [data, setData] = useState<SupervisorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/crm/supervisor-space");
    const result = await response.json();
    if (response.ok) setData(result); else setMessage(result.message);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { data, loading, message, reload: load };
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) { return <article><span className="stat-icon purple">◎</span><div><small>{label.toUpperCase()}</small><strong>{value}</strong>{sub && <p>{sub}</p>}</div></article>; }

export function SupervisorSpaceWorkspace() {
  const { data, loading, message, reload } = useLoadSupervisorData();
  const [meta, setMeta] = useState<Meta>({ products: [], commercialPlans: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => { const timer = window.setTimeout(async () => { const response = await fetch("/api/crm/meta"); if (response.ok) setMeta(await response.json()); }, 0); return () => window.clearTimeout(timer); }, []);

  if (loading && !data) return <div className="empty-core">Cargando tu gestión…</div>;
  if (!data) return <div className="operational-empty"><strong>No pudimos cargar tu espacio</strong><span>{message}</span><button className="secondary" onClick={() => void reload()}>Reintentar</button></div>;

  const criticalAlerts = data.alerts.filter((a) => a.severity !== "info").length;

  return <>
    <section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Mi gestión</h1><p>Controla tu equipo y registra tus propias ventas.</p></div></section>

    <section className="stats">
      <Kpi label="Promotores activos" value={String(data.teamSummary.activePromoters)} />
      <Kpi label="Ventas del equipo" value={String(data.teamSummary.teamSalesMonth)} sub="Este mes" />
      <Kpi label="Cumplimiento de meta" value={data.teamSummary.avgCumplimiento === null ? "Sin metas activas" : `${data.teamSummary.avgCumplimiento}%`} />
      <Kpi label="Alertas pendientes" value={String(criticalAlerts)} />
    </section>

    <section className="card promoter-goal-card supervisor-seller-strip">
      <div className="card-head"><div><h2>Mi producción personal</h2><small>Como vendedor</small></div><button className="primary" onClick={() => setOpen(true)}>＋ Nueva venta</button></div>
      <div className="promoter-commission-list">
        <div><small>Mi código</small><strong>{data.employee?.commercialCode ?? "Sin código"}</strong></div>
        <div><small>Mis ventas hoy</small><strong>{data.today.total}</strong></div>
        <div><small>Mis ventas del mes</small><strong>{data.period.total}</strong></div>
      </div>
    </section>

    <section className="grid-main promoter-day-grid">
      <section className="card">
        <div className="card-head"><div><h2>Mi equipo</h2></div><Link href="/crm/supervisor-team">Ver equipo completo →</Link></div>
        {data.team.length ? <div className="promoter-ranking-list">{data.team.slice(0, 5).map((m) => <div key={m.id} className="promoter-ranking-row"><span className="grow">{m.name}</span><strong>{m.salesMonth} ventas</strong></div>)}</div> : <p className="promoter-empty-note">Aún no tienes promotores asignados.</p>}
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Ranking de Supervisores</h2></div><Link href="/crm/supervisor-ranking">Ver ranking completo →</Link></div>
        {data.supervisorRanking.total ? <p className="promoter-goal-meta"><span>Estás <strong>#{data.supervisorRanking.position}</strong> de {data.supervisorRanking.total} supervisores este mes.</span></p> : <p className="promoter-empty-note">Aún no hay datos de ranking entre supervisores.</p>}
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Alertas</h2></div><Link href="/crm/supervisor-alerts">Ver todas →</Link></div>
        {data.alerts.length ? <div className="promoter-followup-list">{data.alerts.slice(0, 4).map((a) => <div key={a.key} className={`promoter-followup-row alert-${a.severity}`}><span className="grow">{a.message}</span></div>)}</div> : <p className="promoter-empty-note">Sin alertas activas.</p>}
      </section>
    </section>

    {open && <NewSaleModal meta={meta} storeName={data.employee?.store ?? null} close={() => setOpen(false)} onCreated={() => { setOpen(false); void reload(); }} />}
  </>;
}

export function SupervisorTeamWorkspace() {
  const { data, loading, message } = useLoadSupervisorData();
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  async function openMember(id: string) { setDetailLoading(true); const response = await fetch(`/api/crm/supervisor-space/team/${id}`); const result = await response.json(); if (response.ok) setDetail(result); setDetailLoading(false); }

  if (loading && !data) return <div className="empty-core">Cargando…</div>;
  if (!data) return <div className="operational-empty"><strong>No pudimos cargar tu equipo</strong><span>{message}</span></div>;

  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Mi equipo</h1><p>Promotores a tu cargo.</p></div></section>
    <section className="card operational-table-card">{data.team.length === 0 ? <div className="operational-empty"><strong>Aún no tienes promotores asignados.</strong></div> : <div className="table-scroll"><table className="operational-table"><thead><tr><th>Promotor</th><th>Cargo</th><th>Ventas del mes</th><th>Meta</th><th>Cumplimiento</th><th>Acción</th></tr></thead><tbody>{data.team.map((m) => <tr key={m.id}><td><strong>{m.name}</strong></td><td>{m.jobPosition ?? "—"}</td><td>{m.salesMonth}</td><td>{m.goal ? `${m.goal.achieved} de ${m.goal.target}` : "Sin meta"}</td><td>{m.goal ? `${m.goal.cumplimiento}%` : "—"}</td><td><button className="secondary" onClick={() => void openMember(m.id)}>Ver ficha</button></td></tr>)}</tbody></table></div>}</section>
    {detailLoading && <div className="detail-backdrop"><div className="detail-panel loading">Consultando ficha…</div></div>}
    {detail && <TeamMemberDrawer detail={detail} close={() => setDetail(null)} />}
  </>;
}

type TeamDetail = { user: { id: string; name: string; email: string; status: string }; employee: { jobPosition: { name: string } | null; store: { name: string } | null; commercialCode: string | null } | null; period: SalesSlice; recentSales: Array<{ id: string; customerNameSnapshot: string; productNameSnapshot: string; saleAmount: number | null; saleDate: string; status: string }>; customersCount: number; followUps: Array<{ id: string; scheduledAt: string; type: string; customer: { name: string } | null }>; goal: { target: number; achieved: number; periodStart: string; periodEnd: string } | null; actionPlans: Array<{ id: string; title: string; status: string; priority: string; dueAt: string | null }> };
const TABS = ["Resumen", "Ventas", "Seguimientos", "Metas", "Planes de acción"] as const;
function TeamMemberDrawer({ detail, close }: { detail: TeamDetail; close: () => void }) {
  const [tab, setTab] = useState<typeof TABS[number]>("Resumen");
  return <div className="detail-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><aside className="detail-panel"><header><div><span>FICHA DEL PROMOTOR</span><h2>{detail.user.name}</h2><p>{detail.user.email}</p></div><button onClick={close}>×</button></header>
    <div className="reconciliation-shortcuts">{TABS.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Resumen" && <section className="detail-section"><h3>Resumen</h3><div>
      <article><small>CARGO</small><strong>{detail.employee?.jobPosition?.name ?? "—"}</strong></article>
      <article><small>TIENDA</small><strong>{detail.employee?.store?.name ?? "—"}</strong></article>
      <article><small>VENTAS DEL MES</small><strong>{detail.period.total}</strong></article>
      <article><small>APROBADAS</small><strong>{detail.period.aprobadas}</strong></article>
      <article><small>TASA DE APROBACIÓN</small><strong>{detail.period.tasaAprobacion}%</strong></article>
      <article><small>CLIENTES</small><strong>{detail.customersCount}</strong></article>
    </div></section>}
    {tab === "Ventas" && <section className="detail-section"><h3>Ventas recientes</h3>{detail.recentSales.length ? <div>{detail.recentSales.map((s) => <article key={s.id}><small>{new Date(s.saleDate).toLocaleDateString("es-PE")} · {money(s.saleAmount)}</small><strong>{s.customerNameSnapshot} — {s.productNameSnapshot}</strong></article>)}</div> : <p className="promoter-empty-note">Sin ventas registradas.</p>}</section>}
    {tab === "Seguimientos" && <section className="detail-section"><h3>Seguimientos pendientes</h3>{detail.followUps.length ? <div>{detail.followUps.map((f) => <article key={f.id}><small>{dayLabel(f.scheduledAt)} · {timeOf(f.scheduledAt)}</small><strong>{f.type} — {f.customer?.name ?? "Sin cliente"}</strong></article>)}</div> : <p className="promoter-empty-note">Sin seguimientos pendientes.</p>}</section>}
    {tab === "Metas" && <section className="detail-section"><h3>Meta activa</h3>{detail.goal ? <div><article><small>PROGRESO</small><strong>{detail.goal.achieved} de {detail.goal.target}</strong></article><article><small>PERÍODO</small><strong>{new Date(detail.goal.periodStart).toLocaleDateString("es-PE")} – {new Date(detail.goal.periodEnd).toLocaleDateString("es-PE")}</strong></article></div> : <p className="promoter-empty-note">Sin meta asignada.</p>}</section>}
    {tab === "Planes de acción" && <section className="detail-section"><h3>Planes de acción</h3>{detail.actionPlans.length ? <div>{detail.actionPlans.map((p) => <article key={p.id}><small>{p.status}</small><strong>{p.title}</strong></article>)}</div> : <p className="promoter-empty-note">Sin planes de acción.</p>}</section>}
  </aside></div>;
}

type GoalRow = { id: string; name: string; targetValue: number; periodStart: string; periodEnd: string; status: string; promoterId: string | null; promoterName: string; achieved: number | null };
export function SupervisorGoalsWorkspace() {
  const [goals, setGoals] = useState<GoalRow[] | null>(null);
  const [team, setTeam] = useState<Array<{ id: string; name: string; hasEmployee: boolean }>>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ promoterId: "", name: "", targetValue: "", periodStart: "", periodEnd: "" });
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { const response = await fetch("/api/crm/supervisor-space/goals"); const result = await response.json(); if (response.ok) { setGoals(result.goals); setTeam(result.team); } else setMessage(result.message); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/crm/supervisor-space/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, targetValue: Number(form.targetValue) }) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.message);
    setForm({ promoterId: "", name: "", targetValue: "", periodStart: "", periodEnd: "" });
    void load();
  }

  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Metas</h1><p>Asigna metas de ventas a tus promotores.</p></div></section>
    <section className="card"><h2>Nueva meta</h2><form className="user-form" onSubmit={submit}>
      <label>Promotor<select required value={form.promoterId} onChange={(e) => setForm({ ...form, promoterId: e.target.value })}><option value="">Seleccionar</option>{team.map((m) => <option key={m.id} value={m.id} disabled={!m.hasEmployee}>{m.name}{!m.hasEmployee ? " (sin ficha de empleado)" : ""}</option>)}</select></label>
      <label>Nombre de la meta<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Meta de agosto" /></label>
      <label>Ventas objetivo<input type="number" min={1} required value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} /></label>
      <label>Desde<input type="date" required value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></label>
      <label>Hasta<input type="date" required value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></label>
      {message && <p className="form-error">{message}</p>}
      <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Asignar meta"}</button>
    </form></section>
    <section className="card operational-table-card">{!goals ? <div className="empty-core">Cargando…</div> : goals.length === 0 ? <div className="operational-empty"><strong>Aún no has asignado metas.</strong></div> : <div className="table-scroll"><table className="operational-table"><thead><tr><th>Promotor</th><th>Meta</th><th>Objetivo</th><th>Progreso</th><th>Período</th><th>Estado</th></tr></thead><tbody>{goals.map((g) => <tr key={g.id}><td><strong>{g.promoterName}</strong></td><td>{g.name}</td><td>{g.targetValue}</td><td>{g.achieved === null ? "—" : `${g.achieved} de ${g.targetValue}`}</td><td>{new Date(g.periodStart).toLocaleDateString("es-PE")} – {new Date(g.periodEnd).toLocaleDateString("es-PE")}</td><td>{g.status}</td></tr>)}</tbody></table></div>}</section>
  </>;
}

export function SupervisorRankingWorkspace() {
  const [type, setType] = useState<"promoters" | "supervisors">("promoters");
  const [scope, setScope] = useState<"today" | "week" | "month">("month");
  const [data, setData] = useState<{ total: number; position?: number; entries: Array<{ id: string; name: string; sales?: number; teamSales?: number; ownSales?: number; isSelf: boolean }> } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { const timer = window.setTimeout(async () => { const response = await fetch(`/api/crm/supervisor-space/ranking?range=${scope}&type=${type}`); const result = await response.json(); if (response.ok) setData(result); else setMessage(result.message); }, 0); return () => window.clearTimeout(timer); }, [scope, type]);

  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Ranking</h1><p>{type === "promoters" ? "Ranking de tus promotores por ventas aprobadas." : "Tu posición entre los Supervisores de la empresa — solo se muestran datos agregados de otros equipos."}</p></div></section>
    <div className="reconciliation-shortcuts">{(["promoters", "supervisors"] as const).map((t) => <button key={t} className={type === t ? "active" : ""} onClick={() => setType(t)}>{t === "promoters" ? "Mis promotores" : "Supervisores"}</button>)}</div>
    <div className="reconciliation-shortcuts">{(["today", "week", "month"] as const).map((s) => <button key={s} className={scope === s ? "active" : ""} onClick={() => setScope(s)}>{s === "today" ? "Hoy" : s === "week" ? "Semana" : "Mes"}</button>)}</div>
    {message && <p className="form-error">{message}</p>}
    <section className="card">{!data ? <div className="empty-core">Cargando…</div> : data.entries.length === 0 ? <p className="promoter-empty-note" style={{ padding: 20 }}>Aún no hay datos de ranking.</p> : <div className="promoter-ranking-list wide-list">{data.entries.map((entry, index) => <div key={entry.id} className={`promoter-ranking-row${entry.isSelf ? " self" : ""}`}><span className="promoter-rank-index">{index + 1}</span><span className="grow">{entry.name}{entry.isSelf ? " (Tú)" : ""}</span><strong>{type === "promoters" ? `${entry.sales} ventas` : `${entry.teamSales} ventas equipo`}</strong>{type === "supervisors" && <small>{entry.ownSales} ventas propias</small>}</div>)}</div>}</section>
  </>;
}

export function SupervisorPerformanceWorkspace() {
  const { data, loading, message } = useLoadSupervisorData();
  if (loading && !data) return <div className="empty-core">Cargando…</div>;
  if (!data) return <div className="operational-empty"><strong>No pudimos cargar el rendimiento</strong><span>{message}</span></div>;
  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Rendimiento</h1><p>Desempeño de cada promotor este mes.</p></div></section>
    <section className="card operational-table-card">{data.team.length === 0 ? <div className="operational-empty"><strong>Aún no tienes promotores asignados.</strong></div> : <div className="table-scroll"><table className="operational-table"><thead><tr><th>Promotor</th><th>Ventas</th><th>Aprobación</th><th>Meta</th><th>Cumplimiento</th><th>Tendencia</th></tr></thead><tbody>{data.team.map((m) => <tr key={m.id}><td><strong>{m.name}</strong></td><td>{m.salesMonth}</td><td>{m.tasaAprobacion}%</td><td>{m.goal ? `${m.goal.achieved} de ${m.goal.target}` : "Sin meta"}</td><td>{m.goal ? `${m.goal.cumplimiento}%` : "—"}</td><td><span className={`trend-${m.trend}`}>{m.trend === "up" ? "↑ Subiendo" : m.trend === "down" ? "↓ Bajando" : "→ Estable"}</span></td></tr>)}</tbody></table></div>}</section>
  </>;
}

type MessageRow = { id: string; kind: string; type: string; title: string; body: string; recipientCount: number; readCount: number; createdAt: string; recipients: Array<{ userId: string; name: string; read: boolean }> };
export function SupervisorMessagesWorkspace() {
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [team, setTeamList] = useState<Array<{ id: string; name: string }>>([]);
  const [audienceType, setAudienceType] = useState<"TEAM" | "INDIVIDUAL" | "SELECTED">("TEAM");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [type, setType] = useState("INFORMATIVE");
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [msgResponse, spaceResponse] = await Promise.all([fetch("/api/crm/supervisor-space/messages"), fetch("/api/crm/supervisor-space")]);
    const [msgResult, spaceResult] = await Promise.all([msgResponse.json(), spaceResponse.json()]);
    if (msgResponse.ok) setMessages(msgResult.messages); else setMessage(msgResult.message);
    if (spaceResponse.ok) setTeamList(spaceResult.team.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/crm/supervisor-space/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audienceType, recipientIds: audienceType === "INDIVIDUAL" ? recipientIds.slice(0, 1) : recipientIds, type, title, body }) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.message);
    setTitle(""); setBody(""); setRecipientIds([]);
    void load();
  }
  function toggleRecipient(id: string) { setRecipientIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]); }

  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Mensajes</h1><p>Comunicación interna con tu equipo — no depende de WhatsApp ni SMS.</p></div></section>
    <section className="card"><h2>Nuevo mensaje</h2><form className="user-form" onSubmit={submit}>
      <label>Destinatarios<select value={audienceType} onChange={(e) => { setAudienceType(e.target.value as typeof audienceType); setRecipientIds([]); }}><option value="TEAM">Todo mi equipo</option><option value="INDIVIDUAL">Un promotor</option><option value="SELECTED">Varios promotores</option></select></label>
      {audienceType !== "TEAM" && <div className="wide provider-list">{team.map((m) => <label key={m.id} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type={audienceType === "INDIVIDUAL" ? "radio" : "checkbox"} name="recipient" checked={recipientIds.includes(m.id)} onChange={() => audienceType === "INDIVIDUAL" ? setRecipientIds([m.id]) : toggleRecipient(m.id)} />{m.name}</label>)}</div>}
      <label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}><option value="MOTIVATIONAL">Motivacional</option><option value="INFORMATIVE">Informativo</option><option value="RECOGNITION">Reconocimiento</option><option value="URGENT">Urgente</option></select></label>
      <label>Título<input required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="wide">Mensaje<textarea required value={body} onChange={(e) => setBody(e.target.value)} /></label>
      {message && <p className="wide form-error">{message}</p>}
      <button className="primary wide" disabled={saving}>{saving ? "Enviando…" : "Enviar mensaje"}</button>
    </form></section>
    <section className="card operational-table-card"><h2 style={{ padding: "16px 20px 0" }}>Historial enviado</h2>{!messages ? <div className="empty-core">Cargando…</div> : messages.length === 0 ? <div className="operational-empty"><strong>Aún no has enviado mensajes.</strong></div> : <div className="table-scroll"><table className="operational-table"><thead><tr><th>Fecha</th><th>Título</th><th>Tipo</th><th>Destinatarios</th><th>Leídos</th></tr></thead><tbody>{messages.map((m) => <tr key={m.id}><td>{new Date(m.createdAt).toLocaleDateString("es-PE")}</td><td><strong>{m.title}</strong></td><td>{m.type}</td><td>{m.recipientCount}</td><td>{m.readCount} de {m.recipientCount} leyeron</td></tr>)}</tbody></table></div>}</section>
  </>;
}

type ActionPlanRow = { id: string; title: string; problemDescription: string; actionDescription: string; status: string; priority: string; dueAt: string | null; assignedUserName: string };
export function SupervisorActionPlansWorkspace() {
  const [plans, setPlans] = useState<ActionPlanRow[] | null>(null);
  const [team, setTeamList] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({ assignedUserId: "", title: "", problemDescription: "", actionDescription: "", priority: "MEDIUM", dueAt: "" });
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/crm/supervisor-space/action-plans"); const result = await response.json(); if (response.ok) { setPlans(result.plans); setTeamList(result.team); } else setMessage(result.message); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/crm/supervisor-space/action-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.message);
    setForm({ assignedUserId: "", title: "", problemDescription: "", actionDescription: "", priority: "MEDIUM", dueAt: "" });
    void load();
  }
  async function updateStatus(id: string, status: string) { await fetch(`/api/crm/action-plans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); void load(); }

  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Planes de acción</h1><p>Solo para promotores de tu equipo.</p></div></section>
    <section className="card"><h2>Nuevo plan de acción</h2><form className="user-form" onSubmit={submit}>
      <label>Responsable<select required value={form.assignedUserId} onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}><option value="">Seleccionar</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label>Título<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>Prioridad<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></label>
      <label>Fecha límite<input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
      <label className="wide">Problema<textarea required value={form.problemDescription} onChange={(e) => setForm({ ...form, problemDescription: e.target.value })} /></label>
      <label className="wide">Acciones<textarea required value={form.actionDescription} onChange={(e) => setForm({ ...form, actionDescription: e.target.value })} /></label>
      {message && <p className="wide form-error">{message}</p>}
      <button className="primary wide" disabled={saving}>{saving ? "Guardando…" : "Crear plan de acción"}</button>
    </form></section>
    <section className="card operational-table-card">{!plans ? <div className="empty-core">Cargando…</div> : plans.length === 0 ? <div className="operational-empty"><strong>Aún no hay planes de acción.</strong></div> : <div className="table-scroll"><table className="operational-table"><thead><tr><th>Responsable</th><th>Título</th><th>Prioridad</th><th>Estado</th><th>Vence</th><th>Acción</th></tr></thead><tbody>{plans.map((p) => <tr key={p.id}><td><strong>{p.assignedUserName}</strong></td><td>{p.title}</td><td>{p.priority}</td><td>{p.status}</td><td>{p.dueAt ? new Date(p.dueAt).toLocaleDateString("es-PE") : "—"}</td><td>{p.status !== "COMPLETED" && p.status !== "CANCELLED" && <div className="user-actions"><button className="secondary" onClick={() => void updateStatus(p.id, "IN_PROGRESS")}>En progreso</button><button className="secondary" onClick={() => void updateStatus(p.id, "COMPLETED")}>Completar</button></div>}</td></tr>)}</tbody></table></div>}</section>
  </>;
}

type FollowUpSummaryItem = { id: string; assignedUserId: string; scheduledAt: string; status: string; type: string; customer: { name: string } | null; promoterName: string };
function useLoadFollowUpsSummary() {
  const [data, setData] = useState<{ summary: { programados: number; completados: number; pendientes: number; vencidos: number }; byPromoter: Array<{ id: string; name: string; programados: number; completados: number; pendientes: number; vencidos: number }>; items: FollowUpSummaryItem[] } | null>(null);
  const load = useCallback(async () => { const response = await fetch("/api/crm/supervisor-space/followups"); const result = await response.json(); if (response.ok) setData(result); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { data, reload: load };
}

export function SupervisorFollowUpsWorkspace() {
  const { data, reload } = useLoadFollowUpsSummary();
  async function complete(id: string) { await fetch(`/api/crm/follow-ups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) }); void reload(); }
  if (!data) return <div className="empty-core">Cargando…</div>;
  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Seguimientos</h1><p>Resumen de tu equipo.</p></div></section>
    <section className="stats"><Kpi label="Programados" value={String(data.summary.programados)} /><Kpi label="Completados" value={String(data.summary.completados)} /><Kpi label="Pendientes" value={String(data.summary.pendientes)} /><Kpi label="Vencidos" value={String(data.summary.vencidos)} /></section>
    <section className="card operational-table-card"><h2 style={{ padding: "16px 20px 0" }}>Por promotor</h2><div className="table-scroll"><table className="operational-table"><thead><tr><th>Promotor</th><th>Programados</th><th>Completados</th><th>Pendientes</th><th>Vencidos</th></tr></thead><tbody>{data.byPromoter.map((p) => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.programados}</td><td>{p.completados}</td><td>{p.pendientes}</td><td>{p.vencidos}</td></tr>)}</tbody></table></div></section>
    <section className="card">{data.items.length === 0 ? <p className="promoter-empty-note" style={{ padding: 20 }}>Sin seguimientos registrados.</p> : <div className="promoter-followup-list wide-list">{data.items.filter((i) => i.status === "PENDING").map((item) => <div key={item.id} className="promoter-followup-row"><span>{dayLabel(item.scheduledAt)} · {timeOf(item.scheduledAt)}</span><div className="grow"><strong>{item.type}</strong><small>{item.promoterName} — {item.customer?.name ?? "Sin cliente"}</small></div><button className="secondary" onClick={() => void complete(item.id)}>Completar</button></div>)}</div>}</section>
  </>;
}

export function SupervisorAgendaWorkspace() {
  const { data } = useLoadFollowUpsSummary();
  const [range, setRange] = useState<"today" | "week">("today");
  const [promoterId, setPromoterId] = useState("");
  if (!data) return <div className="empty-core">Cargando…</div>;
  const now = new Date();
  const filtered = data.items.filter((item) => {
    if (promoterId && item.assignedUserId !== promoterId) return false;
    const d = new Date(item.scheduledAt);
    if (range === "today") return d.toDateString() === now.toDateString();
    const diff = (d.getTime() - now.getTime()) / 86400000;
    return diff >= -7 && diff <= 7;
  }).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Agenda</h1><p>Actividades de tu equipo.</p></div></section>
    <div className="reconciliation-shortcuts"><button className={range === "today" ? "active" : ""} onClick={() => setRange("today")}>Hoy</button><button className={range === "week" ? "active" : ""} onClick={() => setRange("week")}>Semana</button>
      <select value={promoterId} onChange={(e) => setPromoterId(e.target.value)}><option value="">Todos los promotores</option>{data.byPromoter.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </div>
    <section className="card">{filtered.length === 0 ? <p className="promoter-empty-note" style={{ padding: 20 }}>No hay actividades programadas en este rango.</p> : <div className="promoter-agenda-timeline">{filtered.map((item) => <div key={item.id} className="promoter-agenda-row"><div className="promoter-agenda-time"><strong>{timeOf(item.scheduledAt)}</strong><small>{dayLabel(item.scheduledAt)}</small></div><div className="grow"><strong>{item.type}</strong><small>{item.promoterName} — {item.customer?.name ?? "Sin cliente"}</small></div></div>)}</div>}</section>
  </>;
}

export function SupervisorAlertsWorkspace() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  useEffect(() => { const timer = window.setTimeout(async () => { const response = await fetch("/api/crm/supervisor-space/alerts"); const result = await response.json(); if (response.ok) setAlerts(result.alerts); }, 0); return () => window.clearTimeout(timer); }, []);
  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Alertas</h1><p>Derivadas en tiempo real de tu equipo — sin datos simulados.</p></div></section>
    <section className="card">{!alerts ? <div className="empty-core">Cargando…</div> : alerts.length === 0 ? <p className="promoter-empty-note" style={{ padding: 20 }}>Sin alertas activas.</p> : <div className="promoter-followup-list wide-list">{alerts.map((a) => <div key={a.key} className={`promoter-followup-row alert-${a.severity}`}><span className="grow">{a.message}</span></div>)}</div>}</section>
  </>;
}

export function SupervisorProfileWorkspace() {
  const { data, loading, message } = useLoadSupervisorData();
  if (loading && !data) return <div className="empty-core">Cargando…</div>;
  if (!data) return <div className="operational-empty"><strong>No pudimos cargar tu perfil</strong><span>{message}</span></div>;
  return <><section className="page-title crm-title"><div><span className="eyebrow">SUPERVISOR</span><h1>Mi perfil</h1><p>Información de tu cuenta.</p></div></section>
    <section className="card"><div className="detail-section"><div>
      <article><small>NOMBRE</small><strong>{data.user?.name ?? "—"}</strong></article>
      <article><small>CORREO</small><strong>{data.user?.email ?? "—"}</strong></article>
      <article><small>CÓDIGO COMERCIAL</small><strong>{data.employee?.commercialCode ?? "Sin código"}</strong></article>
      <article><small>TIENDA</small><strong>{data.employee?.store ?? "Sin tienda asignada"}</strong></article>
      <article><small>CARGO</small><strong>{data.employee?.jobPosition ?? "Sin cargo asignado"}</strong></article>
      <article><small>ESTADO</small><strong>{data.user?.status === "ACTIVE" ? "Activo" : "Inactivo"}</strong></article>
    </div></div>
    <div className="detail-section"><Link className="secondary" href="/cambiar-password">Cambiar contraseña →</Link></div>
    </section>
  </>;
}
