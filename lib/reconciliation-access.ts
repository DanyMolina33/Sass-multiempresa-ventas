export function requireReconciliationRead(role:string){if(!["SUPER_ADMIN","COMPANY_ADMIN","SUPERVISOR"].includes(role))throw new Response("No tienes acceso a Liquidaciones",{status:403})}
export function requireReconciliationWrite(role:string){if(!["SUPER_ADMIN","COMPANY_ADMIN"].includes(role))throw new Response("Solo administración puede gestionar conciliaciones",{status:403})}
