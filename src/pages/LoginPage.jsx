import { useState } from "react";
import Brand from "../components/Brand.jsx";
import SiteNavbar from "../components/SiteNavbar.jsx";
import { authClient, getGoogleSignInOptions } from "../auth/neon-client.js";
import "./MemberPages.css";

export default function LoginPage() {
  const [isStarting, setIsStarting] = useState(false);
  const [localError, setLocalError] = useState("");
  const searchParams = new URLSearchParams(window.location.search);
  const hasError = localError || searchParams.has("error");
  const returnPath = searchParams.get("returnTo") || "/profil";

  async function startGoogleLogin() {
    if (!authClient) {
      setLocalError("Giriş sistemi henüz yapılandırılmadı.");
      return;
    }
    setIsStarting(true);
    setLocalError("");
    try {
      const result = await authClient.signIn.social(
        getGoogleSignInOptions(returnPath),
      );
      if (result?.error) throw new Error(result.error.message);
    } catch {
      setLocalError("Google girişi başlatılamadı. Lütfen yeniden deneyin.");
      setIsStarting(false);
    }
  }

  return (
    <div className="member-page">
      <SiteNavbar />
      <main className="login-layout section-wrap">
        <section className="member-card login-card">
          <span className="eyebrow">● VAULTDROP HESABI</span>
          <Brand />
          <h1>Aktarımlarını tek yerde gör.</h1>
          <p>Google ile giriş yap; çoklu dosya aktarımını kullan ve son 90 günlük işlem özetlerini takip et.</p>
          {hasError && <p className="member-error">Google girişi tamamlanamadı. Lütfen yeniden deneyin.</p>}
          <button className="google-button" type="button" onClick={startGoogleLogin} disabled={isStarting}>
            <span aria-hidden="true">G</span> {isStarting ? "Google açılıyor…" : "Google ile devam et"}
          </button>
          <small>Dosyaların ve dosya adların sunucuya kaydedilmez.</small>
        </section>
        <aside className="login-benefits">
          <article>
            <span className="benefit-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M7 3.5h7l3 3v14H7z" /><path d="M14 3.5v4h4M4 7v13.5h10" /></svg>
            </span>
            <span className="benefit-copy"><b>15 dosyaya kadar</b><span>VaultDrop ile tek pakette çoklu seçim.</span></span>
          </article>
          <article>
            <span className="benefit-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.5 2M5.5 5.5 3.5 7.8" /></svg>
            </span>
            <span className="benefit-copy"><b>90 günlük özet</b><span>Yöntem, tarih, boyut ve durum bilgisi.</span></span>
          </article>
          <article>
            <span className="benefit-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="4" /><path d="m8.5 12 2.3 2.3 4.8-5M9 17.5h6" /></svg>
            </span>
            <span className="benefit-copy"><b>İçerik daima sende</b><span>Dosya içeriği tarayıcında işlenmeye devam eder.</span></span>
          </article>
        </aside>
      </main>
    </div>
  );
}
