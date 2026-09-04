import AdminShell from "./AdminShell.jsx";
import { useAdminResource } from "./useAdminResource.js";

export default function LogsPage({ api, audit = false }) {
  const resource = useAdminResource(
    () => audit ? api.getAuditLogs({ pageSize: 50 }) : api.getLogs({ pageSize: 50 }),
    [api, audit],
  );
  const logs = resource.data?.logs ?? [];
  return <AdminShell title={audit ? "Audit kayıtları" : "Sistem logları"} description={audit ? "Admin işlemlerinin değiştirilemez geçmişi." : "Uygulama olaylarını ve hata kodlarını takip edin."}>
    <section className="admin-panel">
      {resource.loading && <div className="admin-empty">Kayıtlar yükleniyor…</div>}
      {resource.error && <div className="admin-state error">Kayıtlar alınamadı.</div>}
      {!resource.loading && logs.length === 0 && <div className="admin-empty">Henüz bir kayıt bulunmuyor.</div>}
      <div className="admin-log-list">{logs.map((item) => <article className="admin-log" key={item.id}>
        <span className={`log-level ${item.level ?? "audit"}`}>{item.level ?? "audit"}</span>
        <div><div><strong>{audit ? item.action : item.category}</strong>{item.error_code && <code>{item.error_code}</code>}</div><p>{audit ? `${item.actor_email} → ${item.target_type}${item.target_id ? ` / ${item.target_id}` : ""}` : item.message}</p>{item.reason && <small>{item.reason}</small>}</div>
        <time>{new Date(item.created_at).toLocaleString("tr-TR")}</time>
      </article>)}</div>
    </section>
  </AdminShell>;
}
