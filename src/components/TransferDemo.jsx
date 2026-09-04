import { useCallback, useEffect, useState } from "react";

const STEP_DURATION_MS = 1_000;
const MOTION_TICK_MS = 80;
const LAST_STEP = 3;
const SCENES = ["live", "nearby", "package"];

function Laptop({ children, side = "left" }) {
  return (
    <div className={`demo-laptop ${side}`}>
      {children}
      <span className="laptop-base" />
    </div>
  );
}

export default function TransferDemo() {
  const [{ scene, step }, setDemoState] = useState({ scene: "live", step: 0 });
  const [motionProgress, setMotionProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const advanceDemo = useCallback(() => {
    setDemoState((current) => {
      if (current.step < LAST_STEP) return { ...current, step: current.step + 1 };

      const currentIndex = SCENES.indexOf(current.scene);
      return { scene: SCENES[(currentIndex + 1) % SCENES.length], step: 0 };
    });
  }, []);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const intervalId = window.setInterval(advanceDemo, STEP_DURATION_MS);
    return () => window.clearInterval(intervalId);
  }, [advanceDemo, isPlaying]);

  useEffect(() => {
    setMotionProgress(0);
    const hasMotion = (scene === "live" && (step === 1 || step === 2))
      || (scene === "nearby" && step === 2)
      || (scene === "package" && step === 2);
    if (!isPlaying || !hasMotion) return undefined;

    const intervalId = window.setInterval(() => {
      setMotionProgress((current) => (scene === "live" ? (current + 8) % 101 : Math.min(current + 8, 100)));
    }, MOTION_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [isPlaying, scene, step]);

  function selectScene(nextScene) {
    setIsPlaying(false);
    setMotionProgress(0);
    setDemoState({ scene: nextScene, step: 0 });
  }

  return (
    <div className="transfer-demo">
      <div className="transfer-demo-controls" aria-label="Aktarım demosu kontrolü">
        <div className="demo-scene-switch" aria-label="Demo senaryosu">
          {[
            ["live", "Canlı QR"],
            ["nearby", "Yakındaki Cihazlar"],
            ["package", "VaultDrop"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`demo-scene-button ${scene === value ? "is-selected" : ""}`}
              aria-pressed={scene === value}
              onClick={() => selectScene(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="demo-play-toggle"
          aria-pressed={isPlaying}
          onClick={() => setIsPlaying((current) => !current)}
        >
          {isPlaying ? "Animasyonu durdur" : "Animasyonu oynat"}
        </button>
      </div>

      <div
        className={`transfer-demo-stage is-step-${step}`}
        data-testid="transfer-demo-stage"
        data-scene={scene}
        data-step={step}
      >
        <article className={`transfer-demo-panel live-demo ${scene === "live" ? "is-active" : ""}`} aria-hidden={scene !== "live"}>
          <header><span>CANLI QR</span><h3>Bilgisayardan telefona</h3></header>
          <div className="device-scene">
            <Laptop>
              <b>Vault<span>Drop</span></b>
              <div className="selected-file">▤<strong>sözleşme.pdf</strong><small>Belge seçildi</small></div>
              <div className="demo-qr" />
            </Laptop>
            <div className="transfer-dash" />
            <div className="demo-phone">
              <b>Vault<span>Drop</span></b>
              <div className="scan-frame">
                <div className="phone-qr-pattern" role="img" aria-label="Telefonda taranan QR kodu">
                  <i className="scan-corner top-left" /><i className="scan-corner top-right" />
                  <i className="scan-corner bottom-left" /><i className="scan-corner bottom-right" />
                </div>
                <span className="scan-beam" data-testid="phone-scan-beam" style={{ "--motion-progress": motionProgress }} />
                <small className="scan-status">{step === 0 ? "Kamera hazır" : step === 1 ? "QR aranıyor" : "QR algılandı"}</small>
              </div>
              <div className="phone-success"><i>✓</i><strong>Dosya alındı</strong><small>sözleşme.pdf</small></div>
            </div>
          </div>
          <p>Belge seçilir → QR oluşur → telefon tarar → dosya alınır</p>
        </article>

        <article className={`transfer-demo-panel nearby-demo ${scene === "nearby" ? "is-active" : ""}`} aria-hidden={scene !== "nearby"}>
          <header><span>YAKINDAKİ CİHAZLAR</span><h3>Aynı Wi-Fi'daki iki bilgisayar</h3></header>
          <div className="device-scene">
            <Laptop>
              <b>Vault<span>Drop</span></b>
              <div className="selected-file">▤<strong>sunum.pptx</strong><small>Oda kodu: H7KM9Q</small></div>
            </Laptop>
            <div className="moving-package nearby-packet" style={{ "--motion-progress": motionProgress }}>DOĞRUDAN</div>
            <Laptop side="right">
              <b>Vault<span>Drop</span></b>
              <div className="key-entry"><small>DOĞRULAMA SÖZÜ</small><code>mavi · çınar · ırmak</code></div>
              <div className="open-success"><i>✓</i><strong>Dosya doğrulandı</strong><small>sunum.pptx hazır</small></div>
            </Laptop>
          </div>
          <p>Kod paylaşılır → sözler karşılaştırılır → dosya doğrudan gönderilir</p>
        </article>

        <article className={`transfer-demo-panel package-demo ${scene === "package" ? "is-active" : ""}`} aria-hidden={scene !== "package"}>
          <header><span>VAULTDROP</span><h3>Uzak cihazlar arasında</h3></header>
          <div className="device-scene">
            <Laptop>
              <b>Vault<span>Drop</span></b>
              <div className="selected-file">▤<strong>dosya.pdf</strong><small>Şifreleniyor</small></div>
              <div className="bta-package">◇<small>DOSYA.VDROP</small></div>
            </Laptop>
            <div className="moving-package" data-testid="moving-package" style={{ "--motion-progress": motionProgress }}>.VDROP</div>
            <Laptop side="right">
              <b>Vault<span>Drop</span></b>
              <div className="key-entry"><small>AYRI GELEN ANAHTAR</small><code>VDROP–K8M2–••••</code></div>
              <div className="open-success"><i>✓</i><strong>Şifresi açıldı</strong><small>dosya.pdf hazır</small></div>
            </Laptop>
          </div>
          <p>Belge şifrelenir → .vdrop gönderilir → anahtarla açılır</p>
        </article>
      </div>
    </div>
  );
}
