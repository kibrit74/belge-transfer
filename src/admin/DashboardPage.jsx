import { useAuth } from "../auth/AuthContext.jsx";
import AdminShell from "./AdminShell.jsx";
import { can } from "./permissions.js";
import { useAdminResource } from "./useAdminResource.js";

const CARDS = [
  ["total_users", "Toplam kullanıcı", "Tüm kayıtlı hesaplar"],
  ["active_users", "Aktif kullanıcı", "Kısıtlaması olmayan hesaplar"],
  ["restricted_users", "Kısıtlı hesap", "Askıya alınan veya banlı"],
  ["total_transfers", "Toplam işlem", "Kayıtlı aktarım özetleri"],
  ["completed_transfers", "Başarılı işlem", "Tamamlanan aktarımlar"],
  ["failed_transfers", "Hatalı işlem", "Başarısız aktarımlar"],
  ["errors_24h", "Son 24 saat hata", "Sistem loglarındaki hatalar"],
];

export default function DashboardPage({ api }) {
  const { user } = useAuth();
  const dashboard = useAdminResource(() => api.getDashboard(), [api]);
  const audit = useAdminResource(
    () => can(user, "audit.view") ? api.getAuditLogs({ pageSize: 6 }) : Promise.resolve({ logs: [] }),
    [api, user],
  );

  return (
    <AdminShell title="Genel bakış" description="Kullanıcı ve aktarım sisteminin güncel özeti.">
      {dashboard.loading && <div className="admin-state">Dashboard yükleniyor…</div>}
      {dashboard.error && <div className="admin-state error">Dashboard alınamadı. <button onClick={dashboard.reload}>Tekrar dene</button></div>}
      {dashboard.data && <section className="admin-metric-grid">{CARDS.map(([key, label, helper]) => (
        <article key={key} className={key === "errors_24h" ? "admin-metric alert" : "admin-metric"}>
          <span>{label}</span><strong>{dashboard.data[key] ?? 0}</strong><small>{helper}</small>
        </article>
      ))}</section>}
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p>SON HAREKETLER</p><h2>Admin aktiviteleri</h2></div><a href="/admin/audit">Tümünü gör</a></div>
        {audit.loading && <div className="admin-empty">Aktiviteler yükleniyor…</div>}
        {!audit.loading && !audit.data?.logs?.length && <div className="admin-empty">Henüz bir admin aktivitesi yok.</div>}
        {audit.data?.logs?.map((item) => <div className="admin-activity" key={item.id}>
          <span className="admin-activity-mark" /><div><strong>{item.action}</strong><small>{item.actor_email}</small></div>
          <time>{new Date(item.created_at).toLocaleString("tr-TR")}</time>
        </div>)}
      </section>
    </AdminShell>
  );
}
