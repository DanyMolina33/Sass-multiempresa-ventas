"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type SalesSlice = { total: number; aprobadas: number; rechazadas: number; canceladas: number; pendientes: number; tasaAprobacion: number };
type Employee = { id: string; name: string; jobPosition: { name: string }; store: { id: string; name: string } | null; compensationPlan: { name: string; mode: string } } | null;
type PromoterData = { employee: Employee; today: SalesSlice; period: SalesSlice; commissions: { projected: number | null; confirmed: number | null } };
type CustomerMatch = { id: string; name: string; document: string | null; phone: string };
type Meta = { products: Array<{ id: string; name: string }>; commercialPlans: Array<{ id: string; name: string; productId: string }> };

const OPERATIONS = ["PORTABILIDAD", "ALTA_NUEVA", "PORTABILIDAD_POSTPAGO", "ALTA_NUEVA_POSTPAGO", "MIGRACION", "PREPAGO", "RENOVACION", "LINEA_FIJA", "INTERNET_FIJO", "OTRO"];
function money(value: number | null) { return value === null ? "Sin datos" : `S/ ${value.toFixed(2)}`; }

export function PromoterSpaceWorkspace() {
  const [data, setData] = useState<PromoterData | null>(null);
  const [meta, setMeta] = useState<Meta>({ products: [], commercialPlans: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [dataResponse, metaResponse] = await Promise.all([fetch("/api/crm/promoter-space"), fetch("/api/crm/meta")]);
    const [dataResult, metaResult] = await Promise.all([dataResponse.json(), metaResponse.json()]);
    if (dataResponse.ok) setData(dataResult); else setMessage(dataResult.message);
    if (metaResponse.ok) setMeta(metaResult);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  if (loading && !data) return <div className="empty-core">Cargando tu espacio…</div>;
  if (!data) return <div className="operational-empty"><strong>No se pudo cargar tu espacio</strong><span>{message}</span></div>;

  return <>
    <section className="page-title crm-title"><div><span className="eyebrow">ESPACIO DEL PROMOTOR</span><h1>Mi día</h1><p>{data.employee ? `${data.employee.name} · ${data.employee.jobPosition.name}${data.employee.store ? ` · ${data.employee.store.name}` : ""}` : "Tu cuenta todavía no está vinculada a una ficha de personal."}</p></div><button className="primary" onClick={() => setOpen(true)}>＋ Nueva venta</button></section>

    <section className="stats"><Kpi label="Ventas hoy" value={String(data.today.total)} /><Kpi label="Ventas del período" value={String(data.period.total)} /><Kpi label="Aprobadas" value={String(data.period.aprobadas)} /><Kpi label="Pendientes" value={String(data.period.pendientes)} />{data.period.rechazadas > 0 && <Kpi label="Rechazadas" value={String(data.period.rechazadas)} />}</section>

    <section className="exec-section"><div className="section-heading"><div><span className="eyebrow">MIS COMISIONES</span><h2>Comisión del período</h2></div></div>
      <section className="stats"><Kpi label="Comisión proyectada" value={money(data.commissions.projected)} /><Kpi label="Comisión confirmada" value={money(data.commissions.confirmed)} /></section>
    </section>

    {message && <p className="form-error">{message}</p>}

    <section className="grid-main">
      <section className="card"><div className="card-head"><div><h2>Mis ventas</h2><p>Historial completo, filtrable</p></div><Link href="/crm/sales">Ver mis ventas →</Link></div><p style={{ fontSize: 10, color: "#8b90a1" }}>Se muestran únicamente tus propias ventas.</p></section>
      <section className="card"><div className="card-head"><div><h2>Mis clientes</h2><p>Clientes relacionados con tus ventas</p></div><Link href="/crm/customers">Ver mis clientes →</Link></div><p style={{ fontSize: 10, color: "#8b90a1" }}>Se muestran únicamente los clientes a tu cargo.</p></section>
    </section>

    {open && <NewSaleModal meta={meta} storeName={data.employee?.store?.name ?? null} close={() => setOpen(false)} onCreated={() => { setOpen(false); void load(); }} />}
  </>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <article><span className="stat-icon purple">◎</span><div><small>{label.toUpperCase()}</small><strong>{value}</strong></div></article>; }

function NewSaleModal({ meta, storeName, close, onCreated }: { meta: Meta; storeName: string | null; close: () => void; onCreated: () => void }) {
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
