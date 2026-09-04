import { useAuth } from "../auth/AuthContext.jsx";
import AdminApp from "./AdminApp.jsx";

const ADMIN_VIEW_PERMISSIONS = new Set([
  "dashboard.view",
  "users.view",
  "transactions.view",
  "logs.view",
  "audit.view",
]);

export default function AdminRoute({ AdminComponent = AdminApp }) {
  const { user, status } = useAuth();

  if (status === "loading") {
    return <main className="admin-gate">Yetkiler kontrol ediliyor…</main>;
  }

  const canViewAdmin = user?.permissions?.some((permission) =>
    permission === "*" || ADMIN_VIEW_PERMISSIONS.has(permission));

  if (!canViewAdmin) {
    return (
      <main className="admin-gate">
        <span>403</span>
        <h1>Bu alan için yetkiniz yok.</h1>
        <p>Admin paneline erişim için yetkili bir hesapla giriş yapın.</p>
        <a href="/">Ana sayfaya dön</a>
      </main>
    );
  }

  return <AdminComponent />;
}
