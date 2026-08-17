"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Preset = "today" | "this_month" | "last_month" | "last_30_days" | "custom";
type Mode = "real" | "proyeccion";

type Sales = { total: number; aprobadas: number; rechazadas: number; canceladas: number; pendientes: number; tasaAprobacion: number };
type Customers = { total: number; nuevosEnPeriodo: number | null };
type Liquidaciones = { reconocidas: number; conformes: number; conDiferencia: number; noLiquidadas: number; pendientes: number; enRevision: number; ingresoEsperado: number; ingresoReconocido: number; diferenciaTotal: number };
type FinanceReal = { recognizedIncome: number; otherIncome: number; operatingExpenses: number; personnelCostReal: number; totalIncome: number; totalCosts: number; economicResult: number; pendingSettlement: number };
type FinanceProjection = { expectedIncome: number; projectedCommissions: number; projectedPersonnelCost: number; economicResultProjected: number };
type Personnel = { activeEmployees: number; baseSalaries: number; commissions: number; bonusesAndMobility: number; otherIncome: number; employerContributions: number; netToPay: number; totalCompanyCost: number };
type SeriesPoint = { bucket: string; sales: number; expected: number; recognized: number };
type ProductRow = { productId: string; name: string; count: number; percentage: number };
type PlanRow = { commercialPlanId: string; name: string; count: number; expectedIncome: number; recognizedIncome: number };
type OperationRow = { transactionType: string; count: number; percentage: number };
type RealPromoter = { agentId: string; name: string; sales: number; approved: number; approvalRate: number; commission: number | null };
type HistoricalPromoter = { historicalAdvisorName: string; sales: number; approved: number; approvalRate: number };
type StoreRow = { storeId: string; name: string; sales: number; approved: number; promoters: number; participation: number };
type Alerts = { conDiferencia: number; noLiquidadas: number; sinRegla: number; enRevision: number; hasAlerts: boolean };
type Today = { ventasHoy: number; aprobadasHoy: number; pendientesHoy: number; ingresoEsperadoHoy: number; topPromotorHoy: RealPromoter | null; topTiendaHoy: StoreRow | null };

type ExecutiveData = {
  range: { from: string; to: string };
  sales: Sales; customers: Customers; liquidaciones: Liquidaciones;
  finance: { real: FinanceReal; projection: FinanceProjection };
  personnel: Personnel;
  series: { bucketUnit: "day" | "month"; points: SeriesPoint[] };
  products: ProductRow[]; plans: PlanRow[]; operations: OperationRow[];
  promoters: { real: RealPromoter[]; historical: HistoricalPromoter[] };
  stores: { stores: StoreRow[]; unassigned: number } | null;
  alerts: Alerts; today: Today;
};

const PRESETS: Array<[Preset, string]> = [["today", "Hoy"], ["this_month", "Este mes"], ["last_month", "Mes anterior"], ["last_30_days", "Últimos 30 días"], ["custom", "Personalizado"]];
const OPERATION_LABELS: Record<string, string> = { PORTABILIDAD: "Portabilidad", ALTA_NUEVA: "Alta nueva", PORTABILIDAD_POSTPAGO: "Portabilidad postpago", ALTA_NUEVA_POSTPAGO: "Alta nueva postpago", MIGRACION: "Migración", PREPAGO: "Prepago", RENOVACION: "Renovación", LINEA_FIJA: "Línea fija", INTERNET_FIJO: "Internet fijo", OTRO: "Otro" };
function money(value: number) { return `S/ ${value.toFixed(2)}`; }
function resultClass(value: number) { return value >= 0 ? "exec-result-positive" : "exec-result-negative"; }

export function ExecutiveDashboard({ tenantName }: { tenantName: string }) {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<Mode>("real");
  const [storeId, setStoreId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [storeOptions, setStoreOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [promoterOptions, setPromoterOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const query = new URLSearchParams({ preset, ...(preset === "custom" ? { from: customFrom, to: customTo } : {}), ...(storeId ? { storeId } : {}), ...(agentId ? { agentId } : {}) });
    const response = await fetch(`/api/crm/executive-dashboard?${query}`);
    const result = await response.json();
    if (response.ok) setData(result); else setError(result.message || "No se pudo cargar el Dashboard Ejecutivo.");
    setLoading(false);
  }, [preset, customFrom, customTo, storeId, agentId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    fetch("/api/crm/personnel/stores").then((r) => r.ok ? r.json() : { items: [] }).then((r) => setStoreOptions(r.items ?? [])).catch(() => {});
    fetch("/api/crm/personnel/meta").then((r) => r.ok ? r.json() : { users: [] }).then((r) => setPromoterOptions((r.users ?? []).filter((u: { role: { code: string } }) => u.role.code === "AGENT"))).catch(() => {});
  }, []);

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <div className="operational-empty"><strong>No se pudo cargar el Dashboard Ejecutivo</strong><span>{error}</span><button className="secondary" onClick={() => void load()}>Reintentar</button></div>;
  if (!data) return null;

  const economicResult = mode === "real" ? data.finance.real.economicResult : data.finance.projection.economicResultProjected;
  const personnelCost = mode === "real" ? data.finance.real.personnelCostReal : data.finance.projection.projectedPersonnelCost;

  return <>
    <section className="page-title"><div><span className="eyebrow">DASHBOARD EJECUTIVO</span><h1>{tenantName}</h1><p>Resumen comercial y económico consolidado, con datos reales del CRM.</p></div></section>

    <div className="exec-filters">
      <section className="reconciliation-shortcuts">{PRESETS.map(([value, label]) => <button key={value} className={preset === value ? "active" : ""} onClick={() => setPreset(value)}>{label}</button>)}</section>
      {preset === "custom" && <><label>Desde<input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label><label>Hasta<input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label></>}
      <label>Tienda<select value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">Todas las tiendas</option>{storeOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Promotor<select value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="">Toda la empresa</option>{promoterOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <section className="reconciliation-shortcuts"><button className={mode === "real" ? "active" : ""} onClick={() => setMode("real")}>Real</button><button className={mode === "proyeccion" ? "active" : ""} onClick={() => setMode("proyeccion")}>Proyección</button></section>
    </div>

    <section className="stats exec-kpis"><Kpi label="Ventas hoy" value={String(data.today.ventasHoy)} tone="purple" /><Kpi label="Ventas del período" value={String(data.sales.total)} tone="blue" /><Kpi label="Clientes nuevos del período" value={String(data.customers.nuevosEnPeriodo ?? 0)} sub={`${data.customers.total} clientes en total`} tone="green" /><Kpi label="Ventas aprobadas" value={String(data.sales.aprobadas)} tone="green" /><Kpi label="Tasa de aprobación" value={`${data.sales.tasaAprobacion}%`} tone="amber" /></section>

    <section className="stats exec-kpis"><Kpi label="Ingreso esperado" value={money(data.finance.projection.expectedIncome)} tone="purple" /><Kpi label="Ingreso reconocido" value={money(data.finance.real.recognizedIncome)} tone="blue" /><Kpi label="Pendiente de liquidar" value={money(data.finance.real.pendingSettlement)} tone="amber" /><Kpi label="Diferencia de liquidación" value={money(data.liquidaciones.diferenciaTotal)} tone={data.liquidaciones.diferenciaTotal >= 0 ? "green" : "amber"} /><Kpi label="Otros ingresos" value={money(data.finance.real.otherIncome)} tone="green" /></section>

    <section className="stats exec-kpis"><Kpi label="Gastos operativos" value={money(data.finance.real.operatingExpenses)} tone="amber" /><Kpi label={`Costo de personal (${mode === "real" ? "cerrado" : "proyectado"})`} value={money(personnelCost)} tone="amber" /><Kpi label="Comisiones de personal (informativo)" value={money(data.personnel.commissions)} tone="blue" /><Kpi label="Neto a pagar personal (informativo)" value={money(data.personnel.netToPay)} tone="blue" /><Kpi label="Resultado económico" value={money(economicResult)} tone={economicResult >= 0 ? "green" : "amber"} big /></section>

    <section className="exec-section"><div className="section-heading"><div><span className="eyebrow">RESUMEN FINANCIERO</span><h2>De ingresos reconocidos a resultado económico ({mode === "real" ? "real" : "proyección"})</h2></div></div>
      <div className="exec-cascade">
        <div className="exec-cascade-card"><small>{mode === "real" ? "Ingreso reconocido" : "Ingreso esperado"}</small><strong>{money(mode === "real" ? data.finance.real.recognizedIncome : data.finance.projection.expectedIncome)}</strong></div>
        <div className="exec-cascade-op">+</div>
        <div className="exec-cascade-card"><small>Otros ingresos</small><strong>{money(data.finance.real.otherIncome)}</strong></div>
        <div className="exec-cascade-op">=</div>
        <div className="exec-cascade-card"><small>Ingresos totales</small><strong>{money(mode === "real" ? data.finance.real.totalIncome : data.finance.projection.expectedIncome + data.finance.real.otherIncome)}</strong></div>
        <div className="exec-cascade-op">−</div>
        <div className="exec-cascade-card"><small>Gastos operativos</small><strong>{money(data.finance.real.operatingExpenses)}</strong></div>
        <div className="exec-cascade-op">−</div>
        <div className="exec-cascade-card"><small>Costo de personal</small><strong>{money(personnelCost)}</strong></div>
        <div className="exec-cascade-op">=</div>
        <div className="exec-cascade-card total"><small>Resultado económico</small><strong className={resultClass(economicResult)}>{money(economicResult)}</strong></div>
      </div>
    </section>

    <EvolutionCharts series={data.series} />

    <div className="grid-main">
      <section className="card"><div className="card-head"><div><h2>Ventas por producto</h2><p>Distribución del período seleccionado</p></div></div>{data.products.length ? <div className="dist-bars">{data.products.map((p) => <div key={p.productId}><small title={p.name}>{p.name}</small><div className="bar-track"><i style={{ width: `${p.percentage}%` }} /></div><strong>{p.count} · {p.percentage}%</strong></div>)}</div> : <EmptyBlock text="Sin ventas en el período." />}</section>
      <section className="card"><div className="card-head"><div><h2>Ventas por operación</h2><p>Portabilidad, alta nueva, migración, renovación…</p></div></div>{data.operations.length ? <div className="dist-bars">{data.operations.map((o) => <div key={o.transactionType}><small>{OPERATION_LABELS[o.transactionType] ?? o.transactionType}</small><div className="bar-track"><i style={{ width: `${o.percentage}%` }} /></div><strong>{o.count} · {o.percentage}%</strong></div>)}</div> : <EmptyBlock text="Sin ventas en el período." />}</section>
    </div>

    <section className="exec-section"><div className="section-heading"><div><span className="eyebrow">PLANES COMERCIALES</span><h2>Top planes por ventas</h2></div></div>
      {data.plans.length ? <section className="card plan-rank">{data.plans.map((plan, index) => <div key={plan.commercialPlanId}><span className="rank-index">{index + 1}</span><div><strong>{plan.name}</strong></div><div><small>VENTAS</small><strong>{plan.count}</strong></div><div><small>ESPERADO</small><strong>{money(plan.expectedIncome)}</strong></div><div><small>RECONOCIDO</small><strong>{money(plan.recognizedIncome)}</strong></div></div>)}</section> : <div className="card"><EmptyBlock text="Sin ventas con plan comercial en el período." /></div>}
    </section>

    <section className="exec-section"><div className="section-heading"><div><span className="eyebrow">LIQUIDACIONES</span><h2>Estado de reconocimiento</h2></div><Link href="/crm/reconciliation">Ver Liquidaciones →</Link></div>
      <section className="reconciliation-kpis"><Kpi label="Reconocidas" value={String(data.liquidaciones.reconocidas)} /><Kpi label="Conformes" value={String(data.liquidaciones.conformes)} /><Kpi label="Con diferencias" value={String(data.liquidaciones.conDiferencia)} /><Kpi label="No liquidadas" value={String(data.liquidaciones.noLiquidadas)} /><Kpi label="Pendientes" value={String(data.liquidaciones.pendientes)} /></section>
    </section>

    <section className="exec-section"><div className="section-heading"><div><span className="eyebrow">ALERTAS</span><h2>Alertas económicas</h2></div></div>
      {data.alerts.hasAlerts ? <section className="card alert-card"><div className="card-head"><div><h2>Casos que requieren atención</h2><p>Período seleccionado</p></div></div>
        {data.alerts.noLiquidadas > 0 && <article><span>!</span><div><h3>{data.alerts.noLiquidadas} ventas no liquidadas</h3><p>Existen en el CRM pero no aparecen en la liquidación correspondiente.</p><Link href="/crm/reconciliation">Ver Liquidaciones →</Link></div></article>}
        {data.alerts.conDiferencia > 0 && <article><span>!</span><div><h3>{data.alerts.conDiferencia} ventas con diferencia</h3><p>El monto reconocido no coincide con el esperado.</p><Link href="/crm/reconciliation">Ver Liquidaciones →</Link></div></article>}
        {data.alerts.sinRegla > 0 && <article><span>!</span><div><h3>{data.alerts.sinRegla} ventas sin regla económica</h3><p>No se puede calcular su ingreso esperado.</p><Link href="/crm/commissions">Ver Comisiones →</Link></div></article>}
        {data.alerts.enRevision > 0 && <article><span>!</span><div><h3>{data.alerts.enRevision} liquidaciones en revisión</h3><p>Matching ambiguo o pendiente de validación manual.</p><Link href="/crm/reconciliation">Ver Liquidaciones →</Link></div></article>}
      </section> : <div className="positive-notice"><strong>Sin alertas críticas en el período.</strong></div>}
    </section>

    <div className="grid-main">
      <section className="card"><div className="card-head"><div><h2>Top promotores</h2><p>Solo promotores identificables correctamente</p></div></div>
        {data.promoters.real.length > 0 && <section className="provider-list">{data.promoters.real.map((p) => <article key={p.agentId}><div><strong>{p.name}</strong><small>{p.sales} ventas · {p.approved} aprobadas · {p.approvalRate}% aprobación{p.commission !== null ? ` · ${money(p.commission)} comisión` : ""}</small></div></article>)}</section>}
        {data.promoters.historical.length > 0 && <><p style={{ fontSize: 8, color: "#8b90a1", margin: "10px 0 4px" }}>Asesores históricos (dato importado, sin usuario real vinculado)</p><section className="provider-list">{data.promoters.historical.map((p) => <article key={p.historicalAdvisorName}><div><strong>{p.historicalAdvisorName}</strong><small>{p.sales} ventas · {p.approved} aprobadas · {p.approvalRate}% aprobación</small></div></article>)}</section></>}
        {!data.promoters.real.length && !data.promoters.historical.length && <EmptyBlock text="Sin ventas con promotor identificable en el período." />}
      </section>
      <section className="card"><div className="card-head"><div><h2>Ventas por tienda</h2><p>Solo si existen tiendas con datos reales</p></div></div>
        {data.stores ? <section className="provider-list">{data.stores.stores.map((s) => <article key={s.storeId}><div><strong>{s.name}</strong><small>{s.sales} ventas · {s.approved} aprobadas · {s.promoters} promotor(es) · {s.participation}% del total</small></div></article>)}{data.stores.unassigned > 0 && <article><div><strong>Sin tienda asignada</strong><small>{data.stores.unassigned} ventas sin sucursal registrada</small></div></article>}</section> : <EmptyBlock text="Esta empresa todavía no asocia ventas a tiendas/sucursales." />}
      </section>
    </div>

    <section className="exec-section"><div className="section-heading"><div><span className="eyebrow">HOY</span><h2>Actividad de hoy</h2></div></div>
      <section className="stats"><Kpi label="Ventas hoy" value={String(data.today.ventasHoy)} /><Kpi label="Aprobadas hoy" value={String(data.today.aprobadasHoy)} /><Kpi label="Pendientes hoy" value={String(data.today.pendientesHoy)} /><Kpi label="Ingreso esperado hoy" value={money(data.today.ingresoEsperadoHoy)} /></section>
      <p style={{ fontSize: 9, color: "#8b90a1", marginTop: 8 }}>{data.today.topPromotorHoy ? `Promotor con más ventas hoy: ${data.today.topPromotorHoy.name} (${data.today.topPromotorHoy.sales})` : "Sin ventas de promotores identificables hoy."} {data.today.topTiendaHoy ? ` · Tienda con más ventas hoy: ${data.today.topTiendaHoy.name} (${data.today.topTiendaHoy.sales})` : ""}</p>
    </section>

    <section className="exec-section"><div className="section-heading"><div><span className="eyebrow">PERSONAL</span><h2>Costo de personal del período</h2></div></div>
      <section className="stats exec-kpis"><Kpi label="Trabajadores activos" value={String(data.personnel.activeEmployees)} /><Kpi label="Sueldos base" value={money(data.personnel.baseSalaries)} /><Kpi label="Comisiones" value={money(data.personnel.commissions)} /><Kpi label="Bonos y movilidad" value={money(data.personnel.bonusesAndMobility)} /><Kpi label="Neto a pagar" value={money(data.personnel.netToPay)} /></section>
      <p style={{ fontSize: 8, color: "#8b90a1", marginTop: 8 }}>Costo total empresa: <strong>{money(data.personnel.totalCompanyCost)}</strong> — esta es la única cifra que participa en el Resultado Económico; los componentes de arriba son informativos y no se restan de nuevo.</p>
    </section>
  </>;
}

function DashboardSkeleton() {
  return <><section className="page-title"><div><span className="eyebrow">DASHBOARD EJECUTIVO</span><h1>Cargando…</h1></div></section><section className="stats exec-kpis">{Array.from({ length: 5 }).map((_, i) => <article key={i}><div><small>—</small><strong>···</strong></div></article>)}</section></>;
}
function EmptyBlock({ text }: { text: string }) { return <div className="operational-empty"><span>◇</span><span>{text}</span></div>; }
function Kpi({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: "purple" | "blue" | "green" | "amber"; big?: boolean }) {
  return <article><span className={`stat-icon ${tone ?? "purple"}`}>{tone === "green" ? "✓" : tone === "amber" ? "!" : "◎"}</span><div><small>{label.toUpperCase()}</small><strong style={big ? { fontSize: 20 } : undefined}>{value}</strong>{sub && <p>{sub}</p>}</div></article>;
}

function EvolutionCharts({ series }: { series: { bucketUnit: "day" | "month"; points: SeriesPoint[] } }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const points = series.points;
  const width = 640, height = 160, padding = 24;
  const maxMoney = useMemo(() => Math.max(1, ...points.map((p) => Math.max(p.expected, p.recognized))), [points]);
  const maxSales = useMemo(() => Math.max(1, ...points.map((p) => p.sales)), [points]);
  const x = (i: number) => points.length > 1 ? padding + (i * (width - padding * 2)) / (points.length - 1) : width / 2;
  const yMoney = (v: number) => height - padding - (v / maxMoney) * (height - padding * 2);
  const line = (values: number[]) => values.map((v, i) => `${x(i)},${yMoney(v)}`).join(" ");
  const labelFor = (bucket: string) => series.bucketUnit === "day" ? new Date(bucket).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : new Date(bucket).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });

  return <section className="exec-section"><div className="section-heading"><div><span className="eyebrow">EVOLUCIÓN</span><h2>Ventas, ingreso esperado e ingreso reconocido</h2></div></div>
    {!points.length ? <div className="exec-chart"><div className="exec-chart-empty">Sin ventas en el período seleccionado.</div></div> : <div className="grid-main">
      <div className="exec-chart">
        <div className="exec-chart-legend"><span><i style={{ background: "var(--purple)" }} />Ventas (cantidad)</span></div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>{points.map((p) => <div key={p.bucket} title={`${labelFor(p.bucket)}: ${p.sales} ventas`} style={{ flex: 1, height: `${Math.max(4, (p.sales / maxSales) * 100)}%`, background: "var(--purple)", borderRadius: 3 }} />)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#9296a7", marginTop: 6 }}><span>{labelFor(points[0].bucket)}</span><span>{labelFor(points[points.length - 1].bucket)}</span></div>
      </div>
      <div className="exec-chart">
        <div className="exec-chart-legend"><span><i style={{ background: "#eb6834" }} />Ingreso esperado</span><span><i style={{ background: "#2a78d6" }} />Ingreso reconocido</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} onMouseLeave={() => setHoverIndex(null)} onMouseMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const relX = ((e.clientX - rect.left) / rect.width) * width; const idx = Math.round(((relX - padding) / (width - padding * 2)) * (points.length - 1)); setHoverIndex(Math.min(points.length - 1, Math.max(0, idx))); }}>
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e1e0d9" strokeWidth={1} />
          <polyline points={line(points.map((p) => p.expected))} fill="none" stroke="#eb6834" strokeWidth={2} />
          <polyline points={line(points.map((p) => p.recognized))} fill="none" stroke="#2a78d6" strokeWidth={2} />
          {hoverIndex !== null && <line x1={x(hoverIndex)} y1={padding} x2={x(hoverIndex)} y2={height - padding} stroke="#c3c2b7" strokeWidth={1} strokeDasharray="3,3" />}
          {points.map((p, i) => <circle key={`e${i}`} cx={x(i)} cy={yMoney(p.expected)} r={hoverIndex === i ? 4 : 2.5} fill="#eb6834" />)}
          {points.map((p, i) => <circle key={`r${i}`} cx={x(i)} cy={yMoney(p.recognized)} r={hoverIndex === i ? 4 : 2.5} fill="#2a78d6" />)}
        </svg>
        {hoverIndex !== null && <p style={{ fontSize: 8, color: "#686d80", marginTop: 4 }}>{labelFor(points[hoverIndex].bucket)} · Esperado {money(points[hoverIndex].expected)} · Reconocido {money(points[hoverIndex].recognized)}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#9296a7", marginTop: 2 }}><span>{labelFor(points[0].bucket)}</span><span>{labelFor(points[points.length - 1].bucket)}</span></div>
      </div>
    </div>}
  </section>;
}
