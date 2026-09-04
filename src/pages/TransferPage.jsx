import { lazy, Suspense, useMemo, useState } from "react";
import SiteNavbar from "../components/SiteNavbar";
import ReceiveMethodSelector from "../ReceiveMethodSelector";
import TransferMethodSelector from "../TransferMethodSelector";
import "../App.css";
import { useAuth } from "../auth/AuthContext.jsx";
import { getFeatureFlags } from "../config/feature-flags.js";
import { readNearbyInviteCode } from "../nearby/invite-link.js";
import { getEffectiveMethodRegistry } from "../transfer/method-registry.js";
import { useMethodHandoff } from "../transfer/use-method-handoff.js";

const SendPanel = lazy(() => import("../SendPanel.jsx"));
const ReceivePanel = lazy(() => import("../ReceivePanel.jsx"));
const NearbyTransferPanel = lazy(() => import("../NearbyTransferPanel.jsx"));
const SecurePackagePanel = lazy(() => import("../SecurePackagePanel.jsx"));

export default function TransferPage() {
  const { user } = useAuth();
  const methods = useMemo(() => getEffectiveMethodRegistry(getFeatureFlags()), []);
  const initialInviteCode = useMemo(() => readNearbyInviteCode(window.location.search), []);
  const hasNearbyInviteParameter = useMemo(
    () => new URLSearchParams(window.location.search).has("nearby"),
    [],
  );
  const invalidNearbyInvite = hasNearbyInviteParameter && !initialInviteCode;
  const nearbyEnabled = methods.some((method) => method.id === "nearby" && method.enabled);
  const startsFromNearbyInvite = Boolean(initialInviteCode && nearbyEnabled);
  const [mode, setMode] = useState(startsFromNearbyInvite ? "receive" : "send");
  const [sendMethod, setSendMethod] = useState("package");
  const [receiveMethod, setReceiveMethod] = useState(startsFromNearbyInvite ? "nearby" : "package");
  const [packageInitialFile, setPackageInitialFile] = useState(null);
  const { requestHandoff, consumeHandoff } = useMethodHandoff();
  const disabledMethods = methods.filter((method) => !method.enabled).map((method) => method.id);
  const liveMaxBytes = methods.find((method) => method.id === "live").maxBytes;

  function changeSendMethod(nextMethod) {
    if (nextMethod !== "package") setPackageInitialFile(null);
    setSendMethod(nextMethod);
  }

  function handoffToVaultDrop(from, file, reason) {
    requestHandoff({ from, to: "package", reason, file });
    setPackageInitialFile(consumeHandoff("package"));
    setSendMethod("package");
  }

  return (
    <div className="transfer-page">
      <SiteNavbar homeIcon />

      <main className="transfer-main">
        <div className="transfer-intro">
          <span className="eyebrow">● DOSYA İÇERİĞİ SUNUCUYA YÜKLENMEZ</span>
          <h1>Güvenli dosya aktarımı</h1>
          <p>Dosyaların cihazında işlenir; aktarım yöntemini seç ve hemen başla.</p>
        </div>

        <section className="transfer-shell">
          <nav className="tabs" aria-label="Ana işlem">
            <button
              type="button"
              className={mode === "send" ? "tab active" : "tab"}
              onClick={() => setMode("send")}
            >
              Gönder
            </button>
            <button
              type="button"
              className={mode === "receive" ? "tab active" : "tab"}
              onClick={() => setMode("receive")}
            >
              Al
            </button>
          </nav>

          {invalidNearbyInvite && (
            <p className="transfer-inline-error" role="alert">
              Yakındaki Cihazlar davet bağlantısı geçersiz. Yeni bir davet iste.
            </p>
          )}

          {mode === "send" ? (
            <>
              <TransferMethodSelector
                activeMethod={sendMethod}
                onChange={changeSendMethod}
                methods={methods}
                disabledMethods={disabledMethods}
              />
              <Suspense fallback={<p role="status">Yöntem hazırlanıyor…</p>}>
                {sendMethod === "live" && (
                  <SendPanel
                    key="live-send"
                    user={user}
                    maxInputBytes={liveMaxBytes}
                    onVaultDrop={(file) => handoffToVaultDrop("live", file, "Canlı QR tamamlanamadı")}
                  />
                )}
                {sendMethod === "nearby" && (
                  <NearbyTransferPanel
                    key="nearby-send"
                    mode="send"
                    user={user}
                    onVaultDrop={(file) => handoffToVaultDrop("nearby", file, "Doğrudan bağlantı kurulamadı")}
                  />
                )}
                {sendMethod === "package" && (
                  <SecurePackagePanel
                    key="package-send"
                    view="create"
                    user={user}
                    initialFile={packageInitialFile}
                  />
                )}
              </Suspense>
            </>
          ) : (
            <>
              <ReceiveMethodSelector
                activeMethod={receiveMethod}
                onChange={setReceiveMethod}
                methods={methods}
                disabledMethods={disabledMethods}
              />
              <Suspense fallback={<p role="status">Yöntem hazırlanıyor…</p>}>
                {receiveMethod === "package" && <SecurePackagePanel key="package-receive" view="open" user={user} />}
                {receiveMethod === "live" && <ReceivePanel key="live-receive" />}
                {receiveMethod === "nearby" && (
                  <NearbyTransferPanel
                    key="nearby-receive"
                    mode="receive"
                    user={user}
                    initialCode={initialInviteCode}
                  />
                )}
              </Suspense>
            </>
          )}
        </section>

        <p className="transfer-footnote">
          Canlı QR yan yana cihazlar, Yakındaki Cihazlar aynı ağdaki bilgisayarlar, VaultDrop uzak gönderimler içindir.
        </p>
      </main>
    </div>
  );
}
