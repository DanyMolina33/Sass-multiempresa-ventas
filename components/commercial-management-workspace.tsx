"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Summary = {
  sales: { total: number; aprobadas: number; pendientes: number; tasaAprobacion: number };
  promoters: { real: Array<{ agentId: string; name: string; sales: number; approved: number; approvalRate: number }>; historical: Array<{ historicalAdvisorName: string; sales: number; approved: number; approvalRate: number }> };
  stores: { stores: Array<{ storeId: string; name: string; sales: number; approved: number; promoters: number; participation: number }>; unassigned: number } | null;
};
type StoreOption = { id: string; name: string; code: string | null; active: boolean; _count: { employees: number } };
type Section = "resumen" | "tiendas";

const nav = [["leads", "Leads"], ["customers", "Clientes"], ["sales", "Ventas"], ["follow-ups", "Seguimientos"], ["products", "Productos"], ["commercial-plans", "Planes comerciales"], ["commissions", "Comisiones"], ["reconciliation", "Liquidaciones"], ["finance", "Finanzas"], ["payroll", "Pago de Personal"], ["commercial-management", "Gestión Comercial"]];
const sectionTabs: Array<[Section, string]> = [["resumen", "Resumen"], ["tiendas", "Tiendas / Sucursales"]];

export function CommercialManagementWorkspace({ administrativeTenant }: { administrativeTenant?: string | null }) {
  const [section, setSection] = useState<Section>("resumen");
  const [activeFeatures, setActiveFeatures] = useState<string[]>([]);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeDraft, setStoreDraft] = useState({ name: "", code: "" });
  const [newStoreOpen, setNewStoreOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreOption | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", code: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [crmMetaResponse, summaryResponse, storesResponse] = await Promise.all([fetch("/api/crm/meta"), fetch("/api/crm/executive-dashboard?preset=this_month"), fetch("/api/crm/personnel/stores")]);
    const [crmMeta, summary, storesResult] = await Promise.all([crmMetaResponse.json(), summaryResponse.json(), storesResponse.json()]);
    if (crmMetaResponse.ok) { setActiveFeatures(crmMeta.activeFeatures ?? []); setCanWrite(["SUPER_ADMIN", "COMPANY_ADMIN"].includes(crmMeta.role)); }
    if (summaryResponse.ok) { setData(summary); setMessage(""); } else setMessage(summary.message);
    if (storesResponse.ok) setStores(storesResult.items);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  // "Tiendas / Sucursales" is a separate product/contract capability from "Gestión Comercial" itself (controlled
  // in Panel Maestro). If it's off, the administration tab must not appear even though Gestión Comercial is on.
  const storesFeatureActive = activeFeatures.includes("commercial-stores");
  const effectiveSection: Section = section === "tiendas" && !storesFeatureActive ? "resumen" : section;
  const visibleSectionTabs = sectionTabs.filter(([id]) => id !== "tiendas" || storesFeatureActive);

  async function createStore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/crm/personnel/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: storeDraft.name, code: storeDraft.code || undefined }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setStoreDraft({ name: "", code: "" }); setNewStoreOpen(false); setMessage("Tienda creada."); await load();
  }
  async function toggleStore(item: StoreOption) { const response = await fetch(`/api/crm/personnel/stores/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !item.active }) }); const result = await response.json(); if (!response.ok) return setMessage(result.message); await load(); }
  function beginEdit(item: StoreOption) { setEditingStore(item); setEditDraft({ name: item.name, code: item.code ?? "" }); }
  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStore) return;
    const response = await fetch(`/api/crm/personnel/stores/${editingStore.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editDraft.name, code: editDraft.code || null }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setEditingStore(null); setMessage("Tienda actualizada."); await load();
  }

  const activeStores = stores.filter((s) => s.active).length;
  const personnelInStores = stores.reduce((sum, s) => sum + s._count.employees, 0);

  return <>
    {administrativeTenant && <div className="admin-context"><span>◎</span><div><small>EMPRESA</small><strong>{administrativeTenant}</strong></div></div>}
    <section className="page-title crm-title"><div><span className="eyebrow">CRM · GESTIÓN COMERCIAL</span><h1>Gestión Comercial</h1><p>Espacio central de operación comercial: tiendas, promotores, metas y rendimiento del negocio.</p></div><Link className="secondary" href="/empresa">Ver Dashboard Ejecutivo →</Link></section>
    <nav className="crm-tabs">{nav.filter(([id]) => activeFeatures.includes(id)).map(([id, text]) => <Link className={id === "commercial-management" ? "selected" : ""} key={id} href={`/crm/${id}`}>{text}</Link>)}</nav>
    <nav className="crm-tabs">{visibleSectionTabs.map(([id, text]) => <button key={id} className={effectiveSection === id ? "selected" : ""} onClick={() => setSection(id)}>{text}</button>)}</nav>
    {message && <p className="form-error">{message}</p>}

    {effectiveSection === "resumen" && (loading && !data ? <div className="empty-core">Consultando datos reales…</div> : <>
      <section className="stats">
        <article><span className="stat-icon purple">◎</span><div><small>TIENDAS ACTIVAS</small><strong>{activeStores}</strong></div></article>
        <article><span className="stat-icon blue">◈</span><div><small>PERSONAL ASOCIADO A TIENDAS</small><strong>{personnelInStores}</strong></div></article>
        <article><span className="stat-icon green">✓</span><div><small>VENTAS DEL MES</small><strong>{data ? data.sales.total : "Sin datos"}</strong></div></article>
        <article><span className="stat-icon amber">!</span><div><small>TASA DE APROBACIÓN</small><strong>{data ? `${data.sales.tasaAprobacion}%` : "Sin datos"}</strong></div></article>
      </section>

      {data && <div className="grid-main">
        <section className="card"><div className="card-head"><div><h2>Promotores</h2><p>Este mes</p></div></div>
          {data.promoters.real.length > 0 && <section className="provider-list">{data.promoters.real.map((p) => <article key={p.agentId}><div><strong>{p.name}</strong><small>{p.sales} ventas · {p.approved} aprobadas · {p.approvalRate}%</small></div></article>)}</section>}
          {data.promoters.historical.length > 0 && <section className="provider-list">{data.promoters.historical.map((p) => <article key={p.historicalAdvisorName}><div><strong>{p.historicalAdvisorName}</strong><small>{p.sales} ventas · {p.approved} aprobadas · {p.approvalRate}% (histórico)</small></div></article>)}</section>}
          {!data.promoters.real.length && !data.promoters.historical.length && <div className="operational-empty"><span>Sin ventas con promotor identificable este mes.</span></div>}
        </section>
        <section className="card"><div className="card-head"><div><h2>Tiendas</h2><p>Rendimiento este mes</p></div></div>
          {data.stores ? <section className="provider-list">{data.stores.stores.map((s) => <article key={s.storeId}><div><strong>{s.name}</strong><small>{s.sales} ventas · {s.promoters} promotor(es) · {s.participation}%</small></div></article>)}</section> : <div className="operational-empty"><span>Esta empresa todavía no asocia ventas a tiendas/sucursales.</span></div>}
        </section>
      </div>}

      <div className="safe-note"><span>i</span><p><strong>Próximas secciones</strong><br />Equipo/Promotores, Metas, Rendimiento y Proyecciones se incorporarán como pestañas adicionales de este mismo módulo en próximas fases.</p></div>
    </>)}

    {effectiveSection === "tiendas" && <section className="card">
      <div className="card-head"><div><h2>Tiendas / Sucursales</h2><p>Catálogo real de tiendas de la empresa</p></div>{canWrite && <button className="primary" onClick={() => setNewStoreOpen(true)}>＋ Nueva tienda</button>}</div>
      <section className="provider-list">{stores.map((s) => <article key={s.id}>
        <div><strong>{s.name}</strong><small>{s.code ? `${s.code} · ` : ""}{s._count.employees} trabajador(es) · <span className={`crm-state${s.active ? "" : " inactive"}`}>{s.active ? "Activa" : "Inactiva"}</span></small></div>
        {canWrite && <div className="reconciliation-actions"><button className="secondary" onClick={() => beginEdit(s)}>Editar</button><button className="secondary" onClick={() => void toggleStore(s)}>{s.active ? "Desactivar" : "Activar"}</button></div>}
      </article>)}{!stores.length && <div className="operational-empty"><span>Sin tiendas registradas todavía.</span></div>}</section>
    </section>}

    {newStoreOpen && <div className="detail-backdrop"><aside className="detail-panel reconciliation-modal"><header><h2>Nueva tienda</h2><button onClick={() => setNewStoreOpen(false)}>×</button></header>
      <form className="reconciliation-form" onSubmit={createStore}><label>Nombre<input required value={storeDraft.name} onChange={(e) => setStoreDraft({ ...storeDraft, name: e.target.value })} placeholder="Ej. Tienda Miraflores" /></label><label>Código (opcional)<input value={storeDraft.code} onChange={(e) => setStoreDraft({ ...storeDraft, code: e.target.value.toUpperCase() })} /></label><button className="primary wide">Crear tienda</button></form>
    </aside></div>}

    {editingStore && <div className="detail-backdrop"><aside className="detail-panel reconciliation-modal"><header><h2>Editar tienda</h2><button onClick={() => setEditingStore(null)}>×</button></header>
      <form className="reconciliation-form" onSubmit={saveEdit}>
        <label>Nombre<input required value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></label>
        <label>Código (opcional)<input value={editDraft.code} onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value.toUpperCase() })} /></label>
        <button className="primary wide">Guardar cambios</button>
      </form>
      <div className="reconciliation-actions"><button className="secondary" onClick={() => void toggleStore(editingStore).then(() => setEditingStore(null))}>{editingStore.active ? "Desactivar tienda" : "Activar tienda"}</button></div>
    </aside></div>}
  </>;
}
