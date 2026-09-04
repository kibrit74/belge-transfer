import { useState } from "react";
import SecurePackagePanel from "./SecurePackagePanel.jsx";
import VideoTransferPanel from "./VideoTransferPanel.jsx";

export default function MobileSharePanel({ user }) {
  const [method, setMethod] = useState("package");

  return (
    <section className="mobile-share-panel" aria-labelledby="mobile-share-title">
      <header className="mobile-share-heading">
        <span className="eyebrow">● MOBİLDEN MOBİLE</span>
        <h2 id="mobile-share-title">Özel dosyanı cihazında hazırla.</h2>
        <p>Şifreli paket veya QR Video oluştur; VaultDrop sunucusuna dosya yüklenmez.</p>
      </header>
      <div className="mobile-methods" aria-label="Mobil paylaşım yöntemi">
        <button
          type="button"
          className={method === "package" ? "mobile-method active" : "mobile-method"}
          aria-pressed={method === "package"}
          onClick={() => setMethod("package")}
        >
          <span><strong>VaultDrop paketi</strong><small>.vdrop cihazında hazırlanır</small></span>
        </button>
        <button
          type="button"
          className={method === "video" ? "mobile-method active" : "mobile-method"}
          aria-pressed={method === "video"}
          onClick={() => setMethod("video")}
        >
          <span><strong>QR Video</strong><small>Şifreli QR karelerini videoya dönüştür</small></span>
        </button>
      </div>
      {method === "package"
        ? <SecurePackagePanel view="create" user={user} />
        : <VideoTransferPanel view="create" user={user} />}
    </section>
  );
}
