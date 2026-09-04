import { useCallback, useState } from "react";
import AdminShell from "./AdminShell.jsx";
import { useAdminResource } from "./useAdminResource.js";

const STATUS_LABELS = { completed: "Tamamlandı", failed: "Hatalı", pending: "Bekliyor", cancelled: "İptal" };
const METHOD_LABELS = { secure_package: "VaultDrop", live_qr: "Canlı QR", nearby: "Yakındaki Cihazlar" };

export default function TransactionsPage({ api }) {
  const [filters, setFilters] = useState({ status: "", method: "", page: 1 });
  const loader = useCallback(() => api.getTransactions(filters), [api, filters]);
  const resource = useAdminResource(loader, [loader]);
  return <AdminShell title="İşlemler" description="Dosya içeriği olmadan güvenli aktarım özetlerini inceleyin.">
    <section className="admin-panel">
      <div className="admin-toolbar"><select aria-label="İşlem durumu" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Tüm durumlar</option><option value="completed">Tamamlandı</option><option value="failed">Hatalı</option><option value="pending">Bekliyor</option></select><select aria-label="Aktarım yöntemi" value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value })}><option value="">Tüm yöntemler</option><option value="secure_package">VaultDrop</option><option value="live_qr">Canlı QR</option><option value="nearby">Yakındaki Cihazlar</option></select></div>
      {resource.loading && <div className="admin-empty">İşlemler yükleniyor…</div>}
      {resource.error && <div className="admin-state error">İşlemler alınamadı.</div>}
      {!resource.loading && !resource.data?.transactions?.length && <div className="admin-empty">İşlem kaydı bulunamadı.</div>}
      {resource.data?.transactions?.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>İşlem</th><th>Kullanıcı</th><th>Yöntem</th><th>Dosya</th><th>Boyut</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>{resource.data.transactions.map((item) => <tr key={item.id}><td><code>{item.id.slice(0, 8)}</code></td><td>{item.user_email}</td><td>{METHOD_LABELS[item.method] ?? item.method}</td><td>{item.file_count}</td><td>{(Number(item.total_size_bytes) / 1024).toFixed(1)} KB</td><td><span className={`status ${item.status}`}>{STATUS_LABELS[item.status] ?? item.status}</span></td><td>{new Date(item.created_at).toLocaleString("tr-TR")}</td></tr>)}</tbody></table></div>}
    </section>
  </AdminShell>;
}
