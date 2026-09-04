import Brand from "./Brand";
import { useAuth } from "../auth/AuthContext.jsx";
import "./SiteFooter.css";

export default function SiteFooter() {
  const { user } = useAuth();
  const transferHref = user ? "/transfer" : "/giris?returnTo=/transfer";
  return (
    <footer className="site-footer">
      <div className="footer-cta section-wrap">
        <div>
          <small>HAZIRSAN BAŞLAYALIM</small>
          <h2>Dosyanı buluta değil,<br />doğrudan alıcına gönder.</h2>
        </div>
        <a className="pill-button light" href={transferHref}>
          Ücretsiz Aktarıma Başla →
        </a>
      </div>

      <div className="footer-grid section-wrap">
        <div>
          <Brand />
          <p>Hassas dosyaları sunucuya yüklemeden aktarmanın kolay yolu.</p>
        </div>
        <nav aria-label="Ürün bağlantıları">
          <b>Ürün</b>
          <a href={transferHref}>Aktarıma Başla</a>
          <a href="/paketler">Paketler</a>
          <a href="/#demo">Canlı QR</a>
          <a href="/#demo">Yakındaki Cihazlar</a>
          <a href="/#demo">VaultDrop</a>
        </nav>
        <nav aria-label="Yardım bağlantıları">
          <b>Yardım</b>
          <a href="/#demo">Nasıl Çalışır?</a>
          <a href="/sss">Sık Sorulan Sorular</a>
        </nav>
        <nav aria-label="Güven bağlantıları">
          <b>Güven</b>
          <a href="/#features">Güvenlik Yaklaşımı</a>
          <a href="/sss">Gizlilik</a>
        </nav>
      </div>

      <div className="footer-bottom section-wrap">
        © 2026 VaultDrop · Güvenli ve kontrollü belge aktarımı
      </div>
    </footer>
  );
}
