import { FILE_TYPES } from "../content/landingContent";

export default function SupportedFiles() {
  return (
    <section className="landing-section supported-section reveal-section" id="files">
      <div className="section-wrap">
        <div className="split-heading">
          <div>
            <span className="eyebrow">● DESTEKLENEN DOSYALAR</span>
            <h2>Dosya türü fark etmez.</h2>
          </div>
          <p>Belgelerden görsellere, UYAP dosyalarından arşivlere kadar tüm dosya türlerini aktar. Giriş yapan üyeler tek VaultDrop paketinde en fazla 15 dosyayı toplam 50 MiB'a kadar seçebilir. Misafirler tek dosya ve toplam 10 MiB ile kullanabilir.</p>
        </div>
        <div className="file-type-grid">
          {FILE_TYPES.map((file) => (
            <article className="file-type-card" key={file.extension}>
              <span className={`file-type-icon tone-${file.tone}`}>{file.extension}</span>
              <span><strong>{file.title}</strong><small>{file.detail}</small></span>
            </article>
          ))}
        </div>
        <p className="section-note"><strong>Bu listeyle sınırlı değil:</strong> VaultDrop dosya türünü değiştirmeden byte düzeyinde aktarır.</p>
      </div>
    </section>
  );
}
