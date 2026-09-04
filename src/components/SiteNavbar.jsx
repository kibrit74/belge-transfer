import { useEffect, useState } from "react";
import Brand from "./Brand";
import { useAuth } from "../auth/AuthContext.jsx";
import MobileNavDrawer from "./MobileNavDrawer.jsx";
import "./SiteNavbar.css";

export default function SiteNavbar({ homeIcon = false }) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    document.body.classList.add("mobile-nav-open");
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("mobile-nav-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(min-width: 851px)");
    const handleChange = (event) => {
      if (event.matches) setMobileOpen(false);
    };
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  return (
    <>
    <header className="landing-nav section-wrap">
      <a href="/" aria-label="VaultDrop ana sayfa">
        <Brand />
      </a>
      <nav aria-label="Ana navigasyon">
        <a href="/#demo">Nasıl Çalışır?</a>
        <a href="/#features">Özellikler</a>
        <a href="/paketler">Paketler</a>
        <a href="/sss">SSS</a>
      </nav>
      <div className="nav-actions">
        {user ? <a className="account-link" href="/profil" aria-label="Profilim">{user.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : user.displayName.slice(0, 1)}</a> : <a className="login-link" href="/giris" aria-label="Giriş yap">Giriş</a>}
        {!homeIcon && <a className="pill-button dark" href={user ? "/transfer" : "/giris?returnTo=/transfer"}>Aktarıma Başla ↗</a>}
        {homeIcon && <a className="home-icon" href="/" aria-label="Ana sayfaya dön"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-8Z" /></svg></a>}
      </div>
      <button
        type="button"
        className={mobileOpen ? "mobile-menu-trigger active" : "mobile-menu-trigger"}
        aria-label={mobileOpen ? "Menüyü kapat" : "Menüyü aç"}
        aria-expanded={mobileOpen}
        aria-controls="mobile-navigation"
        onClick={() => setMobileOpen((open) => !open)}
      >
        <span /><span /><span />
      </button>
    </header>
    <MobileNavDrawer open={mobileOpen} user={user} homeIcon={homeIcon} onClose={() => setMobileOpen(false)} />
    </>
  );
}
