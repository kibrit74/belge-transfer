import SiteNavbar from "../components/SiteNavbar.jsx";
import "../App.css";

export default function SecureLinkReceivePage() {
  return (
    <div className="secure-receive-page">
      <SiteNavbar homeIcon />
      <main className="secure-receive-main">
        <section className="secure-receive-card">
          <span className="eyebrow">● BAĞLANTI KALDIRILDI</span>
          <h1>Bu bağlantı yöntemi artık desteklenmiyor.</h1>
          <p>
            Gönderenden .vdrop paketi ve ayrı anahtarı isteyin; anahtar farklı bir kanaldan iletilmelidir.
          </p>
          <a className="btn-solid" href="/transfer">VaultDrop paketini al</a>
        </section>
      </main>
    </div>
  );
}
