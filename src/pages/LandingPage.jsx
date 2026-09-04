import { useEffect, useState } from "react";
import Brand from "../components/Brand";
import FaqList from "../components/FaqList";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import SupportedFiles from "../components/SupportedFiles";
import TransferDemo from "../components/TransferDemo";
import { LANDING_FAQS } from "../content/landingContent";
import "./LandingPage.css";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (!("IntersectionObserver" in window)) return () => window.removeEventListener("scroll", onScroll);
    document.documentElement.classList.add("has-motion");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible"));
    }, { threshold: 0.1 });
    document.querySelectorAll(".reveal-section").forEach((item) => observer.observe(item));
    return () => { observer.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <div className="landing-page">
      <SiteNavbar />

      <main>
        <section className="hero-section section-wrap">
          <div className="hero-copy"><span className="eyebrow badge">● DOSYA İÇERİĞİ CİHAZINDA KALIR</span><h1>Belgelerin.<br />Kontrolün.<br /><em>Sende.</em></h1><p>Hassas dosyalarını aracı bir depolama sunucusuna yüklemeden, şifreli ve kontrollü biçimde aktar. Ücretsiz hesabınla doğrudan tarayıcında başla.</p><div className="hero-actions"><a className="pill-button accent" href="/giris?returnTo=/transfer">Ücretsiz Aktarıma Başla →</a><a href="#demo">Nasıl çalışır?</a></div><div className="hero-checks"><span>✓ Kurulum yok</span><span>✓ Ücretsiz hesap</span><span>✓ Dosya yükleme yok</span></div></div>
          <div className="hero-product"><div className="hero-blob" /><div className="product-window"><div className="window-bar"><i /><i /><i /><small>app.vaultdrop</small></div><div className="product-body"><Brand compact /><p>Dosyaların cihazında işlenir; aktarım yöntemini seç ve hemen başla.</p><div className="mock-tabs"><b>Gönder</b><span>Al</span></div><div className="mock-methods"><b>Canlı QR<small>Yan yana cihazlar</small></b><b>Yakındaki Cihazlar<small>Aynı Wi-Fi'daki tarayıcılar</small></b><b>VaultDrop<small>Uzak veya hassas dosyalar</small></b></div><div className="mock-drop"><strong>Dosya seç</strong><small>PDF, UDF, DOCX, fotoğraf veya başka bir format</small></div></div></div><aside className="product-chip top">✓ Cihazında işlenir<small>Dosya içeriği sunucuya gitmez</small></aside><aside className="product-chip bottom">AES-256-GCM<small>Modern şifreleme</small></aside></div>
          <a className="scroll-more" href="#demo">↓ Devamını keşfet</a>
        </section>

        <section className="trust-strip"><div className="section-wrap"><span>DOSYA İÇERİĞİ CİHAZINDA</span><span>AES-256 ŞİFRELEME</span><span>ÜCRETSİZ HESAP</span><span>TARAYICIDA ÇALIŞIR</span></div></section>

        <section className="landing-section section-wrap reveal-section" id="demo"><div className="split-heading"><div><span className="eyebrow">● AKTARIM SÜRECİ</span><h2>Nasıl çalıştığını<br />adım adım gör.</h2></div></div><TransferDemo /></section>

        <section className="landing-section section-wrap reveal-section"><span className="eyebrow">● ÜÇ BASİT ADIM</span><h2>Dosyanı seç.<br />Güvenle aktar.</h2><div className="step-grid">{[["01","▣","Dosyanı seç","Belgen cihazında kalır; yükleme yapılmadan işleme hazırlanır."],["02","⌁","Yöntemini belirle","Yan yanaysa Canlı QR, aynı Wi-Fi'daysa Yakındaki Cihazlar, uzaktaysa VaultDrop kullan."],["03","✓","Güvenle teslim et","Alıcı doğrulaması tamamlanmadan indirme veya başarı oluşmaz."]].map(([n,i,t,d])=><article key={n}><small>({n})</small><i>{i}</i><h3>{t}</h3><p>{d}</p></article>)}</div></section>

        <SupportedFiles />

        <section className="feature-section reveal-section" id="features"><div className="section-wrap"><div className="split-heading"><div><span className="eyebrow">● NEDEN VAULTDROP?</span><h2>Gizlilik,<br />ek özellik değil.</h2></div><p>Sistemin temeli, dosya içeriğinin aktarım veya tanıştırma sunucusuna yüklenmemesi ve kontrolün sende kalmasıdır.</p></div><div className="feature-grid">{[["⌂","Yerel dosya işlemi","Dosya seçme, doğrulama ve şifreleme tarayıcında yapılır."],["◇","Güçlü şifreleme","VaultDrop AES-256-GCM, Yakındaki Cihazlar WebRTC DTLS kullanır."],["↗","Doğru yöntem","Yan yana, aynı ağ ve uzak gönderimler için ayrı stabil yollar."],["◎","Ücretsiz hesap","Google ile giriş yap, Free paketinle hemen kullanmaya başla."]].map(([i,t,d])=><article key={t}><i>{i}</i><h3>{t}</h3><p>{d}</p></article>)}</div></div></section>

        <section className="landing-section section-wrap faq-section reveal-section" id="sss"><div className="faq-intro"><span className="eyebrow">● SIK SORULAN SORULAR</span><h2>Merak ettiğin<br />her şey.</h2><p>VaultDrop'un çalışma biçimi ve güvenliğiyle ilgili en sık sorulan sorular.</p><a href="/sss">Tüm soruları incele →</a></div><FaqList items={LANDING_FAQS} /></section>
      </main>

      <SiteFooter />
      <button className={`back-top ${scrolled ? "visible" : ""}`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Sayfanın başına dön">↑</button>
    </div>
  );
}
