import { useCallback, useState } from "react";
import AdminShell from "./AdminShell.jsx";
import UserDetailPanel from "./UserDetailPanel.jsx";
import { useAdminResource } from "./useAdminResource.js";

export default function UsersPage({ api }) {
  const [filters, setFilters] = useState({ search: "", status: "", role: "", page: 1 });
  const [selected, setSelected] = useState(null);
  const loader = useCallback(() => api.getUsers(filters), [api, filters]);
  const resource = useAdminResource(loader, [loader]);

  const inspect = async (user) => {
    const detail = await api.getUser(user.id);
    setSelected(detail.user);
  };
  const mutate = async (method, payload) => {
    await method(selected.id, payload);
    setSelected(null);
    await resource.reload();
  };

  return <AdminShell title="Kullanıcılar" description="Hesapları görüntüleyin, kısıtları ve özel limitleri yönetin.">
    <section className="admin-panel">
      <div className="admin-toolbar">
        <label className="admin-search"><span>⌕</span><input aria-label="Kullanıcı ara" placeholder="Ad veya e-posta ara" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
        <select aria-label="Durum filtresi" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Tüm durumlar</option><option value="active">Aktif</option><option value="suspended">Askıda</option><option value="banned">Banlı</option></select>
        <select aria-label="Rol filtresi" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option value="">Tüm roller</option><option value="user">User</option><option value="support">Support</option><option value="analyst">Analyst</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select>
      </div>
      {resource.loading && <div className="admin-empty">Kullanıcılar yükleniyor…</div>}
      {resource.error && <div className="admin-state error">Kullanıcılar alınamadı. <button onClick={resource.reload}>Tekrar dene</button></div>}
      {!resource.loading && resource.data?.users?.length === 0 && <div className="admin-empty">Bu filtrelere uygun kullanıcı bulunamadı.</div>}
      {resource.data?.users?.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Kullanıcı</th><th>Paket</th><th>Rol</th><th>Durum</th><th>Kayıt</th><th /></tr></thead><tbody>{resource.data.users.map((user) => <tr key={user.id}>
        <td><strong>{user.display_name}</strong><small>{user.email}</small></td><td>{user.plan}</td><td>{user.role}</td><td><span className={`status ${user.status}`}>{user.status}</span></td><td>{new Date(user.created_at).toLocaleDateString("tr-TR")}</td><td><button className="table-action" aria-label={`${user.display_name} kullanıcısını incele`} onClick={() => inspect(user)}>İncele →</button></td>
      </tr>)}</tbody></table></div>}
      {resource.data && <p className="admin-result-count">{resource.data.total ?? 0} kullanıcı</p>}
    </section>
    {selected && <UserDetailPanel user={selected} onClose={() => setSelected(null)} onRestriction={(payload) => mutate(api.updateRestriction, payload)} onLimit={(payload) => mutate(api.updateLimit, payload)} />}
  </AdminShell>;
}
