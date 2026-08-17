"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { sections, type SectionKey } from "@/lib/navigation";
import { guardian, roles, type HealthState } from "@/lib/mock-data";
import type { SafeSession } from "@/lib/auth";
import { CrmWorkspace } from "@/components/crm-workspace";
import { EconomicRulesWorkspace } from "@/components/economic-rules-workspace";
import { CrmOperationalWorkspace } from "@/components/crm-operational-workspace";
import { ReconciliationWorkspace } from "@/components/reconciliation-workspace";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { PayrollWorkspace } from "@/components/payroll-workspace";
import { ExecutiveDashboard } from "@/components/executive-dashboard";
import { CommercialManagementWorkspace } from "@/components/commercial-management-workspace";
import { PromoterSpaceWorkspace, PromoterFollowUpsWorkspace, PromoterRankingWorkspace, PromoterCommissionsWorkspace, PromoterAgendaWorkspace, PromoterGoalsWorkspace, PromoterProfileWorkspace } from "@/components/promoter-space-workspace";

type CoreLimit = { value: number; definition: { id: string; code: string; name: string; unit: string } };
type CorePlan = { id: string; name: string; code: string; limits: CoreLimit[] };
type CoreTenantModule = { moduleId: string; enabled: boolean; module: { id: string; code: string; name: string; description?: string } };
type TenantBranding = { displayName:string;logoUrl:string|null;logoDarkUrl:string|null;faviconUrl:string|null;primaryColor:string|null;secondaryColor:string|null;loginTitle:string|null;loginSubtitle:string|null;loginBackgroundUrl:string|null;subdomain:string|null;customDomain:string|null };
type CoreTenant = { id: string; name: string; slug: string; status: string; createdAt: string; plan: CorePlan; modules: CoreTenantModule[]; limitOverrides: CoreLimit[]; branding:TenantBranding|null };

const stateLabel: Record<HealthState, string> = {
  operational: "Operativo", warning: "Advertencia", critical: "Crítico", "no-data": "Sin datos",
};

function Status({ state = "operational", children }: { state?: HealthState; children?: React.ReactNode }) {
  return <span className={`status status-${state}`}><i />{children ?? stateLabel[state]}</span>;
}

const AGENT_NAV: Array<[string, { label: string; icon: string; href: string }]> = [
  ["promoter-space", { label: "Mi día", icon: "☀", href: "/crm/promoter-space" }],
  ["customers", { label: "Mis clientes", icon: "◑", href: "/crm/customers" }],
  ["sales", { label: "Mis ventas", icon: "◈", href: "/crm/sales" }],
  ["promoter-followups", { label: "Seguimientos", icon: "◷", href: "/crm/promoter-followups" }],
  ["promoter-goals", { label: "Mis metas", icon: "◎", href: "/crm/promoter-goals" }],
  ["promoter-ranking", { label: "Mi ranking", icon: "♛", href: "/crm/promoter-ranking" }],
  ["promoter-commissions", { label: "Mis comisiones", icon: "◆", href: "/crm/promoter-commissions" }],
  ["promoter-agenda", { label: "Agenda", icon: "▤", href: "/crm/promoter-agenda" }],
  ["promoter-profile", { label: "Mi perfil", icon: "☺", href: "/crm/promoter-profile" }],
];

function Sidebar({ section, crmView, open, close, session, companyMode }: { section: SectionKey; crmView?: string; open: boolean; close: () => void; session: SafeSession; companyMode: boolean }) {
  const isAgent = companyMode && session.user.role === "AGENT";
  // A Promotor never sees the administrative sidebar (Usuarios, Configuración, Liquidaciones, etc.) — just a
  // minimal self-service nav. Everyone else keeps the standard module-driven sidebar.
  const canSeeUsers = session.user.role === "SUPER_ADMIN" || session.user.permissions.includes("users.read") || session.user.permissions.includes("users.manage");
  const alwaysForCompany = canSeeUsers ? ["dashboard", "usuarios"] : ["dashboard"];
  const navItems = isAgent ? AGENT_NAV : Object.entries(sections).filter(([key]) => !companyMode || alwaysForCompany.includes(key) || session.user.activeModules.includes(key));
  const brandName=companyMode?(session.user.branding?.displayName??session.user.tenantName??"Empresa"):"MentoriFY";
  const brandInitials=brandName.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase();
  return <>
    {open && <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={close} />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`} style={companyMode&&session.user.branding?.primaryColor?{"--purple":session.user.branding.primaryColor} as React.CSSProperties:undefined}>
      <div className="brand"><span className="brand-mark" style={companyMode&&session.user.branding?.logoDarkUrl?{backgroundImage:`url(${session.user.branding.logoDarkUrl})`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}>{companyMode&&session.user.branding?.logoDarkUrl?"":brandInitials}</span><div><strong>{brandName}</strong><small>{companyMode?"Portal empresarial":"Enterprise Platform"}</small></div></div>
      <div className="workspace"><span>MC</span><div><small>Espacio de trabajo</small><strong>{companyMode ? session.user.tenantName : "Panel Maestro"}</strong></div><b>⌄</b></div>
      <nav aria-label="Navegación principal">
        <p>PLATAFORMA</p>
        {navItems.map(([key, item]) => <Link key={key} href={companyMode && key === "dashboard" ? "/empresa" : item.href} onClick={close} className={(isAgent ? crmView === key : section === key) ? "active" : ""}><span>{item.icon}</span>{item.label}{key === "guardian" && <em />}</Link>)}
      </nav>
      <div className="sidebar-footer"><div className="avatar">{session.user.name.split(" ").map(part => part[0]).join("").slice(0,2)}</div><div><strong>{session.user.name}</strong><small>{session.user.email}</small></div><button aria-label="Cerrar sesión" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = companyMode&&session.user.branding?.subdomain?`/t/${session.user.branding.subdomain}/login`:"/login"; }}>↪</button></div>
    </aside>
  </>;
}

function Dashboard({ tenant, count, coreError, companyMode, session }: { tenant?: CoreTenant; count: number; coreError: string; companyMode:boolean; session:SafeSession }) {
  if (companyMode) {
    const name=session.user.branding?.displayName??session.user.tenantName??"Tu empresa";
    const enabled=tenant?.modules.filter(item=>item.enabled).map(item=>item.module.code)??session.user.activeModules;
    // El Dashboard Ejecutivo (datos reales consolidados) es para COMPANY_ADMIN/SUPERVISOR; AGENT conserva la vista simple — su propio portal irá aparte.
    if (["COMPANY_ADMIN","SUPERVISOR"].includes(session.user.role)) return <ExecutiveDashboard tenantName={name}/>;
    return <><section className="hero"><div><span className="eyebrow">RESUMEN DE TU EMPRESA</span><h1>Bienvenido a {name}</h1><p>Gestiona tu equipo y las funciones activas de tu organización.</p></div></section><div className="stats"><article><span className="stat-icon purple">◎</span><div><small>MÓDULOS ACTIVOS</small><strong>{enabled.length}</strong><p><b>Configuración de tu plan</b></p></div></article><article><span className="stat-icon blue">♙</span><div><small>ORGANIZACIÓN</small><strong>{name}</strong><p>Entorno aislado</p></div></article></div><section className="card module-overview"><div className="card-head"><div><h2>Funciones disponibles</h2><p>Accesos habilitados para {name}</p></div></div><div className="module-grid">{enabled.map(code=><div key={code}><span>{sections[code as SectionKey]?.icon??"▧"}</span><strong>{sections[code as SectionKey]?.label??code}</strong><small>Activo</small></div>)}</div></section></>;
  }
  return <>
    <section className="hero"><div><span className="eyebrow">RESUMEN DE PLATAFORMA</span><h1>Buenos días, Super Admin</h1><p>Todo funciona con normalidad. Tienes una advertencia que revisar.</p></div><div className="hero-actions"><button className="secondary">Exportar reporte</button><Link className="primary" href="/empresas">＋ Nueva empresa</Link></div></section>
    {coreError && <div className="database-notice"><strong>Core SaaS sin conexión</strong><span>{coreError}</span><Link href="/empresas">Ver configuración</Link></div>}
    <div className="stats">
      <article><span className="stat-icon purple">▦</span><div><small>EMPRESAS ACTIVAS</small><strong>{count}</strong><p><b>Fuente PostgreSQL</b></p></div></article>
      <article><span className="stat-icon blue">♙</span><div><small>USUARIOS</small><strong>—</strong><p>Próxima fase</p></div></article>
      <article><span className="stat-icon green">◇</span><div><small>SERVIDORES ONLINE</small><strong>1 / 1</strong><p><b>Todos operativos</b></p></div></article>
      <article><span className="stat-icon amber">!</span><div><small>ALERTAS ACTIVAS</small><strong>1</strong><p>Uso de RAM elevado</p></div></article>
    </div>
    <div className="grid-main">
      <section className="card"><div className="card-head"><div><h2>Estado de empresas</h2><p>Tenants activos en la plataforma</p></div><Link href="/empresas">Ver todas →</Link></div>{tenant ? <div className="company-row"><div className="company-logo">{tenant.name.slice(0,2).toUpperCase()}</div><div className="grow"><strong>{tenant.name}</strong><small>{tenant.slug} · Plan {tenant.plan.name}</small></div><Status /><div className="module-dots"><b>{tenant.modules.filter(item => item.enabled).length}</b><small>módulos activos</small></div><Link href="/empresas">•••</Link></div> : <div className="empty-core">Sin empresas persistidas</div>}</section>
      <section className="card guardian-mini"><div className="card-head"><div><h2>Guardian</h2><p>Observación de infraestructura</p></div><Link href="/guardian">Abrir Guardian →</Link></div><div className="server-line"><span className="pulse-dot"/><div><strong>{guardian.name}</strong><small>{guardian.ip}</small></div><Status>Online</Status></div><div className="mini-metrics">{guardian.metrics.slice(0,3).map(m => <div key={m.name}><span>{m.name}</span><strong>{m.display}</strong><div><i style={{width: `${m.value}%`}} /></div></div>)}</div></section>
    </div>
    <section className="card module-overview"><div className="card-head"><div><h2>Módulos de {tenant?.name ?? "empresa seleccionada"}</h2><p>Configuración persistida del tenant</p></div><Link href="/empresas">Administrar módulos →</Link></div><div className="module-grid">{tenant?.modules.map(item => <div className={item.enabled ? "" : "muted"} key={item.moduleId}><span>{sections[item.module.code as SectionKey]?.icon ?? "▧"}</span><strong>{item.module.name}</strong><small>{item.enabled ? "Activo" : "Inactivo"}</small></div>)}</div></section>
  </>;
}

function Companies({ tenants, plans, selectedId, loading, error, onSelect, reload, canGlobal }: { tenants: CoreTenant[]; plans: CorePlan[]; selectedId: string; loading: boolean; error: string; onSelect: (id: string) => void; reload: () => void; canGlobal: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");
  const selected = tenants.find((tenant) => tenant.id === selectedId) ?? tenants[0];

  async function toggleModule(item: CoreTenantModule) {
    if (!selected) return; setMessage("");
    const response = await fetch(`/api/core/tenants/${selected.id}/modules`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleId: item.moduleId, enabled: !item.enabled }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message ?? "No se pudo guardar el módulo.");
    reload();
  }

  async function assignPlan(planId: string) {
    if (!selected) return;
    const response = await fetch(`/api/core/tenants/${selected.id}/plan`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message ?? "No se pudo asignar el plan.");
    reload();
  }

  return <><section className="page-title"><div><span className="eyebrow">GESTIÓN DE TENANTS</span><h1>Empresas</h1><p>Administra empresas, planes, límites y módulos desde un solo lugar.</p></div>{canGlobal && <button className="primary" onClick={() => setShowCreate(true)}>＋ Nueva empresa</button>}</section>
    {error && <div className="database-notice"><strong>PostgreSQL pendiente de configuración</strong><span>{error}</span><button onClick={reload}>Reintentar</button></div>}
    {showCreate && <ProvisionTenantForm close={()=>setShowCreate(false)} onCreated={tenantId=>{setShowCreate(false);reload();onSelect(tenantId)}}/>}
    {loading ? <section className="card empty-core">Consultando empresas en PostgreSQL…</section> : !selected ? <section className="card empty-core"><strong>No hay empresas persistidas</strong><p>Configura la base de datos, aplica la migración y ejecuta el seed para cargar Clínica Demo.</p></section> : <>
    <div className="tenant-list">{tenants.map(tenant => <button key={tenant.id} onClick={() => onSelect(tenant.id)} className={tenant.id === selected.id ? "selected" : ""}><span>{tenant.name.slice(0,2).toUpperCase()}</span><div><strong>{tenant.name}</strong><small>{tenant.slug}</small></div><Status>{tenant.status === "ACTIVE" ? "Activa" : tenant.status}</Status></button>)}</div>
    <section className="card company-detail"><div className="company-banner"><div className="company-logo large">{selected.name.slice(0,2).toUpperCase()}</div><div><h2>{selected.name}</h2><p>{selected.slug} · Creada el {new Date(selected.createdAt).toLocaleDateString("es")}</p></div><Status>{selected.status === "ACTIVE" ? "Activa" : selected.status}</Status><select className="plan-select" value={selected.plan.id} onChange={(event) => assignPlan(event.target.value)} aria-label="Plan asignado" disabled={!canGlobal}>{plans.map(plan => <option key={plan.id} value={plan.id}>Plan {plan.name}</option>)}</select></div>
      <div className="detail-tabs"><button className="selected">Módulos</button><button>Plan y límites</button><button>Roles (próxima fase)</button></div>
      <div className="settings-grid">{selected.modules.map(item => <article key={item.moduleId}><div className="module-symbol">{sections[item.module.code as SectionKey]?.icon ?? "▧"}</div><div className="grow"><strong>{item.module.name}</strong><p>{item.module.description}</p></div><label className="switch"><input aria-label={`${item.enabled ? "Desactivar" : "Activar"} ${item.module.name}`} type="checkbox" checked={item.enabled} disabled={!canGlobal} onChange={() => toggleModule(item)}/><span /></label></article>)}</div>{canGlobal&&<><GeneralEditor tenant={selected} reload={reload}/><BrandingEditor key={selected.id} tenant={selected} reload={reload}/><VerticalEditor tenant={selected}/></>} {message && <p className="form-error">{message}</p>}
    </section><div className="two-cols"><section className="card"><div className="card-head"><div><h2>Plan {selected.plan.name}</h2><p>Límites configurados y persistentes</p></div></div>{selected.plan.limits.map(limit => { const override = selected.limitOverrides.find(item => item.definition.id === limit.definition.id); const value = override?.value ?? limit.value; return <div className="limit" key={limit.definition.id}><div><span>{limit.definition.name}</span><strong>{value.toLocaleString()} {limit.definition.unit === "MINUTES" ? "min" : limit.definition.unit === "SMS" ? "SMS" : ""}</strong></div><div><i style={{width: "0%"}} /></div></div> })}</section><section className="card"><div className="card-head"><div><h2>Roles configurados</h2><p>Simulados hasta la fase de usuarios</p></div></div>{roles.map(r => <div className="role" key={r.name}><span>♙</span><div className="grow"><strong>{r.name}</strong><small>{r.scope}</small></div><b>{r.users}</b></div>)}</section></div></>}</>;
}

type ProvisioningOptions={plans:Array<{id:string;name:string}>;modules:Array<{id:string;code:string;name:string}>;templates:Array<{id:string;code:string;name:string;features:Array<{id:string;code:string;name:string;defaultActive:boolean}>}>};
function ProvisionTenantForm({close,onCreated}:{close:()=>void;onCreated:(tenantId:string)=>void}){
  const [options,setOptions]=useState<ProvisioningOptions>({plans:[],modules:[],templates:[]}),[templateId,setTemplateId]=useState(""),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{const timer=window.setTimeout(async()=>{const response=await fetch("/api/core/provisioning-options");if(response.ok)setOptions(await response.json())},0);return()=>window.clearTimeout(timer)},[]);const template=options.templates.find(item=>item.id===templateId);
  async function provision(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setMessage("");const data=new FormData(event.currentTarget),featureIds=new Set(data.getAll("featureIds").map(String));const body={name:data.get("name"),slug:data.get("slug"),status:data.get("status"),planId:data.get("planId"),branding:{displayName:data.get("displayName"),logoUrl:data.get("logoUrl"),logoDarkUrl:data.get("logoDarkUrl"),faviconUrl:data.get("faviconUrl"),primaryColor:data.get("primaryColor"),secondaryColor:data.get("secondaryColor"),loginTitle:data.get("loginTitle"),loginSubtitle:data.get("loginSubtitle"),loginBackgroundUrl:data.get("loginBackgroundUrl"),subdomain:data.get("subdomain"),customDomain:data.get("customDomain")},verticalTemplateId:templateId||null,moduleIds:data.getAll("moduleIds"),crmFeatures:(template?.features??[]).map(feature=>({featureId:feature.id,active:featureIds.has(feature.id)})),maxUsers:Number(data.get("maxUsers")),admin:{name:data.get("adminName"),email:data.get("adminEmail"),jobTitle:data.get("jobTitle"),password:data.get("adminPassword")}};const response=await fetch("/api/core/tenants",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();setSaving(false);if(!response.ok)return setMessage(result.message);onCreated(result.tenant.id)}
  return <section className="card create-company provisioning-form"><div className="card-head"><div><h2>Nueva empresa</h2><p>Provisionamiento completo y transaccional.</p></div><button onClick={close} aria-label="Cerrar">×</button></div><form onSubmit={provision}><h3 className="wide">1 · Datos de empresa</h3><label>Nombre legal o comercial<input name="name" required/></label><label>Slug<input name="slug" required/></label><label>Estado<select name="status" defaultValue="ACTIVE"><option value="ACTIVE">Activa</option><option value="SUSPENDED">Suspendida</option><option value="INACTIVE">Inactiva</option></select></label><label>Plan SaaS<select name="planId" required defaultValue=""><option value="" disabled>Seleccionar</option>{options.plans.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><h3 className="wide">2 · Branding</h3><label>Nombre visible<input name="displayName" required/></label><label>Logo URL<input name="logoUrl"/></label><label>Logo oscuro URL<input name="logoDarkUrl"/></label><label>Favicon URL<input name="faviconUrl"/></label><label>Color principal<input name="primaryColor" placeholder="#6957d5"/></label><label>Color secundario<input name="secondaryColor" placeholder="#242044"/></label><label>Título de login<input name="loginTitle"/></label><label>Subtítulo de login<input name="loginSubtitle"/></label><label>Imagen de fondo URL<input name="loginBackgroundUrl"/></label><label>Subdominio<input name="subdomain" required/></label><label>Dominio personalizado<input name="customDomain"/></label><h3 className="wide">3 · Plantilla vertical</h3><label>Plantilla<select name="verticalTemplateId" value={templateId} onChange={event=>setTemplateId(event.target.value)}><option value="">Sin plantilla</option>{options.templates.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><h3 className="wide">4 · Módulos principales</h3><div className="wide provisioning-checks">{options.modules.map(item=><label key={item.id}><input type="checkbox" name="moduleIds" value={item.id}/>{item.name}</label>)}</div>{template&&<><h3 className="wide">5 · Funciones internas del CRM</h3><div className="wide provisioning-checks">{template.features.map(item=><label key={item.id}><input type="checkbox" name="featureIds" value={item.id} defaultChecked={item.defaultActive}/>{item.name}</label>)}</div></>}<h3 className="wide">6 · Límite de usuarios</h3><label>Máximo de usuarios activos<input name="maxUsers" type="number" min="1" required/></label><h3 className="wide">7 · Administrador inicial</h3><label>Nombre<input name="adminName" required/></label><label>Correo<input name="adminEmail" type="email" required/></label><label>Cargo visible<input name="jobTitle"/></label><label>Contraseña temporal<input name="adminPassword" type="password" minLength={12} required/></label><button className="primary wide" disabled={saving}>{saving?"Provisionando…":"Crear empresa completa"}</button></form>{message&&<p className="form-error">{message}</p>}</section>
}

type BrandingFormState = { displayName:string; logoUrl:string; logoDarkUrl:string; faviconUrl:string; primaryColor:string; secondaryColor:string; loginTitle:string; loginSubtitle:string; loginBackgroundUrl:string; subdomain:string; customDomain:string };
function brandingFormFromTenant(tenant: CoreTenant): BrandingFormState {
  const branding = tenant.branding;
  return { displayName: branding?.displayName ?? tenant.name, logoUrl: branding?.logoUrl ?? "", logoDarkUrl: branding?.logoDarkUrl ?? "", faviconUrl: branding?.faviconUrl ?? "", primaryColor: branding?.primaryColor ?? "", secondaryColor: branding?.secondaryColor ?? "", loginTitle: branding?.loginTitle ?? "", loginSubtitle: branding?.loginSubtitle ?? "", subdomain: branding?.subdomain ?? tenant.slug, loginBackgroundUrl: branding?.loginBackgroundUrl ?? "", customDomain: branding?.customDomain ?? "" };
}
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function colorSwatch(value: string, fallback: string) { return HEX_RE.test(value) ? value : fallback; }
function brandingInitials(name: string) { return name.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase(); }

function AssetPreview({ url, kind }: { url: string; kind: "logo" | "favicon" }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <div className="branding-asset-preview empty"><span>{kind === "favicon" ? "◇" : "▧"}</span><small>Sin imagen</small></div>;
  return <div className="branding-asset-preview"><img src={url} alt="" onError={() => setBroken(true)} /></div>;
}

function BrandingEditor({tenant,reload}:{tenant:CoreTenant;reload:()=>void}) {
  const [form, setForm] = useState<BrandingFormState>(() => brandingFormFromTenant(tenant));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  function field<K extends keyof BrandingFormState>(key: K) { return { value: form[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [key]: event.target.value })) }; }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const response = await fetch(`/api/core/tenants/${tenant.id}/branding`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) { setMessage({ ok: false, text: result.message }); return; }
    setMessage({ ok: true, text: "Apariencia guardada correctamente." });
    window.setTimeout(reload, 900);
  }
  const initials = brandingInitials(form.displayName || tenant.name);
  const previewStyle = { "--tenant-primary": colorSwatch(form.primaryColor, "#6957d5"), "--tenant-secondary": colorSwatch(form.secondaryColor, "#242044") } as React.CSSProperties;
  return <section className="branding-editor branding-studio">
    <div className="card-head"><div><h2>Apariencia / Branding</h2><p>Identidad visual y acceso propio de esta empresa.</p></div></div>
    <div className="branding-layout">
      <form className="branding-form" onSubmit={save}>
        <fieldset className="branding-group"><legend>Identidad de marca</legend>
          <label>Nombre visible<input required {...field("displayName")} /></label>
        </fieldset>
        <fieldset className="branding-group"><legend>Logotipos e iconos</legend>
          <div className="branding-asset-grid">
            <label>Logo (claro)<input placeholder="https://…" {...field("logoUrl")} /><AssetPreview key={form.logoUrl} url={form.logoUrl} kind="logo" /></label>
            <label>Logo oscuro (sidebar)<input placeholder="https://…" {...field("logoDarkUrl")} /><AssetPreview key={form.logoDarkUrl} url={form.logoDarkUrl} kind="logo" /></label>
            <label>Favicon<input placeholder="https://…" {...field("faviconUrl")} /><AssetPreview key={form.faviconUrl} url={form.faviconUrl} kind="favicon" /></label>
          </div>
        </fieldset>
        <fieldset className="branding-group"><legend>Colores</legend>
          <div className="branding-color-grid">
            <label>Color principal<div className="color-input"><input type="color" aria-label="Selector de color principal" value={colorSwatch(form.primaryColor, "#6957d5")} onChange={event => setForm(prev => ({ ...prev, primaryColor: event.target.value }))} /><input type="text" placeholder="#6957d5" {...field("primaryColor")} /></div></label>
            <label>Color secundario<div className="color-input"><input type="color" aria-label="Selector de color secundario" value={colorSwatch(form.secondaryColor, "#242044")} onChange={event => setForm(prev => ({ ...prev, secondaryColor: event.target.value }))} /><input type="text" placeholder="#242044" {...field("secondaryColor")} /></div></label>
          </div>
        </fieldset>
        <fieldset className="branding-group"><legend>Pantalla de acceso</legend>
          <label>Título de login<input placeholder="Bienvenido de nuevo" {...field("loginTitle")} /></label>
          <label>Subtítulo de login<input placeholder="Ingresa a tu espacio de trabajo con tus credenciales." {...field("loginSubtitle")} /></label>
          <label>Fondo de login (URL)<input placeholder="https://…" {...field("loginBackgroundUrl")} /></label>
        </fieldset>
        <fieldset className="branding-group"><legend>Dominio y acceso</legend>
          <label>Subdominio<input {...field("subdomain")} /></label>
          <label>Dominio personalizado<input placeholder="empresa.com" {...field("customDomain")} /></label>
        </fieldset>
        <div className="branding-form-actions">
          <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar apariencia"}</button>
          {message && <p className={message.ok ? "branding-feedback" : "form-error"}>{message.text}</p>}
        </div>
      </form>
      <aside className="branding-preview">
        <span className="branding-preview-label">VISTA PREVIA · LOGIN</span>
        <div className="branding-preview-card" style={previewStyle}>
          <div className="branding-preview-brand">
            <span className="brand-mark" style={form.logoUrl ? { backgroundImage: `url(${form.logoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{form.logoUrl ? "" : initials}</span>
            <div><strong>{form.displayName || tenant.name}</strong><small>Portal empresarial</small></div>
          </div>
          <div className="branding-preview-copy">
            <span className="eyebrow">ACCESO SEGURO</span>
            <h3>{form.loginTitle || "Bienvenido de nuevo"}</h3>
            <p>{form.loginSubtitle || "Ingresa a tu espacio de trabajo con tus credenciales."}</p>
          </div>
          <div className="branding-preview-fields"><span /><span /></div>
          <span className="primary branding-preview-button">Iniciar sesión</span>
          <div className="branding-preview-aside" style={form.loginBackgroundUrl ? { backgroundImage: `linear-gradient(#171b32cc,#242044cc),url(${form.loginBackgroundUrl})` } : undefined}>
            <span>{(form.displayName || tenant.name).toUpperCase()}</span>
            <p>Tu espacio de trabajo.</p>
          </div>
        </div>
        <p className="branding-preview-note">Se actualiza mientras editas, antes de guardar.</p>
      </aside>
    </div>
  </section>;
}

function GeneralEditor({tenant,reload}:{tenant:CoreTenant;reload:()=>void}){const[message,setMessage]=useState("");async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const body=Object.fromEntries(new FormData(event.currentTarget).entries());const response=await fetch(`/api/core/tenants/${tenant.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)return setMessage(result.message);setMessage("Datos generales guardados.");reload()}return <section className="branding-editor"><div className="card-head"><div><h2>Datos generales</h2><p>Nombre, slug y estado operativo.</p></div></div><form className="user-form" onSubmit={save}><label>Nombre<input name="name" defaultValue={tenant.name} required/></label><label>Slug<input name="slug" defaultValue={tenant.slug} required/></label><label>Estado<select name="status" defaultValue={tenant.status}><option value="ACTIVE">Activa</option><option value="SUSPENDED">Suspendida</option><option value="INACTIVE">Inactiva</option></select></label><button className="primary">Guardar datos</button></form>{message&&<p>{message}</p>}</section>}

type VerticalConfiguration={assignment:{verticalTemplate:{id:string;code:string;name:string;features:Array<{id:string;code:string;name:string;tenantFeatures:Array<{active:boolean}>}>}}|null;maxUsers:number;activeUsers:number};
function VerticalEditor({tenant}:{tenant:CoreTenant}){
  const [configuration,setConfiguration]=useState<VerticalConfiguration|null>(null),[templates,setTemplates]=useState<Array<{id:string;name:string}>>([]),[message,setMessage]=useState("");
  const load=useCallback(async()=>{const[response,optionsResponse]=await Promise.all([fetch(`/api/core/tenants/${tenant.id}/vertical-template`),fetch("/api/core/provisioning-options")]);const result=await response.json();if(response.ok)setConfiguration(result);else setMessage(result.message);if(optionsResponse.ok)setTemplates(((await optionsResponse.json()) as ProvisioningOptions).templates)},[tenant.id]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[load]);
  async function update(body:object){const response=await fetch(`/api/core/tenants/${tenant.id}/vertical-template`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)return setMessage(result.message);setConfiguration(result);setMessage("Configuración guardada.")}
  const template=configuration?.assignment?.verticalTemplate;
  return <section className="branding-editor"><div className="card-head"><div><h2>Plantilla y Funciones CRM</h2><p>{template?<><strong>{template.name}</strong> · {template.code}</>:"Este tenant no tiene una plantilla vertical asignada."}</p></div></div><label>Plantilla asignada<select value={template?.id??""} onChange={event=>void update({verticalTemplateId:event.target.value||null})}><option value="">Sin plantilla</option>{templates.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{template&&<div className="settings-grid">{template.features.map(feature=><article key={feature.id}><div className="grow"><strong>{feature.name}</strong><p>{feature.code}</p></div><label className="switch"><input type="checkbox" checked={feature.tenantFeatures.some(item=>item.active)} onChange={event=>void update({featureId:feature.id,active:event.target.checked})}/><span/></label></article>)}</div>} {configuration&&<form className="user-form" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);void update({maxUsers:Number(data.get("maxUsers"))})}}><label>Máximo de usuarios activos<input name="maxUsers" type="number" min="1" defaultValue={configuration.maxUsers}/></label><div><small>Usuarios activos: {configuration.activeUsers}</small><br/><small>Cupos disponibles: {Math.max(0,configuration.maxUsers-configuration.activeUsers)}</small></div><button className="primary">Guardar límite</button></form>}{message&&<p>{message}</p>}</section>
}

type ManagedUser = { id: string; name: string; email: string; jobTitle?:string|null; status: "ACTIVE" | "INACTIVE"; supervisorId: string | null; accessCode: string | null; role: { id: string; code: string; name: string } };
type ManagedRole = { id: string; code: string; name: string };
type CreatedAccess = { name: string; email: string; roleName: string; password: string; link: string | null };
// The short link (/p/[code]) is the only one ever shown to admins — no long /t/[slug]/login?email= link, per the
// "no entregar links largos" requirement. accessCode is generated server-side; null only for not-yet-generated.
function shortLink(accessCode: string | null) { return accessCode ? `/p/${accessCode}` : null; }

// Technical role codes stay stable (COMPANY_ADMIN/SUPERVISOR/AGENT); only the label shown to admins changes to the
// business-friendly names the client uses (Gerente/Supervisor/Promotor). Unknown codes fall back to role.name so
// other tenants/verticals with different roles keep displaying correctly.
const ROLE_LABELS: Record<string, string> = { COMPANY_ADMIN: "Gerente", SUPERVISOR: "Supervisor", AGENT: "Promotor" };
function roleLabel(code: string, fallback: string) { return ROLE_LABELS[code] ?? fallback; }
function supervisorCandidates(users: ManagedUser[], excludeId?: string) { return users.filter(u => u.id !== excludeId && u.status === "ACTIVE" && (u.role.code === "SUPERVISOR" || u.role.code === "COMPANY_ADMIN")); }

function AccessCard({ title, access, close }: { title: string; access: CreatedAccess; close: () => void }) {
  const [copied, setCopied] = useState("");
  const fullLink = access.link ? `${window.location.origin}${access.link}` : null;
  function copy(label: string, text: string) { void navigator.clipboard.writeText(text); setCopied(label); window.setTimeout(() => setCopied(""), 1500); }
  return <div className="detail-backdrop"><aside className="detail-panel access-card">
    <header><h2>{title}</h2><button onClick={close} aria-label="Cerrar">×</button></header>
    <div className="access-card-body">
      <div><small>NOMBRE</small><strong>{access.name}</strong></div>
      <div><small>ROL</small><strong>{access.roleName}</strong></div>
      <div><small>CORREO</small><strong>{access.email}</strong></div>
      <div><small>ENLACE DE ACCESO</small><strong>{fullLink ?? "No disponible: configura el subdominio de la empresa."}</strong></div>
      <div><small>CONTRASEÑA TEMPORAL</small><strong>{access.password}</strong></div>
    </div>
    <div className="access-card-actions">
      {fullLink && <button className="secondary" onClick={() => copy("link", fullLink)}>Copiar enlace</button>}
      {access.link && <a className="secondary" href={access.link} target="_blank" rel="noreferrer">Abrir portal</a>}
      <button className="secondary" onClick={() => copy("email", access.email)}>Copiar correo</button>
      <button className="secondary" onClick={() => copy("creds", `Correo: ${access.email}\nContraseña temporal: ${access.password}\nEnlace: ${fullLink ?? "(sin subdominio configurado)"}`)}>Copiar credenciales</button>
    </div>
    {copied && <p className="branding-feedback">Copiado ✓</p>}
    <p className="access-card-note">Para probar otra cuenta en este mismo equipo, utiliza una ventana privada u otro navegador.</p>
  </aside></div>;
}

function CreateUserForm({ tenantId, availableRoles, users, close, onCreated }: { tenantId?: string; availableRoles: ManagedRole[]; users: ManagedUser[]; close: () => void; onCreated: (access: CreatedAccess) => void }) {
  const [roleId, setRoleId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedRole = availableRoles.find(r => r.id === roleId);
  const isAgent = selectedRole?.code === "AGENT";

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password, roleId, supervisorId: isAgent ? (supervisorId || null) : null, tenantId }) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.message);
    onCreated({ name: result.user.name, email: result.user.email, roleName: roleLabel(result.user.role.code, result.user.role.name), password, link: shortLink(result.user.accessCode) });
  }

  return <section className="card create-company"><div className="card-head"><div><h2>Nuevo usuario</h2><p>La cuenta quedará vinculada únicamente a esta empresa.</p></div><button onClick={close} aria-label="Cerrar">×</button></div>
    <form className="user-form" onSubmit={createUser}>
      <label>Nombre<input name="name" required /></label>
      <label>Correo<input name="email" type="email" required /></label>
      <label>Contraseña temporal<input name="password" type="password" minLength={12} required /></label>
      <label>Rol<select required value={roleId} onChange={event => { setRoleId(event.target.value); setSupervisorId(""); }}><option value="">Seleccionar</option>{availableRoles.map(role => <option key={role.id} value={role.id}>{roleLabel(role.code, role.name)}</option>)}</select></label>
      {isAgent && <label>Supervisor<select value={supervisorId} onChange={event => setSupervisorId(event.target.value)}><option value="">Seleccionar</option>{supervisorCandidates(users).map(s => <option key={s.id} value={s.id}>{s.name} ({roleLabel(s.role.code, s.role.name)})</option>)}</select></label>}
      {message && <p className="form-error">{message}</p>}
      <button className="primary" disabled={saving}>{saving ? "Creando…" : "Crear usuario"}</button>
    </form>
  </section>;
}

function EditUserModal({ user, tenantId, availableRoles, users, close, onSaved }: { user: ManagedUser; tenantId?: string; availableRoles: ManagedRole[]; users: ManagedUser[]; close: () => void; onSaved: (access: CreatedAccess | null) => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [roleId, setRoleId] = useState(user.role.id);
  const [supervisorId, setSupervisorId] = useState(user.supervisorId ?? "");
  const [status, setStatus] = useState(user.status);
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState(user.accessCode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selectedRole = availableRoles.find(r => r.id === roleId) ?? user.role;
  const isAgent = selectedRole.code === "AGENT";
  const link = shortLink(accessCode);

  async function regenerate() {
    setMessage("");
    const response = await fetch(`/api/users/${user.id}/access-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setAccessCode(result.accessCode);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    if (password && password.length < 12) { setSaving(false); return setMessage("La contraseña debe tener al menos 12 caracteres."); }
    const body: Record<string, unknown> = { name, email, roleId, status, tenantId };
    if (isAgent) body.supervisorId = supervisorId || null;
    if (password) body.password = password;
    const response = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.message);
    if (password) onSaved({ name: result.user.name, email: result.user.email, roleName: roleLabel(result.user.role.code, result.user.role.name), password, link: shortLink(result.user.accessCode) });
    else onSaved(null);
  }

  return <div className="detail-backdrop"><aside className="detail-panel reconciliation-modal">
    <header><h2>Editar usuario</h2><button onClick={close} aria-label="Cerrar">×</button></header>
    <form className="user-form" onSubmit={save}>
      <label>Nombre<input required value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Correo<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Rol<select required value={roleId} onChange={event => setRoleId(event.target.value)}>{availableRoles.map(role => <option key={role.id} value={role.id}>{roleLabel(role.code, role.name)}</option>)}</select></label>
      {isAgent && <label>Supervisor<select value={supervisorId} onChange={event => setSupervisorId(event.target.value)}><option value="">Seleccionar</option>{supervisorCandidates(users, user.id).map(s => <option key={s.id} value={s.id}>{s.name} ({roleLabel(s.role.code, s.role.name)})</option>)}</select></label>}
      <label>Estado<select value={status} onChange={event => setStatus(event.target.value as "ACTIVE" | "INACTIVE")}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label>
      <label>Nueva contraseña temporal (opcional)<input type="password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} placeholder="Dejar vacío para no cambiarla" /></label>
      <p className="wide" style={{ fontSize: 10, color: "#8b90a1" }}>Enlace de acceso: {link ? `${window.location.origin}${link}` : "Aún no generado"} · <button type="button" className="crm-edit" onClick={() => void regenerate()}>{accessCode ? "Regenerar" : "Generar"} enlace</button></p>
      {message && <p className="form-error">{message}</p>}
      <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
    </form>
  </aside></div>;
}

function AccessModal({ user, tenantId, close, onReset }: { user: ManagedUser; tenantId?: string; close: () => void; onReset: (access: CreatedAccess) => void }) {
  const [accessCode, setAccessCode] = useState(user.accessCode);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const link = shortLink(accessCode);
  const fullLink = link ? `${window.location.origin}${link}` : null;
  function copy() { if (!fullLink) return; void navigator.clipboard.writeText(fullLink); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }

  async function regenerate() {
    setMessage("");
    const response = await fetch(`/api/users/${user.id}/access-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message);
    setAccessCode(result.accessCode);
  }

  async function submitReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, tenantId }) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.message);
    onReset({ name: user.name, email: user.email, roleName: roleLabel(user.role.code, user.role.name), password, link });
  }

  return <div className="detail-backdrop"><aside className="detail-panel access-card">
    <header><h2>Acceso</h2><button onClick={close} aria-label="Cerrar">×</button></header>
    <div className="access-card-body">
      <div><small>NOMBRE</small><strong>{user.name}</strong></div>
      <div><small>ROL</small><strong>{roleLabel(user.role.code, user.role.name)}</strong></div>
      <div><small>CORREO</small><strong>{user.email}</strong></div>
      <div><small>URL DE ACCESO</small><strong>{fullLink ?? "Aún no generado"}</strong></div>
    </div>
    <div className="access-card-actions">
      {fullLink && <button className="secondary" onClick={copy}>Copiar enlace</button>}
      {link && <a className="secondary" href={link} target="_blank" rel="noreferrer">Abrir portal</a>}
      <button className="secondary" onClick={() => void regenerate()}>{accessCode ? "Regenerar enlace" : "Generar enlace"}</button>
      <button className="secondary" onClick={() => setResetting(true)}>Restablecer contraseña</button>
    </div>
    {copied && <p className="branding-feedback">Copiado ✓</p>}
    {resetting && <form className="user-form" onSubmit={submitReset}>
      <label>Nueva contraseña temporal<input type="password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {message && <p className="form-error">{message}</p>}
      <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Confirmar restablecimiento"}</button>
    </form>}
    {!resetting && message && <p className="form-error">{message}</p>}
  </aside></div>;
}

function Users({ tenantId }: { tenantId?: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]); const [availableRoles, setAvailableRoles] = useState<ManagedRole[]>([]);
  const [limit, setLimit] = useState(0); const [activeCount, setActiveCount] = useState(0); const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true); const [showCreate, setShowCreate] = useState(false); const [showInactive, setShowInactive] = useState(false); const [message, setMessage] = useState("");
  const [created, setCreated] = useState<CreatedAccess | null>(null);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [accessUser, setAccessUser] = useState<ManagedUser | null>(null);

  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  if (showInactive) params.set("includeInactive", "1");
  const query = params.toString() ? `?${params.toString()}` : "";
  const loadUsers = useCallback(async () => { setLoading(true); const response = await fetch(`/api/users${query}`); const result = await response.json(); if (response.ok) { setUsers(result.users); setAvailableRoles(result.roles); setLimit(result.limit); setActiveCount(result.activeCount); setCanManage(result.canManage); setMessage(""); } else setMessage(result.message); setLoading(false); }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => void loadUsers(), 0); return () => window.clearTimeout(timer); }, [loadUsers]);

  async function toggleUser(user: ManagedUser) { const response = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE", tenantId }) }); const result = await response.json(); if (!response.ok) return setMessage(result.message); await loadUsers(); }

  return <><section className="page-title"><div><span className="eyebrow">ACCESO MULTIEMPRESA</span><h1>Usuarios</h1><p>Administra el equipo dentro de los límites y roles de la empresa.</p></div>{canManage && <button className="primary" onClick={() => setShowCreate(true)}>＋ Nuevo usuario</button>}</section>
    <div className="user-summary"><div><small>USUARIOS ACTIVOS</small><strong>{activeCount} / {limit}</strong><div><i style={{ width: `${limit ? Math.min(100, activeCount / limit * 100) : 0}%` }}/></div></div><p>{activeCount >= limit ? "Has alcanzado el límite de usuarios de tu plan." : `Puedes crear ${limit - activeCount} usuario(s) más.`}</p></div>
    {showCreate && <CreateUserForm tenantId={tenantId} availableRoles={availableRoles} users={users} close={() => setShowCreate(false)} onCreated={access => { setShowCreate(false); setCreated(access); void loadUsers(); }} />}
    {created && <AccessCard title="Acceso creado correctamente" access={created} close={() => setCreated(null)} />}
    {editingUser && <EditUserModal user={editingUser} tenantId={tenantId} availableRoles={availableRoles} users={users} close={() => setEditingUser(null)} onSaved={access => { setEditingUser(null); if (access) setCreated(access); void loadUsers(); }} />}
    {accessUser && <AccessModal user={accessUser} tenantId={tenantId} close={() => setAccessUser(null)} onReset={access => { setAccessUser(null); setCreated(access); void loadUsers(); }} />}
    {message && <p className="form-error">{message}</p>}
    <label className="inactive-toggle" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#70768c" }}><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} /> Mostrar cuentas inactivas</label>
    <section className="card users-card">{loading ? <div className="empty-core">Consultando usuarios…</div> : <div className="users-table"><div className="users-row users-head"><span>Usuario</span><span>Rol</span><span>Estado</span><span>Acción</span></div>{users.map(user => <div className="users-row" key={user.id}><div><span className="user-avatar">{user.name.split(" ").map(part => part[0]).join("").slice(0,2)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div><span className="role-pill">{roleLabel(user.role.code, user.role.name)}</span><Status state={user.status === "ACTIVE" ? "operational" : "no-data"}>{user.status === "ACTIVE" ? "Activo" : "Inactivo"}</Status><div className="user-actions"><button className="secondary" disabled={!canManage} onClick={() => setEditingUser(user)}>Editar</button><button className="secondary" disabled={!canManage} onClick={() => setAccessUser(user)}>Acceso</button><button className="secondary" disabled={!canManage} onClick={() => toggleUser(user)}>{user.status === "ACTIVE" ? "Desactivar" : "Activar"}</button></div></div>)}</div>}</section></>;
}

function Guardian() {
  return <><section className="page-title"><div><span className="eyebrow">GUARDIAN V0.1 · MODO OBSERVACIÓN</span><h1>Infraestructura bajo control</h1><p>Vista simulada de salud operativa. No se ejecutan acciones sobre el servidor.</p></div><div className="live"><span/>Actualización automática</div></section>
    <section className="server-hero card"><div className="server-icon">◇</div><div><div className="server-title"><h2>{guardian.name}</h2><Status>Online</Status></div><p>{guardian.ip} · ViciBox · Última lectura {guardian.lastUpdate}</p></div><div className="observation"><span>◉</span><div><small>MODO ACTUAL</small><strong>Solo observación</strong></div></div></section>
    <div className="guardian-layout"><div><section className="metric-grid">{guardian.metrics.map(m => <article className="card metric" key={m.name}><div><span>{m.name}</span><Status state={m.state} /></div><strong>{m.display}</strong><div className={`bar bar-${m.state}`}><i style={{width:`${m.value}%`}}/></div><small>{m.name === "RAM" ? "Umbral de advertencia: 65%" : "Dentro del rango esperado"}</small></article>)}</section>
      <section className="card"><div className="card-head"><div><h2>Servicios y telefonía</h2><p>Estado simulado de componentes críticos</p></div><span className="simulated">DATOS SIMULADOS</span></div><div className="service-list">{guardian.services.map(s => <div key={s.name}><span className={`service-icon ${s.state}`}>{s.state === "no-data" ? "?" : "✓"}</span><div className="grow"><strong>{s.name}</strong><small>{s.detail}</small></div><Status state={s.state}/></div>)}</div></section></div>
      <aside><section className="card alert-card"><div className="card-head"><div><h2>Alertas</h2><p>1 activa</p></div><span className="alert-count">1</span></div><article><span>!</span><div><Status state="warning"/><h3>Uso de RAM elevado</h3><p>El consumo alcanzó 67%, por encima del umbral configurado.</p><small>Hace 8 minutos</small></div></article></section><section className="card legend"><h2>Estados</h2>{(["operational","warning","critical","no-data"] as HealthState[]).map(s => <div key={s}><Status state={s}/><small>{s === "operational" ? "Funcionamiento normal" : s === "warning" ? "Requiere atención" : s === "critical" ? "Intervención necesaria" : "Telemetría no disponible"}</small></div>)}</section></aside></div></>;
}

const moduleContent: Record<string, { title: string; description: string; features: string[]; active?: boolean }> = {
  crm: { title: "CRM", description: "El núcleo comercial de cada empresa, preparado para crecer con sus procesos.", features: ["Clientes y contactos", "Ventas y oportunidades", "Citas y seguimientos", "Campos dinámicos", "Importación Excel / CSV"], active: true },
  "call-center": { title: "Call Center", description: "Operación telefónica centralizada, lista para futuras integraciones.", features: ["Agentes y campañas", "Bases y listas", "Llamadas y resultados", "Grabaciones", "WebPhone e integraciones futuras"] },
  "sms-center": { title: "SMS Center", description: "Campañas y comunicaciones de texto desde un entorno controlado.", features: ["SMS individual y masivo", "Programación", "Plantillas y recordatorios", "Saldo y consumo", "Estados y respuestas"] },
  whatsapp: { title: "WhatsApp", description: "Canal conversacional preparado para conectar un proveedor externo.", features: ["Bandeja conversacional", "Plantillas", "Chatbot futuro", "Proveedor configurable", "Historial por cliente"] },
  reportes: { title: "Reportes", description: "Indicadores consolidados para tomar decisiones sobre la operación.", features: ["Paneles por empresa", "Indicadores modulares", "Filtros por periodo", "Exportación", "Auditoría futura"], active: true },
  configuracion: { title: "Configuración", description: "Gobierno central de la plataforma, sus permisos y parámetros.", features: ["Roles y permisos", "Catálogo de planes", "Límites de uso", "Estados de empresa", "Auditoría futura"], active: true },
};

function ModulePlaceholder({ section }: { section: SectionKey }) {
  const content = moduleContent[section];
  return <><section className="page-title"><div><span className="eyebrow">MÓDULO {content.active ? "DISPONIBLE" : "PREPARADO"}</span><h1>{content.title}</h1><p>{content.description}</p></div><span className={`availability ${content.active ? "enabled" : ""}`}>{content.active ? "Activo en Clínica Demo" : "En construcción"}</span></section><section className="placeholder card"><div className="placeholder-mark">{sections[section].icon}</div><h2>Base modular lista</h2><p>Este espacio ya forma parte de la arquitectura multiempresa. La lógica profunda y las integraciones se incorporarán en una siguiente fase.</p><div className="feature-list">{content.features.map((f,i) => <div key={f}><span>{i+1}</span><strong>{f}</strong><small>{i < 2 ? "Estructura preparada" : "Próxima fase"}</small></div>)}</div><div className="safe-note"><span>i</span><p><strong>Sin integraciones externas</strong><br/>Esta entrega no conecta proveedores ni modifica servicios reales.</p></div></section></>;
}

export function DashboardShell({ section, session, companyMode = false, crmView, adminCrmTenant = null, crmContextMissing = false }: { section: SectionKey; session: SafeSession; companyMode?: boolean; crmView?: "leads"|"customers"|"sales"|"follow-ups"|"products"|"commercial-plans"|"commissions"|"reconciliation"|"finance"|"payroll"|"commercial-management"|"promoter-space"|"promoter-followups"|"promoter-ranking"|"promoter-commissions"|"promoter-agenda"|"promoter-goals"|"promoter-profile"; adminCrmTenant?: {id:string;name:string}|null; crmContextMissing?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tenants, setTenants] = useState<CoreTenant[]>([]);
  const [plans, setPlans] = useState<CorePlan[]>([]);
  const [selectedId, setSelectedId] = useState(adminCrmTenant?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [coreError, setCoreError] = useState("");
  const loadCore = useCallback(async () => { setLoading(true); const [tenantResponse, planResponse] = await Promise.all([fetch("/api/core/tenants"), fetch("/api/core/plans")]); const tenantResult = await tenantResponse.json(); const planResult = await planResponse.json(); if (!tenantResponse.ok) setCoreError(tenantResult.message); else { setTenants(tenantResult.tenants); if (companyMode) setSelectedId(tenantResult.tenants[0]?.id || ""); setCoreError(""); } if (planResponse.ok) setPlans(planResult.plans); setLoading(false); }, [companyMode]);
  useEffect(() => { const timer = window.setTimeout(() => void loadCore(), 0); return () => window.clearTimeout(timer); }, [loadCore]);
  const selected = tenants.find(tenant => tenant.id === selectedId) ?? (companyMode ? tenants[0] : undefined);
  async function selectTenant(tenantId:string){if(companyMode){setSelectedId(tenantId);return}const response=await fetch("/api/auth/tenant-context",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId:tenantId||null})});const result=await response.json();if(!response.ok){setCoreError(result.message);return}setSelectedId(result.tenant?.id??"");setCoreError("");if(section==="crm")window.location.href="/crm/leads"}
  const crmContent=crmContextMissing?<section className="card crm-context-empty"><span>◎</span><h2>Selecciona una empresa para acceder al CRM.</h2><p>Usa el selector “Empresa seleccionada” en la parte superior. El contexto será validado antes de abrir los datos comerciales.</p></section>:crmView==="commissions"?<EconomicRulesWorkspace administrativeTenant={session.user.role==="SUPER_ADMIN"?adminCrmTenant?.name:null}/>:crmView==="reconciliation"?<ReconciliationWorkspace administrativeTenant={session.user.role==="SUPER_ADMIN"?adminCrmTenant?.name:null}/>:crmView==="finance"?<FinanceWorkspace administrativeTenant={session.user.role==="SUPER_ADMIN"?adminCrmTenant?.name:null}/>:crmView==="payroll"?<PayrollWorkspace administrativeTenant={session.user.role==="SUPER_ADMIN"?adminCrmTenant?.name:null}/>:crmView==="commercial-management"?<CommercialManagementWorkspace administrativeTenant={session.user.role==="SUPER_ADMIN"?adminCrmTenant?.name:null}/>:crmView==="promoter-space"?<PromoterSpaceWorkspace/>:crmView==="promoter-followups"?<PromoterFollowUpsWorkspace/>:crmView==="promoter-ranking"?<PromoterRankingWorkspace/>:crmView==="promoter-commissions"?<PromoterCommissionsWorkspace/>:crmView==="promoter-agenda"?<PromoterAgendaWorkspace/>:crmView==="promoter-goals"?<PromoterGoalsWorkspace/>:crmView==="promoter-profile"?<PromoterProfileWorkspace/>:crmView==="sales"||crmView==="customers"?<CrmOperationalWorkspace view={crmView} administrativeTenant={session.user.role==="SUPER_ADMIN"?adminCrmTenant?.name:null}/>:crmView?<CrmWorkspace view={crmView} administrativeTenant={session.user.role==="SUPER_ADMIN"?adminCrmTenant?.name:null}/>:<section className="card crm-context-empty"><span>◇</span><h2>No hay funciones CRM activas para esta organización.</h2><p>Un administrador puede habilitarlas desde Plantilla y Funciones CRM.</p></section>;
  return <div className="app-shell"><Sidebar section={section} crmView={crmView} open={menuOpen} close={() => setMenuOpen(false)} session={session} companyMode={companyMode} /><main><header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">☰</button><div className="breadcrumb"><span>{companyMode ? session.user.branding?.displayName??session.user.tenantName : "Panel Maestro"}</span><b>/</b><strong>{sections[section].label}</strong></div><div className="top-actions"><button aria-label="Buscar">⌕</button><button className="notification" aria-label="Notificaciones">♢<i /></button><div className="tenant"><small>{companyMode ? "Organización" : "Empresa seleccionada"}</small><select value={selectedId} onChange={event => void selectTenant(event.target.value)} disabled={companyMode || !tenants.length} aria-label="Empresa seleccionada"><option value="">{loading ? "Cargando…" : coreError ? "Contexto no disponible" : "Selecciona una empresa"}</option>{tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></div></div></header><div className="content">{section === "dashboard" ? <Dashboard tenant={selected} count={tenants.filter(tenant => tenant.status === "ACTIVE").length} coreError={coreError} companyMode={companyMode} session={session}/> : section === "empresas" ? <Companies tenants={tenants} plans={plans} selectedId={selected?.id ?? ""} loading={loading} error={coreError} onSelect={tenantId=>void selectTenant(tenantId)} reload={() => void loadCore()} canGlobal={session.user.role === "SUPER_ADMIN"}/> : section === "usuarios" ? <Users tenantId={session.user.role === "SUPER_ADMIN" ? selected?.id : undefined}/> : section === "crm" ? crmContent : section === "guardian" ? <Guardian/> : <ModulePlaceholder section={section}/>}</div><footer><span>{companyMode?(session.user.branding?.displayName??session.user.tenantName):"MentoriFY Enterprise Platform"}</span><span>{session.user.role} · {coreError ? "Core no disponible" : "Tenant aislado"}</span></footer></main></div>;
}
