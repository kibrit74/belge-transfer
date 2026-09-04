import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { can } from "./permissions.js";

function formatBytes(value) {
  const bytes = Number(value ?? 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function UserDetailPanel({ user, onClose, onRestriction, onLimit }) {
  const { user: actor } = useAuth();
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [limitMiB, setLimitMiB] = useState(user.monthly_limit_override_bytes ? Number(user.monthly_limit_override_bytes) / 1024 ** 2 : "");

  const submitRestriction = async (event) => {
    event.preventDefault();
    const status = action === "ban" ? "banned" : action === "activate" ? "active" : "suspended";
    await onRestriction({
      status,
      restrictedUntil: status === "suspended" ? new Date(until).toISOString() : null,
      reason,
      transfersBlocked: status !== "active",
    });
  };

  const submitLimit = async (event) => {
    event.preventDefault();
    await onLimit({
      monthlyLimitOverrideBytes: limitMiB === "" ? null : Math.round(Number(limitMiB) * 1024 ** 2),
      reason,
    });
  };

  return <div className="admin-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="admin-drawer" aria-label="Kullanıcı detayı">
      <button className="admin-drawer-close" onClick={onClose} aria-label="Kapat">×</button>
      <div className="admin-user-hero"><span className="admin-avatar large">{user.display_name.slice(0, 1)}</span><div><h2>{user.display_name}</h2><p>{user.email}</p></div></div>
      <div className="admin-detail-grid">
        <span><small>Durum</small><strong className={`status ${user.status}`}>{user.status}</strong></span>
        <span><small>Rol</small><strong>{user.role}</strong></span>
        <span><small>Paket</small><strong>{user.plan}</strong></span>
        <span><small>Toplam işlem</small><strong>{user.transfer_count ?? 0}</strong></span>
        <span><small>Toplam kullanım</small><strong>{formatBytes(user.total_size_bytes)}</strong></span>
        <span><small>Özel aylık limit</small><strong>{user.monthly_limit_override_bytes ? formatBytes(user.monthly_limit_override_bytes) : "Paket limiti"}</strong></span>
      </div>
      <div className="admin-drawer-actions">
        {can(actor, "users.suspend") && <button onClick={() => setAction(user.status === "active" ? "suspend" : "activate")}>{user.status === "active" ? "Askıya al" : "Kısıtlamayı kaldır"}</button>}
        {can(actor, "users.ban") && user.status !== "banned" && <button className="danger" onClick={() => setAction("ban")}>Kullanıcıyı banla</button>}
        {can(actor, "users.limits") && <button onClick={() => setAction("limit")}>Limiti değiştir</button>}
      </div>
      {action && <form className="admin-action-form" onSubmit={action === "limit" ? submitLimit : submitRestriction}>
        <h3>{action === "ban" ? "Ban işlemini onayla" : action === "limit" ? "Aylık özel limit" : "Hesap kısıtı"}</h3>
        {action === "suspend" && <label>Askı bitişi<input aria-label="Askı bitişi" type="datetime-local" required value={until} onChange={(event) => setUntil(event.target.value)} /></label>}
        {action === "limit" && <label>Limit (MiB)<input aria-label="Limit (MiB)" type="number" min="0" value={limitMiB} onChange={(event) => setLimitMiB(event.target.value)} placeholder="Paket limitini kullanmak için boş bırak" /></label>}
        <label>İşlem gerekçesi<textarea required minLength="3" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div><button type="button" onClick={() => setAction(null)}>Vazgeç</button><button className={action === "ban" ? "danger" : "primary"} type="submit">{action === "ban" ? "Banı uygula" : "Kaydet"}</button></div>
      </form>}
    </aside>
  </div>;
}
