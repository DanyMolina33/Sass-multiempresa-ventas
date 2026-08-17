"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Mode = "FIJO" | "COMISIONISTA" | "MIXTO";
type EmploymentType = "EN_PLANILLA" | "FUERA_PLANILLA";
type Role = "INCOME" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION";
type CalcType = "FIXED" | "PERCENTAGE";
type CommissionType = "FIXED_PER_SALE" | "PERCENTAGE" | "TIERED_BY_SALE_COUNT";
type Eligibility = "SALE_APPROVED" | "SALE_RECOGNIZED";

type JobPosition = { id: string; name: string; active: boolean };
type PensionRate = { id: string; regime: "NINGUNO" | "ONP" | "AFP"; name: string; contributionPercentage: string | null; insurancePercentage: string | null; commissionPercentage: string | null; effectiveFrom: string; effectiveTo: string | null; active: boolean };
type Tier = { id?: string; minSales: number; maxSales: number | null; tierCalculationType: "FIXED_PER_SALE" | "PERCENTAGE"; fixedAmountPerSale: string | null; percentageValue: string | null; percentageBase: string | null };
type CommissionRule = { calculationType: CommissionType; eligibility: Eligibility; fixedAmountPerSale: string | null; percentageValue: string | null; percentageBase: string | null; active: boolean; tiers: Tier[] } | null;
type Component = { id?: string; role: Role; category: string; name: string; calculationType: CalcType; amount: string | null; percentageValue: string | null; percentageBase: string | null; active: boolean };
type Plan = { id: string; name: string; code: string; mode: Mode; baseSalary: string | null; active: boolean; commissionRule: CommissionRule; components: Component[]; _count: { employees: number } };
type UserOption = { id: string; name: string; email: string; role: { code: string }; employee: { id: string } | null };
type StoreOption = { id: string; name: string; code: string | null; active: boolean };
type Meta = { jobPositions: JobPosition[]; compensationPlans: Array<{ id: string; name: string; mode: Mode }>; pensionRegimeRates: PensionRate[]; users: UserOption[]; stores: StoreOption[]; role: string };
type Employee = { id: string; name: string; document: string | null; status: "ACTIVE" | "INACTIVE"; hireDate: string; terminationDate: string | null; employmentType: EmploymentType; jobPosition: { id: string; name: string }; compensationPlan: { id: string; name: string; mode: Mode }; user: { id: string; name: string; email: string } | null; pensionRegimeRate: PensionRate | null; store?: { id: string; name: string } | null };
type Period = { id: string; code: string; periodStart: string; periodEnd: string; status: "OPEN" | "REVIEWED" | "CLOSED" | "PAID" };
type Entry = { id: string; employeeId: string; eligibleSalesCount: number | null; baseSalary: string | null; commissionAmount: string | null; bonusAmount: string | null; mobilityAmount: string | null; otherIncomeAmount: string | null; grossAmount: string; pensionDeduction: string | null; otherDeductions: string | null; totalWorkerDeductions: string; netAmount: string; employerContributionsAmount: string; totalCompanyCost: string; calculationSnapshot: unknown; employee: { name: string; jobPosition: { name: string }; employmentType: EmploymentType } };
type Summary = { activePersonnel: number; baseSalaries: string; commissions: string; bonusesAndMobility: string; employerContributions: string; netToPay: string; projectedCost: string };

const nav = [["leads", "Leads"], ["customers", "Clientes"], ["sales", "Ventas"], ["follow-ups", "Seguimientos"], ["products", "Productos"], ["commercial-plans", "Planes comerciales"], ["commissions", "Comisiones"], ["reconciliation", "Liquidaciones"], ["finance", "Finanzas"], ["payroll", "Pago de Personal"], ["commercial-management", "Gestión Comercial"], ["promoter-space", "Espacio Promotor"]];
const BASES_BEFORE_GROSS = [["SALE_AMOUNT", "Monto de venta"], ["RECOGNIZED_AMOUNT", "Monto reconocido (Liquidaciones)"], ["EXPECTED_COMPANY_INCOME", "Ingreso esperado"], ["BASE_SALARY", "Sueldo base"]];
const BASES_ALL = [...BASES_BEFORE_GROSS, ["GROSS_AMOUNT", "Remuneración bruta"]];
const emptyFilters = { jobPositionId: "", employmentType: "", search: "" };
function money(value: string | null | undefined) { return value === null || value === undefined ? "—" : `S/ ${Number(value).toFixed(2)}`; }
function statusLabel(status: Period["status"]) { return status === "OPEN" ? "Abierto" : status === "REVIEWED" ? "Revisado" : status === "CLOSED" ? "Cerrado" : "Pagado"; }

const emptyPlanDraft = { name: "", code: "", mode: "FIJO" as Mode, baseSalary: "", effectiveFrom: new Date().toISOString().slice(0, 10), active: true, hasCommission: false, commissionRule: { calculationType: "FIXED_PER_SALE" as CommissionType, eligibility: "SALE_APPROVED" as Eligibility, fixedAmountPerSale: "", percentageValue: "", percentageBase: "SALE_AMOUNT", active: true, tiers: [] as Tier[] }, components: [] as Component[] };
const emptyEmployeeDraft = { name: "", document: "", jobPositionId: "", hireDate: new Date().toISOString().slice(0, 10), employmentType: "EN_PLANILLA" as EmploymentType, mode: "FIJO" as Mode, compensationPlanId: "", pensionRegimeRateId: "", userId: "", storeId: "" };
const emptyPensionDraft = { regime: "ONP" as PensionRate["regime"], name: "", contributionPercentage: "", insurancePercentage: "", commissionPercentage: "", effectiveFrom: new Date().toISOString().slice(0, 10), sourceReference: "" };

export function PayrollWorkspace({ administrativeTenant }: { administrativeTenant?: string | null }) {
  const [meta, setMeta] = useState<Meta>({ jobPositions: [], compensationPlans: [], pensionRegimeRates: [], users: [], stores: [], role: "" });
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [employeeDraft, setEmployeeDraft] = useState(emptyEmployeeDraft);
  const [plansOpen, setPlansOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState(emptyPlanDraft);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [jobPositionsOpen, setJobPositionsOpen] = useState(false);
  const [jobPositionDraft, setJobPositionDraft] = useState("");
  const [pensionOpen, setPensionOpen] = useState(false);
  const [pensionDraft, setPensionDraft] = useState(emptyPensionDraft);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [ficha, setFicha] = useState<{ employee: Employee; latestEntry: (Entry & { payrollPeriod: { code: string; status: string } }) | null } | null>(null);
  const canWrite = ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(meta.role);
  const period = periods.find((p) => p.id === selectedPeriodId) ?? null;

  const [activeFeatures, setActiveFeatures] = useState<string[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    const [crmMetaResponse, personnelMetaResponse, periodsResponse, plansResponse] = await Promise.all([fetch("/api/crm/meta"), fetch("/api/crm/personnel/meta"), fetch("/api/crm/personnel/periods"), fetch("/api/crm/personnel/compensation-plans")]);
    const [crmMetaResult, personnelMeta, periodsResult, plansResult] = await Promise.all([crmMetaResponse.json(), personnelMetaResponse.json(), periodsResponse.json(), plansResponse.json()]);
    if (crmMetaResponse.ok) setActiveFeatures(crmMetaResult.activeFeatures ?? []);
    if (personnelMetaResponse.ok) setMeta(personnelMeta);
    if (periodsResponse.ok) { setPeriods(periodsResult.items); if (!selectedPeriodId && periodsResult.items.length) setSelectedPeriodId(periodsResult.items[0].id); }
    if (plansResponse.ok) setPlans(plansResult.items);
    setLoading(false);
  }, [selectedPeriodId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const loadEntries = useCallback(async () => {
    if (!selectedPeriodId) { setEntries([]); setSummary(null); return; }
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const response = await fetch(`/api/crm/personnel/periods/${selectedPeriodId}/entries?${query}`);
    const result = await response.json();
    if (response.ok) { setEntries(result.items); setSummary(result.summary); setMessage(""); } else setMessage(result.message);
  }, [selectedPeriodId, filters]);
  useEffect(() => { const timer = window.setTimeout(() => void loadEntries(), 0); return () => window.clearTimeout(timer); }, [loadEntries]);

  async function createPeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/crm/personnel/periods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodStart: data.get("periodStart"), periodEnd: data.get("periodEnd") }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setNewPeriodOpen(false); setSelectedPeriodId(result.item.id); setMessage("Período creado y calculado."); await load();
  }
  async function periodAction(action: string) {
    if (!period) return;
    const response = await fetch(`/api/crm/personnel/periods/${period.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setMessage(action === "recalculate" ? "Período recalculado." : action === "review" ? "Período marcado como revisado." : action === "close" ? "Período cerrado." : "Pago registrado en Finanzas.");
    await load(); await loadEntries();
  }

  async function createEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/crm/personnel/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...employeeDraft, userId: employeeDraft.userId || undefined, pensionRegimeRateId: employeeDraft.pensionRegimeRateId || undefined, storeId: employeeDraft.storeId || undefined }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setEmployeeOpen(false); setEmployeeDraft(emptyEmployeeDraft); setMessage("Trabajador registrado."); await load(); await loadEntries();
  }

  function beginPlan(existing?: Plan) {
    setEditingPlanId(existing?.id ?? null);
    setPlanDraft(existing ? {
      name: existing.name, code: existing.code, mode: existing.mode, baseSalary: existing.baseSalary ?? "", effectiveFrom: new Date().toISOString().slice(0, 10), active: existing.active,
      hasCommission: Boolean(existing.commissionRule),
      commissionRule: existing.commissionRule ? { calculationType: existing.commissionRule.calculationType, eligibility: existing.commissionRule.eligibility, fixedAmountPerSale: existing.commissionRule.fixedAmountPerSale ?? "", percentageValue: existing.commissionRule.percentageValue ?? "", percentageBase: existing.commissionRule.percentageBase ?? "SALE_AMOUNT", active: existing.commissionRule.active, tiers: existing.commissionRule.tiers } : emptyPlanDraft.commissionRule,
      components: existing.components,
    } : emptyPlanDraft);
  }
  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      name: planDraft.name, code: planDraft.code, mode: planDraft.mode, baseSalary: planDraft.baseSalary || null, effectiveFrom: planDraft.effectiveFrom, active: planDraft.active,
      commissionRule: planDraft.hasCommission ? planDraft.commissionRule : null,
      components: planDraft.components,
    };
    const response = await fetch(editingPlanId ? `/api/crm/personnel/compensation-plans/${editingPlanId}` : "/api/crm/personnel/compensation-plans", { method: editingPlanId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    beginPlan(); setMessage("Plan de compensación guardado."); await load();
  }
  function addComponent(role: Role) { setPlanDraft((d) => ({ ...d, components: [...d.components, { role, category: role === "INCOME" ? "OTRO_INGRESO" : role === "DEDUCTION" ? "DESCUENTO_MANUAL" : "APORTE_EMPLEADOR", name: "", calculationType: "FIXED", amount: "", percentageValue: "", percentageBase: "BASE_SALARY", active: true }] })); }
  function updateComponent(index: number, patch: Partial<Component>) { setPlanDraft((d) => ({ ...d, components: d.components.map((c, i) => i === index ? { ...c, ...patch } : c) })); }
  function removeComponent(index: number) { setPlanDraft((d) => ({ ...d, components: d.components.filter((_, i) => i !== index) })); }
  function addTier() { setPlanDraft((d) => ({ ...d, commissionRule: { ...d.commissionRule, tiers: [...d.commissionRule.tiers, { minSales: 0, maxSales: null, tierCalculationType: "FIXED_PER_SALE", fixedAmountPerSale: "", percentageValue: "", percentageBase: "SALE_AMOUNT" }] } })); }
  function updateTier(index: number, patch: Partial<Tier>) { setPlanDraft((d) => ({ ...d, commissionRule: { ...d.commissionRule, tiers: d.commissionRule.tiers.map((t, i) => i === index ? { ...t, ...patch } : t) } })); }
  function removeTier(index: number) { setPlanDraft((d) => ({ ...d, commissionRule: { ...d.commissionRule, tiers: d.commissionRule.tiers.filter((_, i) => i !== index) } })); }

  async function createJobPosition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/crm/personnel/job-positions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: jobPositionDraft }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setJobPositionDraft(""); setMessage("Cargo creado."); await load();
  }
  async function toggleJobPosition(item: JobPosition) { const response = await fetch(`/api/crm/personnel/job-positions/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !item.active }) }); const result = await response.json(); if (!response.ok) return setMessage(result.message); await load(); }

  async function createPensionRate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/crm/personnel/pension-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pensionDraft, contributionPercentage: pensionDraft.contributionPercentage || undefined, insurancePercentage: pensionDraft.insurancePercentage || undefined, commissionPercentage: pensionDraft.commissionPercentage || undefined }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setPensionDraft(emptyPensionDraft); setMessage("Tasa pensionaria creada."); await load();
  }
  async function togglePensionRate(item: PensionRate) { const response = await fetch(`/api/crm/personnel/pension-rates/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !item.active }) }); const result = await response.json(); if (!response.ok) return setMessage(result.message); await load(); }

  async function openFicha(employeeId: string) {
    setFichaId(employeeId);
    const response = await fetch(`/api/crm/personnel/employees/${employeeId}`);
    const result = await response.json();
    if (response.ok) setFicha(result);
  }

  const plansForMode = meta.compensationPlans.filter((p) => p.mode === employeeDraft.mode);

  return <>
    {administrativeTenant && <div className="admin-context"><span>◎</span><div><small>EMPRESA</small><strong>{administrativeTenant}</strong></div></div>}
    <section className="page-title crm-title"><div><span className="eyebrow">CRM · PAGO DE PERSONAL</span><h1>Pago de Personal</h1><p>Compensaciones, comisiones y costo laboral de la empresa, integrado con Finanzas sin duplicar gastos.</p></div><div className="reconciliation-actions"><button className="secondary" onClick={() => setJobPositionsOpen(true)}>Cargos</button><Link className="secondary" href="/crm/commercial-management">Administrar tiendas →</Link><button className="secondary" onClick={() => { setPlansOpen(true); beginPlan(); }}>Planes de compensación</button><button className="secondary" onClick={() => setPensionOpen(true)}>Tasas pensionarias</button>{canWrite && <button className="primary" onClick={() => setEmployeeOpen(true)}>＋ Nuevo trabajador</button>}</div></section>
    <nav className="crm-tabs">{nav.filter(([id]) => activeFeatures.includes(id)).map(([id, text]) => <Link className={id === "payroll" ? "selected" : ""} key={id} href={`/crm/${id}`}>{text}</Link>)}</nav>

    <section className="card reconciliation-filters"><label>Período<select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)}><option value="">Seleccionar</option>{periods.map((p) => <option key={p.id} value={p.id}>{p.code} · {statusLabel(p.status)}</option>)}</select></label>{canWrite && <button className="secondary" onClick={() => setNewPeriodOpen(true)}>＋ Nuevo período</button>}{period && canWrite && <>{(period.status === "OPEN" || period.status === "REVIEWED") && <button className="secondary" onClick={() => void periodAction("recalculate")}>Recalcular</button>}{period.status === "OPEN" && <button className="secondary" onClick={() => void periodAction("review")}>Marcar revisado</button>}{(period.status === "OPEN" || period.status === "REVIEWED") && <button className="secondary" onClick={() => void periodAction("close")}>Cerrar período</button>}{period.status === "CLOSED" && <button className="primary" onClick={() => void periodAction("pay")}>Registrar pago</button>}</>}</section>

    {summary && <section className="reconciliation-kpis finance-kpis"><Kpi label="Personal activo" value={String(summary.activePersonnel)} /><Kpi label="Costo proyectado del período" value={money(summary.projectedCost)} /><Kpi label="Sueldos base" value={money(summary.baseSalaries)} /><Kpi label="Comisiones" value={money(summary.commissions)} /><Kpi label="Bonificaciones y movilidad" value={money(summary.bonusesAndMobility)} /><Kpi label="Aportes/costos empleador" value={money(summary.employerContributions)} /><Kpi label="Neto total a pagar" value={money(summary.netToPay)} /><Kpi label="Costo total empresa" value={money(summary.projectedCost)} /></section>}

    <section className="card reconciliation-filters"><label>Buscar<input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Nombre o documento" /></label><label>Cargo<select value={filters.jobPositionId} onChange={(e) => setFilters({ ...filters, jobPositionId: e.target.value })}><option value="">Todos</option>{meta.jobPositions.map((jp) => <option key={jp.id} value={jp.id}>{jp.name}</option>)}</select></label><label>Planilla<select value={filters.employmentType} onChange={(e) => setFilters({ ...filters, employmentType: e.target.value })}><option value="">Todos</option><option value="EN_PLANILLA">En planilla</option><option value="FUERA_PLANILLA">Fuera de planilla</option></select></label><button className="secondary" onClick={() => setFilters(emptyFilters)}>Limpiar</button></section>
    {message && <p className="form-error">{message}</p>}

    <section className="card reconciliation-table"><div className="table-scroll"><table className="operational-table"><thead><tr><th>Trabajador</th><th>Cargo</th><th>Modalidad</th><th>Bruto</th><th>Comisión</th><th>Descuentos</th><th>Neto a pagar</th><th>Costo empresa</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td><strong>{entry.employee.name}</strong>{entry.eligibleSalesCount !== null && <small>{entry.eligibleSalesCount} ventas elegibles</small>}</td><td>{entry.employee.jobPosition.name}</td><td>{entry.employee.employmentType === "EN_PLANILLA" ? "En planilla" : "Fuera de planilla"}</td><td>{money(entry.grossAmount)}</td><td>{money(entry.commissionAmount)}</td><td>{money(entry.totalWorkerDeductions)}</td><td>{money(entry.netAmount)}</td><td>{money(entry.totalCompanyCost)}</td><td><span className="crm-state">{period ? statusLabel(period.status) : ""}</span></td><td><button className="secondary" onClick={() => void openFicha(entry.employeeId)}>Ver ficha</button></td></tr>)}</tbody></table></div>{!loading && !entries.length && <div className="operational-empty"><strong>Sin trabajadores en este período</strong><span>Registra un trabajador o selecciona/crea un período.</span></div>}</section>

    {newPeriodOpen && <Modal title="Nuevo período de pago" close={() => setNewPeriodOpen(false)}><form className="reconciliation-form" onSubmit={createPeriod}><label>Inicio del período<input name="periodStart" type="date" required /></label><label>Fin del período<input name="periodEnd" type="date" required /></label><button className="primary wide">Crear y calcular período</button></form></Modal>}

    {employeeOpen && <Modal title="Nuevo trabajador" close={() => setEmployeeOpen(false)}><form className="reconciliation-form" onSubmit={createEmployee}>
      <label>Nombre<input required value={employeeDraft.name} onChange={(e) => setEmployeeDraft({ ...employeeDraft, name: e.target.value })} /></label>
      <label>Documento<input value={employeeDraft.document} onChange={(e) => setEmployeeDraft({ ...employeeDraft, document: e.target.value })} /></label>
      <label>Cargo<select required value={employeeDraft.jobPositionId} onChange={(e) => setEmployeeDraft({ ...employeeDraft, jobPositionId: e.target.value })}><option value="">Seleccionar</option>{meta.jobPositions.map((jp) => <option key={jp.id} value={jp.id}>{jp.name}</option>)}</select></label>
      <label>Fecha de ingreso<input required type="date" value={employeeDraft.hireDate} onChange={(e) => setEmployeeDraft({ ...employeeDraft, hireDate: e.target.value })} /></label>
      <label>Vínculo<select value={employeeDraft.employmentType} onChange={(e) => setEmployeeDraft({ ...employeeDraft, employmentType: e.target.value as EmploymentType, pensionRegimeRateId: "" })}><option value="EN_PLANILLA">En planilla</option><option value="FUERA_PLANILLA">Fuera de planilla</option></select></label>
      <label>Modalidad<select value={employeeDraft.mode} onChange={(e) => setEmployeeDraft({ ...employeeDraft, mode: e.target.value as Mode, compensationPlanId: "" })}><option value="FIJO">Fijo</option><option value="COMISIONISTA">Comisionista</option><option value="MIXTO">Mixto</option></select></label>
      <label>Plan de compensación<select required value={employeeDraft.compensationPlanId} onChange={(e) => setEmployeeDraft({ ...employeeDraft, compensationPlanId: e.target.value })}><option value="">Seleccionar</option>{plansForMode.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {employeeDraft.employmentType === "EN_PLANILLA" && <label>Régimen pensionario<select value={employeeDraft.pensionRegimeRateId} onChange={(e) => setEmployeeDraft({ ...employeeDraft, pensionRegimeRateId: e.target.value })}><option value="">Sin configurar</option>{meta.pensionRegimeRates.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.regime})</option>)}</select></label>}
      <label>Usuario asociado (opcional)<select value={employeeDraft.userId} onChange={(e) => setEmployeeDraft({ ...employeeDraft, userId: e.target.value })}><option value="">Sin acceso a la plataforma</option>{meta.users.filter((u) => !u.employee).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role.code}</option>)}</select></label>
      <label>Tienda asignada (opcional)<select value={employeeDraft.storeId} onChange={(e) => setEmployeeDraft({ ...employeeDraft, storeId: e.target.value })}><option value="">Sin tienda asignada</option>{meta.stores.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}</select></label>
      <button className="primary wide">Guardar trabajador</button>
    </form></Modal>}

    {jobPositionsOpen && <Modal title="Cargos" close={() => setJobPositionsOpen(false)}><form className="reconciliation-form" onSubmit={createJobPosition}><label className="wide">Nombre del cargo<input required value={jobPositionDraft} onChange={(e) => setJobPositionDraft(e.target.value)} placeholder="Ej. Gerente, Promotor, Contador" /></label><button className="primary wide">Crear cargo</button></form>
      <section className="provider-list">{meta.jobPositions.map((jp) => <article key={jp.id}><div><strong>{jp.name}</strong></div>{canWrite && <button className="secondary" onClick={() => void toggleJobPosition(jp)}>{jp.active ? "Desactivar" : "Activar"}</button>}</article>)}</section>
    </Modal>}

    {pensionOpen && <Modal title="Tasas pensionarias" close={() => setPensionOpen(false)}><form className="reconciliation-form" onSubmit={createPensionRate}>
      <label>Régimen<select value={pensionDraft.regime} onChange={(e) => setPensionDraft({ ...pensionDraft, regime: e.target.value as PensionRate["regime"] })}><option value="ONP">ONP</option><option value="AFP">AFP</option><option value="NINGUNO">Ninguno</option></select></label>
      <label>Nombre<input required value={pensionDraft.name} onChange={(e) => setPensionDraft({ ...pensionDraft, name: e.target.value })} placeholder="Ej. ONP 2026, AFP Integra 2026" /></label>
      <label>Aporte obligatorio %<input type="number" step="0.001" min="0" value={pensionDraft.contributionPercentage} onChange={(e) => setPensionDraft({ ...pensionDraft, contributionPercentage: e.target.value })} /></label>
      <label>Prima de seguro %<input type="number" step="0.001" min="0" value={pensionDraft.insurancePercentage} onChange={(e) => setPensionDraft({ ...pensionDraft, insurancePercentage: e.target.value })} /></label>
      <label>Comisión %<input type="number" step="0.001" min="0" value={pensionDraft.commissionPercentage} onChange={(e) => setPensionDraft({ ...pensionDraft, commissionPercentage: e.target.value })} /></label>
      <label>Vigente desde<input required type="date" value={pensionDraft.effectiveFrom} onChange={(e) => setPensionDraft({ ...pensionDraft, effectiveFrom: e.target.value })} /></label>
      <label className="wide">Fuente / referencia (opcional)<input value={pensionDraft.sourceReference} onChange={(e) => setPensionDraft({ ...pensionDraft, sourceReference: e.target.value })} /></label>
      <button className="primary wide">Crear tasa</button>
    </form>
      <section className="provider-list">{meta.pensionRegimeRates.map((rate) => <article key={rate.id}><div><strong>{rate.name}</strong><small>{rate.regime} · aporte {rate.contributionPercentage ?? "0"}% · seguro {rate.insurancePercentage ?? "0"}% · comisión {rate.commissionPercentage ?? "0"}%</small></div>{canWrite && <button className="secondary" onClick={() => void togglePensionRate(rate)}>{rate.active ? "Desactivar" : "Activar"}</button>}</article>)}</section>
    </Modal>}

    {plansOpen && <Modal title="Planes de compensación" close={() => setPlansOpen(false)}>
      <form className="reconciliation-form" onSubmit={savePlan}>
        <label>Nombre<input required value={planDraft.name} onChange={(e) => setPlanDraft({ ...planDraft, name: e.target.value })} placeholder="Ej. Promotor Estándar 2026" /></label>
        <label>Código<input required value={planDraft.code} onChange={(e) => setPlanDraft({ ...planDraft, code: e.target.value.toUpperCase() })} /></label>
        <label>Modalidad<select value={planDraft.mode} onChange={(e) => setPlanDraft({ ...planDraft, mode: e.target.value as Mode })}><option value="FIJO">Fijo</option><option value="COMISIONISTA">Comisionista</option><option value="MIXTO">Mixto</option></select></label>
        <label>Sueldo base (vacío = sin sueldo base)<input type="number" step="0.01" min="0" value={planDraft.baseSalary} onChange={(e) => setPlanDraft({ ...planDraft, baseSalary: e.target.value })} /></label>
        <label>Vigente desde<input required type="date" value={planDraft.effectiveFrom} onChange={(e) => setPlanDraft({ ...planDraft, effectiveFrom: e.target.value })} /></label>
        <label className="economic-active"><input type="checkbox" checked={planDraft.active} onChange={(e) => setPlanDraft({ ...planDraft, active: e.target.checked })} /> Plan activo</label>

        <label className="economic-active wide"><input type="checkbox" checked={planDraft.hasCommission} onChange={(e) => setPlanDraft({ ...planDraft, hasCommission: e.target.checked })} /> Este plan paga comisión</label>
        {planDraft.hasCommission && <div className="economic-component wide">
          <label>Tipo de comisión<select value={planDraft.commissionRule.calculationType} onChange={(e) => setPlanDraft({ ...planDraft, commissionRule: { ...planDraft.commissionRule, calculationType: e.target.value as CommissionType } })}><option value="FIXED_PER_SALE">Monto fijo por venta</option><option value="PERCENTAGE">Porcentaje</option><option value="TIERED_BY_SALE_COUNT">Escalonada por número de ventas</option></select></label>
          <label>Venta elegible cuando<select value={planDraft.commissionRule.eligibility} onChange={(e) => setPlanDraft({ ...planDraft, commissionRule: { ...planDraft.commissionRule, eligibility: e.target.value as Eligibility } })}><option value="SALE_APPROVED">Está aprobada/activada</option><option value="SALE_RECOGNIZED">Fue reconocida por Liquidaciones</option></select></label>
          {planDraft.commissionRule.calculationType === "FIXED_PER_SALE" && <label>Monto fijo por venta<input type="number" step="0.01" min="0" value={planDraft.commissionRule.fixedAmountPerSale ?? ""} onChange={(e) => setPlanDraft({ ...planDraft, commissionRule: { ...planDraft.commissionRule, fixedAmountPerSale: e.target.value } })} /></label>}
          {planDraft.commissionRule.calculationType === "PERCENTAGE" && <><label>Porcentaje<input type="number" step="0.001" min="0" value={planDraft.commissionRule.percentageValue ?? ""} onChange={(e) => setPlanDraft({ ...planDraft, commissionRule: { ...planDraft.commissionRule, percentageValue: e.target.value } })} /></label><label>Base económica<select value={planDraft.commissionRule.percentageBase ?? ""} onChange={(e) => setPlanDraft({ ...planDraft, commissionRule: { ...planDraft.commissionRule, percentageBase: e.target.value } })}>{BASES_BEFORE_GROSS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></>}
          {planDraft.commissionRule.calculationType === "TIERED_BY_SALE_COUNT" && <div className="wide">
            <div className="section-heading"><span>Tramos por cantidad de ventas</span><button type="button" className="secondary" onClick={addTier}>＋ Agregar tramo</button></div>
            {planDraft.commissionRule.tiers.map((tier, index) => <TierRow key={index} tier={tier} onChange={(patch) => updateTier(index, patch)} onRemove={() => removeTier(index)} />)}
          </div>}
        </div>}

        <div className="wide section-heading"><span>Ingresos, descuentos y aportes del empleador</span><div className="reconciliation-actions"><button type="button" className="secondary" onClick={() => addComponent("INCOME")}>＋ Ingreso</button><button type="button" className="secondary" onClick={() => addComponent("DEDUCTION")}>＋ Descuento</button><button type="button" className="secondary" onClick={() => addComponent("EMPLOYER_CONTRIBUTION")}>＋ Aporte empleador</button></div></div>
        {planDraft.components.map((component, index) => <div key={index} className="economic-component wide"><label>Tipo<span>{component.role === "INCOME" ? "Ingreso" : component.role === "DEDUCTION" ? "Descuento" : "Aporte empleador"}</span></label><label>Categoría<input value={component.category} onChange={(e) => updateComponent(index, { category: e.target.value.toUpperCase() })} placeholder="BONIFICACION, MOVILIDAD, OTRO..." /></label><label>Nombre<input required value={component.name} onChange={(e) => updateComponent(index, { name: e.target.value })} /></label><label>Cálculo<select value={component.calculationType} onChange={(e) => updateComponent(index, { calculationType: e.target.value as CalcType })}><option value="FIXED">Monto fijo</option><option value="PERCENTAGE">Porcentaje</option></select></label>{component.calculationType === "FIXED" ? <label>Monto<input type="number" step="0.01" min="0" value={component.amount ?? ""} onChange={(e) => updateComponent(index, { amount: e.target.value })} /></label> : <><label>Porcentaje<input type="number" step="0.001" min="0" value={component.percentageValue ?? ""} onChange={(e) => updateComponent(index, { percentageValue: e.target.value })} /></label><label>Base<select value={component.percentageBase ?? ""} onChange={(e) => updateComponent(index, { percentageBase: e.target.value })}>{(component.role === "INCOME" ? BASES_BEFORE_GROSS : BASES_ALL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></>}<label className="economic-active"><input type="checkbox" checked={component.active} onChange={(e) => updateComponent(index, { active: e.target.checked })} /> Activo</label><button type="button" className="secondary" onClick={() => removeComponent(index)}>Quitar</button></div>)}

        <button className="primary wide">{editingPlanId ? "Guardar cambios" : "Crear plan"}</button>
        {editingPlanId && <button type="button" className="secondary wide" onClick={() => beginPlan()}>Cancelar edición</button>}
      </form>
      <section className="provider-list">{plans.map((p) => <article key={p.id}><div><strong>{p.name}</strong><small>{p.code} · {p.mode} · {p._count.employees} trabajador(es)</small></div><button className="secondary" onClick={() => beginPlan(p)}>Editar</button></article>)}</section>
    </Modal>}

    {fichaId && <div className="detail-backdrop"><aside className="detail-panel">{!ficha ? <p>Cargando…</p> : <>
      <header><div><span>FICHA DEL TRABAJADOR</span><h2>{ficha.employee.name}</h2><p>{ficha.employee.jobPosition.name} · {ficha.employee.employmentType === "EN_PLANILLA" ? "En planilla" : "Fuera de planilla"} · {ficha.employee.compensationPlan.name}</p></div><button onClick={() => { setFichaId(null); setFicha(null); }}>×</button></header>
      <div className="detail-section"><h3>Datos generales</h3><div><article><small>Documento</small><strong>{ficha.employee.document ?? "—"}</strong></article><article><small>Ingreso</small><strong>{new Date(ficha.employee.hireDate).toLocaleDateString("es-PE")}</strong></article><article><small>Estado</small><strong>{ficha.employee.status === "ACTIVE" ? "Activo" : "Inactivo"}</strong></article><article><small>Tienda</small><strong>{ficha.employee.store?.name ?? "Sin tienda asignada"}</strong></article></div></div>
      {ficha.latestEntry ? <div className="detail-section"><h3>Último período calculado ({ficha.latestEntry.payrollPeriod.code} · {statusLabel(ficha.latestEntry.payrollPeriod.status as Period["status"])})</h3><div><article><small>Sueldo base</small><strong>{money(ficha.latestEntry.baseSalary)}</strong></article><article><small>Ventas elegibles</small><strong>{ficha.latestEntry.eligibleSalesCount ?? "—"}</strong></article><article><small>Comisión</small><strong>{money(ficha.latestEntry.commissionAmount)}</strong></article><article><small>Bonificaciones</small><strong>{money(ficha.latestEntry.bonusAmount)}</strong></article><article><small>Movilidad</small><strong>{money(ficha.latestEntry.mobilityAmount)}</strong></article><article><small>Otros ingresos</small><strong>{money(ficha.latestEntry.otherIncomeAmount)}</strong></article><article><small>Bruto</small><strong>{money(ficha.latestEntry.grossAmount)}</strong></article><article><small>Descuento pensionario</small><strong>{money(ficha.latestEntry.pensionDeduction)}</strong></article><article><small>Otros descuentos</small><strong>{money(ficha.latestEntry.otherDeductions)}</strong></article><article><small>Neto a pagar</small><strong>{money(ficha.latestEntry.netAmount)}</strong></article><article><small>Aportes empleador</small><strong>{money(ficha.latestEntry.employerContributionsAmount)}</strong></article><article><small>Costo total empresa</small><strong>{money(ficha.latestEntry.totalCompanyCost)}</strong></article></div></div> : <div className="operational-empty"><strong>Sin cálculo todavía</strong><span>Aún no hay un período calculado para este trabajador.</span></div>}
    </>}</aside></div>}
  </>;
}

function TierRow({ tier, onChange, onRemove }: { tier: Tier; onChange: (patch: Partial<Tier>) => void; onRemove: () => void }) {
  return <div className="rule-scope">
    <span><small>DESDE</small><input type="number" min="0" value={tier.minSales} onChange={(e) => onChange({ minSales: Number(e.target.value) })} /></span>
    <span><small>HASTA (vacío = sin límite)</small><input type="number" min="0" value={tier.maxSales ?? ""} onChange={(e) => onChange({ maxSales: e.target.value === "" ? null : Number(e.target.value) })} /></span>
    <span><small>TIPO</small><select value={tier.tierCalculationType} onChange={(e) => onChange({ tierCalculationType: e.target.value as Tier["tierCalculationType"] })}><option value="FIXED_PER_SALE">Monto fijo</option><option value="PERCENTAGE">Porcentaje</option></select></span>
    {tier.tierCalculationType === "FIXED_PER_SALE"
      ? <span><small>MONTO POR VENTA</small><input type="number" step="0.01" min="0" value={tier.fixedAmountPerSale ?? ""} onChange={(e) => onChange({ fixedAmountPerSale: e.target.value })} /></span>
      : <>
        <span><small>PORCENTAJE</small><input type="number" step="0.001" min="0" value={tier.percentageValue ?? ""} onChange={(e) => onChange({ percentageValue: e.target.value })} /></span>
        <span><small>BASE</small><select value={tier.percentageBase ?? ""} onChange={(e) => onChange({ percentageBase: e.target.value })}>{BASES_BEFORE_GROSS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></span>
      </>}
    <button type="button" className="secondary" onClick={onRemove}>Quitar</button>
  </div>;
}
function Kpi({ label, value }: { label: string; value: string }) { return <article><small>{label}</small><strong>{value}</strong></article>; }
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="detail-backdrop"><aside className="detail-panel reconciliation-modal"><header><h2>{title}</h2><button onClick={close}>×</button></header>{children}</aside></div>; }
