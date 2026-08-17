export function requireFinanceRead(role:string){if(!["SUPER_ADMIN","COMPANY_ADMIN","SUPERVISOR"].includes(role))throw new Response("No tienes acceso a Finanzas",{status:403})}
export function requireFinanceWrite(role:string){if(!["SUPER_ADMIN","COMPANY_ADMIN"].includes(role))throw new Response("Solo administración puede registrar movimientos financieros",{status:403})}
