"use client";
import { useState } from "react";
import { roleLandingPath } from "@/lib/role-routes";

export function ChangePasswordForm({ forced, role }: { forced: boolean; role: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: forced ? undefined : currentPassword, newPassword, confirmNewPassword }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(result.message);
    window.location.href = roleLandingPath(role);
  }

  return <main className="login-page"><section className="login-panel">
    <div className="login-copy"><span className="eyebrow">SEGURIDAD DE CUENTA</span><h1>{forced ? "Debes cambiar tu contraseña" : "Cambiar contraseña"}</h1><p>{forced ? "Tu acceso se creó con una contraseña temporal. Define una nueva antes de continuar." : "Ingresa tu contraseña actual y define una nueva."}</p></div>
    <form onSubmit={submit}>
      {!forced && <label>Contraseña actual<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>}
      <label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
      <label>Confirmar nueva contraseña<input type="password" autoComplete="new-password" minLength={12} required value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} /></label>
      {message && <p className="form-error">{message}</p>}
      <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar y continuar"}</button>
    </form>
    <small className="login-security">Mínimo 12 caracteres · La contraseña nunca se almacena en texto plano</small>
  </section></main>;
}
