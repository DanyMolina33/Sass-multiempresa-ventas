"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type FinanceType = "INGRESO" | "GASTO";
type Category = { id: string; type: FinanceType; name: string; active: boolean };
type Entry = { id: string; type: FinanceType; entryDate: string; concept: string; amount: string; currency: string; notes: string | null; documentName: string | null; documentReference: string | null; category: { id: string; name: string }; registeredBy: { id: string; name: string } };
type Summary = { operatingCurrency: string; recognizedIncome: number; otherIncome: number; expenses: number; totalIncome: number; baseResult: number; excludedOtherCurrency: Array<{ currency: string; type: FinanceType; count: number }> };
type Meta = { role: string; activeFeatures: string[] };
type Draft = { type: FinanceType; categoryId: string; entryDate: string; concept: string; amount: string; currency: string; notes: string; documentName: string; documentReference: string };
type CategoryDraft = { type: FinanceType; name: string };

const nav = [["leads", "Leads"], ["customers", "Clientes"], ["sales", "Ventas"], ["follow-ups", "Seguimientos"], ["products", "Productos"], ["commercial-plans", "Planes comerciales"], ["commissions", "Comisiones"], ["reconciliation", "Liquidaciones"], ["finance", "Finanzas"], ["payroll", "Pago de Personal"], ["commercial-management", "Gestión Comercial"], ["promoter-space", "Espacio Promotor"]];
const emptySummary: Summary = { operatingCurrency: "PEN", recognizedIncome: 0, otherIncome: 0, expenses: 0, totalIncome: 0, baseResult: 0, excludedOtherCurrency: [] };
function today() { return new Date().toISOString().slice(0, 10); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function defaultFilters() { return { period: currentMonth(), day: "", type: "", categoryId: "", search: "" }; }
const emptyDraft: Draft = { type: "GASTO", categoryId: "", entryDate: today(), concept: "", amount: "", currency: "PEN", notes: "", documentName: "", documentReference: "" };
const emptyCategoryDraft: CategoryDraft = { type: "GASTO", name: "" };

export function FinanceWorkspace({ administrativeTenant }: { administrativeTenant?: string | null }) {
  const [meta, setMeta] = useState<Meta>({ role: "", activeFeatures: [] });
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [filters, setFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategoryDraft);
  const canWrite = ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(meta.role);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const [metaResponse, categoriesResponse, entriesResponse] = await Promise.all([fetch("/api/crm/meta"), fetch("/api/crm/finance-categories"), fetch(`/api/crm/finance-entries?${query}`)]);
    const metaResult = await metaResponse.json(), categoriesResult = await categoriesResponse.json(), entriesResult = await entriesResponse.json();
    if (metaResponse.ok) setMeta(metaResult);
    if (categoriesResponse.ok) setCategories(categoriesResult.items);
    if (entriesResponse.ok) { setEntries(entriesResult.items); setSummary(entriesResult.summary); setMessage(""); } else setMessage(entriesResult.message);
    setLoading(false);
  }, [filters]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function begin(entry?: Entry) {
    setEditingId(entry?.id ?? null);
    setDraft(entry ? { type: entry.type, categoryId: entry.category.id, entryDate: entry.entryDate.slice(0, 10), concept: entry.concept, amount: entry.amount, currency: entry.currency, notes: entry.notes ?? "", documentName: entry.documentName ?? "", documentReference: entry.documentReference ?? "" } : emptyDraft);
    setMessage(""); setOpen(true);
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(editingId ? `/api/crm/finance-entries/${editingId}` : "/api/crm/finance-entries", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setOpen(false); setMessage(editingId ? "Movimiento actualizado." : "Movimiento registrado."); await load();
  }
  async function remove(entry: Entry) {
    if (!window.confirm(`¿Eliminar el movimiento "${entry.concept}"? Esta acción no se puede deshacer.`)) return;
    const response = await fetch(`/api/crm/finance-entries/${entry.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    await load();
  }
  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/crm/finance-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(categoryDraft) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setCategoryDraft(emptyCategoryDraft); setMessage("Categoría creada."); await load();
  }
  async function toggleCategory(category: Category) {
    const response = await fetch(`/api/crm/finance-categories/${category.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !category.active }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    await load();
  }

  const categoryOptions = categories.filter((category) => category.type === draft.type);
  return <>
    {administrativeTenant && <div className="admin-context"><span>◎</span><div><small>EMPRESA</small><strong>{administrativeTenant}</strong></div></div>}
    <section className="page-title crm-title"><div><span className="eyebrow">CRM · FINANZAS</span><h1>Finanzas</h1><p>Registra ingresos y gastos administrativos de la empresa, por fuera de liquidaciones y comisiones.</p></div><div className="reconciliation-actions"><button className="secondary" onClick={() => setCategoryOpen(true)}>Categorías financieras</button>{canWrite && <button className="primary" onClick={() => begin()}>＋ Nuevo movimiento</button>}</div></section>
    <nav className="crm-tabs">{nav.filter(([id]) => meta.activeFeatures.includes(id)).map(([id, text]) => <Link className={id === "finance" ? "selected" : ""} key={id} href={`/crm/${id}`}>{text}</Link>)}</nav>
    <section className="reconciliation-kpis finance-kpis"><Kpi label="Ingresos reconocidos" value={money(summary.recognizedIncome)} /><Kpi label="Otros ingresos" value={money(summary.otherIncome)} /><Kpi label="Gastos registrados" value={money(summary.expenses)} /><Kpi label="Ingresos totales" value={money(summary.totalIncome)} /><Kpi label="Resultado base" value={money(summary.baseResult)} /></section>
    <div className="safe-note"><span>i</span><p><strong>El Resultado base todavía no es la Utilidad Neta empresarial.</strong><br />Es Ingresos reconocidos (Liquidaciones) + Otros ingresos − Gastos registrados. Las comisiones internas de promotor y supervisor se integrarán en una fase posterior.</p></div>
    {summary.excludedOtherCurrency.length > 0 && <div className="database-notice"><strong>Movimientos en otra moneda excluidos del total {summary.operatingCurrency}</strong><span>{summary.excludedOtherCurrency.map((row) => `${row.currency}: ${row.count}`).join(", ")}. No se aplica conversión automática sin una tasa real.</span></div>}
    <section className="reconciliation-shortcuts"><button className={!filters.day && filters.period === currentMonth() ? "active" : ""} onClick={() => setFilters({ ...filters, day: "", period: currentMonth() })}>Este mes</button><button className={filters.day === today() ? "active" : ""} onClick={() => setFilters({ ...filters, day: today(), period: "" })}>Hoy</button><button className={!filters.day && filters.period !== currentMonth() ? "active" : ""} onClick={() => setFilters({ ...filters, day: "" })}>Personalizado</button></section>
    <section className="card reconciliation-filters"><label>Buscar<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Concepto, observaciones o referencia" /></label><label>Periodo<input type="month" value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value, day: "" })} /></label><label>Tipo<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Todos</option><option value="INGRESO">Ingreso</option><option value="GASTO">Gasto</option></select></label><label>Categoría<select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}><option value="">Todas</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="secondary" onClick={() => setFilters(defaultFilters())}>Limpiar</button></section>
    {message && <p className="form-error">{message}</p>}
    <section className="card reconciliation-table"><div className="table-scroll"><table className="operational-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th>Monto</th><th>Moneda</th><th>Registrado por</th><th>Acción</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{new Date(entry.entryDate).toLocaleDateString("es-PE")}</td><td><span className={`operational-status ${entry.type.toLowerCase()}`}>{entry.type === "INGRESO" ? "Ingreso" : "Gasto"}</span></td><td>{entry.category.name}</td><td><strong>{entry.concept}</strong>{entry.notes && <small>{entry.notes}</small>}</td><td>{Number(entry.amount).toFixed(2)}</td><td>{entry.currency}</td><td>{entry.registeredBy.name}</td><td>{canWrite && <div className="user-actions"><button className="secondary" onClick={() => begin(entry)}>Editar</button><button className="secondary" onClick={() => void remove(entry)}>Eliminar</button></div>}</td></tr>)}</tbody></table></div>{!loading && !entries.length && <div className="operational-empty"><strong>Sin movimientos registrados</strong><span>Usa “Nuevo movimiento” para registrar el primer ingreso o gasto manual.</span></div>}</section>
    {open && <Modal title={editingId ? "Editar movimiento" : "Nuevo movimiento"} close={() => setOpen(false)}><form className="reconciliation-form" onSubmit={save}>
      <label>Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as FinanceType, categoryId: "" })}><option value="INGRESO">Ingreso</option><option value="GASTO">Gasto</option></select></label>
      <label>Categoría<select required value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Seleccionar</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}{!category.active ? " (inactiva)" : ""}</option>)}</select></label>
      <label>Fecha<input required type="date" value={draft.entryDate} onChange={(event) => setDraft({ ...draft, entryDate: event.target.value })} /></label>
      <label>Monto<input required type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
      <label>Moneda<input required value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} maxLength={3} /></label>
      <label className="wide">Concepto<input required value={draft.concept} onChange={(event) => setDraft({ ...draft, concept: event.target.value })} /></label>
      <label className="wide">Observaciones<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <label>Nombre del documento (opcional)<input value={draft.documentName} onChange={(event) => setDraft({ ...draft, documentName: event.target.value })} /></label>
      <label>Referencia / URL del documento (opcional)<input value={draft.documentReference} onChange={(event) => setDraft({ ...draft, documentReference: event.target.value })} /></label>
      <button className="primary wide">{editingId ? "Guardar cambios" : "Registrar movimiento"}</button>
    </form></Modal>}
    {categoryOpen && <Modal title="Categorías financieras" close={() => setCategoryOpen(false)}><form className="reconciliation-form" onSubmit={createCategory}><label>Tipo<select value={categoryDraft.type} onChange={(event) => setCategoryDraft({ ...categoryDraft, type: event.target.value as FinanceType })}><option value="INGRESO">Ingreso</option><option value="GASTO">Gasto</option></select></label><label>Nombre<input required value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} placeholder="Ej. Alquiler, Publicidad, Comisiones" /></label><button className="primary wide">Crear categoría</button></form>
      <section className="provider-list">{categories.map((category) => <article key={category.id}><div><strong>{category.name}</strong><small>{category.type === "INGRESO" ? "Ingreso" : "Gasto"}</small></div>{canWrite && <button className="secondary" onClick={() => void toggleCategory(category)}>{category.active ? "Desactivar" : "Activar"}</button>}</article>)}{!categories.length && <p className="form-error">Aún no hay categorías. El administrador debe crear las suyas.</p>}</section>
    </Modal>}
  </>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <article><small>{label}</small><strong>{value}</strong></article>; }
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="detail-backdrop"><aside className="detail-panel reconciliation-modal"><header><h2>{title}</h2><button onClick={close}>×</button></header>{children}</aside></div>; }
function money(value: number) { return `S/ ${value.toFixed(2)}`; }
