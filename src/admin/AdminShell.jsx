import Brand from "../components/Brand.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { can } from "./permissions.js";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", permission: "dashboard.view", icon: "◫" },
  { href: "/admin/kullanicilar", label: "Kullanıcılar", permission: "users.view", icon: "○" },
  { href: "/admin/islemler", label: "İşlemler", permission: "transactions.view", icon: "⇄" },
  { href: "/admin/loglar", label: "Sistem logları", permission: "logs.view", icon: "≡" },
  { href: "/admin/audit", label: "Audit kayıtları", permission: "audit.view", icon: "✓" },
];

export default function AdminShell({ children, title, description }) {
  const { user } = useAuth();
  const pathname = window.location.pathname.replace(/\/$/, "") || "/admin";

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <a href="/" className="admin-brand" aria-label="VaultDrop ana sayfa"><Brand compact /></a>
        <div className="admin-product-label">YÖNETİM MERKEZİ</div>
        <nav aria-label="Admin menüsü">
          {NAV_ITEMS.filter((item) => can(user, item.permission)).map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return <a key={item.href} href={item.href} className={active ? "active" : ""}><span>{item.icon}</span>{item.label}</a>;
          })}
        </nav>
        <div className="admin-account">
          <span className="admin-avatar">{(user.displayName || user.email || "A").slice(0, 1).toUpperCase()}</span>
          <span><strong>{user.displayName || user.email}</strong><small>{user.role}</small></span>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-page-header">
          <div><p>VAULTDROP OPERASYON</p><h1>{title}</h1><span>{description}</span></div>
          <a className="admin-site-link" href="/">Siteye dön ↗</a>
        </header>
        {children}
      </main>
    </div>
  );
}
