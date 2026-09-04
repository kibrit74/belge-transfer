import { useEffect, useState } from "react";
import { apiRequest } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { readSelectedPlan } from "../billing/selected-plan.js";
import SiteNavbar from "../components/SiteNavbar.jsx";
import { getPlanLabel, getPlanLimitBytes, normalizePlan } from "../../shared/plan-policy.js";
import "./MemberPages.css";

const METHOD_LABELS = {
  live_qr: "Canlı QR",
  nearby: "Yakındaki Cihazlar",
  secure_package: "VaultDrop",
  qr_video: "Eski QR Video kaydı",
};

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  const mebibytes = bytes / 1024 ** 2;
  return `${Number.isInteger(mebibytes) ? mebibytes : mebibytes.toFixed(1)} MiB`;
}

function ProfileIcon({ type }) {
  const paths = {
    transfers: <><path d="M8 7h11l-3-3" /><path d="m19 7-3 3" /><path d="M16 17H5l3 3" /><path d="m5 17 3-3" /></>,
    files: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /><path d="M9 13h6M9 17h6" /></>,
    storage: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[type]}
    </svg>
  );
}

function resolveVisiblePlan(summary, user) {
  return normalizePlan(summary?.plan ?? readSelectedPlan() ?? user?.plan);
}

export default function ProfilePage() {
  const { user, status, logout = async () => {} } = useAuth();
  const [summary, setSummary] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [summaryStatus, setSummaryStatus] = useState("loading");
  const activePlan = resolveVisiblePlan(summary, user);
  const activePlanLabel = getPlanLabel(activePlan);
  const monthlyUsed = Math.max(0, Number(summary?.monthly_used_bytes ?? 0));
  const monthlyLimit = Math.max(1, Number(summary?.monthly_limit_bytes ?? getPlanLimitBytes(activePlan)));
  const usagePercent = Math.min(100, (monthlyUsed / monthlyLimit) * 100);
  const monthlyUsageText = `${formatBytes(monthlyUsed)} / ${formatBytes(monthlyLimit)}`;
  const renewalDate = summary?.period_end ? new Date(summary.period_end).toLocaleDateString("tr-TR", {
    day: "numeric", month: "long", timeZone: "UTC",
  }) : "";
  const usageNote = summary
    ? `${renewalDate}’de yenilenir`
    : summaryStatus === "error"
      ? "Canlı kullanım verisi yok; seçili paket kotası gösteriliyor."
      : "Paket kullanımın güvenli biçimde hesaplanıyor.";

  useEffect(() => {
    if (!user || typeof fetch === "undefined") return;
    Promise.all([apiRequest("/api/profile/summary"), apiRequest("/api/profile/transfers")])
      .then(([summaryData, transferData]) => {
        setSummary(summaryData);
        setTransfers(transferData.transfers ?? []);
        setSummaryStatus("ready");
      })
      .catch(() => setSummaryStatus("error"));
  }, [user]);

  if (status === "loading") return <div className="member-page"><SiteNavbar /><main className="profile-loading">Profil yükleniyor…</main></div>;
  if (!user) return <div className="member-page"><SiteNavbar /><main className="member-card access-card"><h1>Profil için giriş yap</h1><p>İşlem geçmişini görmek ve çoklu dosya kullanmak için hesabına giriş yap.</p><a className="pill-button accent" href="/giris">Giriş yap</a></main></div>;

  return (
    <div className="member-page profile-page">
      <SiteNavbar />
      <main className="profile-layout section-wrap">
        <header className="profile-heading">
          <div className="profile-avatar-ring">
            <div className="profile-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : user.displayName.slice(0, 1)}</div>
          </div>
          <div className="profile-identity"><span className="eyebrow">● PROFİLİM</span><h1>{user.displayName}</h1><p>{user.email}</p></div>
          <button type="button" className="quiet-button" onClick={logout}>Çıkış yap</button>
        </header>

        <section className="limit-banner" aria-labelledby="member-limit-title">
          <div className="limit-copy">
            <span className="limit-kicker">{`AYLIK KULLANIM · ${activePlanLabel.toLocaleUpperCase("tr-TR")}`}</span>
            <span className="current-plan-pill">{`Seçili paket: ${activePlanLabel}`}</span>
            <b id="member-limit-title">{monthlyUsageText}</b>
            <span>{usageNote}</span>
          </div>
          <div className="limit-meter">
            <div className="limit-meter-label"><span>Aylık kota</span><strong>{`%${Math.round(usagePercent)}`}</strong></div>
            <div className={`limit-progress${usagePercent >= 100 ? " is-full" : ""}`} role="progressbar" aria-label="Aylık veri kullanımı" aria-valuemin="0" aria-valuemax={monthlyLimit} aria-valuenow={monthlyUsed} aria-valuetext={monthlyUsageText}>
              <span style={{ width: `${usagePercent}%` }} />
            </div>
          </div>
          <a className="profile-transfer-cta" href="/transfer">Yeni aktarım <span aria-hidden="true">→</span></a>
        </section>
        <section className="summary-grid" aria-label="Aktarım özeti">
          <article><span className="summary-icon" data-testid="profile-stat-icon"><ProfileIcon type="transfers" /></span><span>Toplam aktarım</span><strong>{summary?.transfer_count ?? 0}</strong></article>
          <article><span className="summary-icon" data-testid="profile-stat-icon"><ProfileIcon type="files" /></span><span>Aktarılan dosya</span><strong>{summary?.file_count ?? 0}</strong></article>
          <article><span className="summary-icon" data-testid="profile-stat-icon"><ProfileIcon type="storage" /></span><span>Toplam boyut</span><strong>{formatBytes(Number(summary?.total_size_bytes ?? 0))}</strong></article>
        </section>
        <section className="history-card">
          <div className="history-heading"><span className="eyebrow">● SON 90 GÜN</span><h2>İşlem geçmişi</h2><p>Son aktarımlarını ve dosya ayrıntılarını tek yerde takip et.</p></div>
          {transfers.length === 0 ? <div className="empty-history"><span className="empty-history-icon"><ProfileIcon type="history" /></span><b>İlk güvenli aktarımını oluştur</b><span>Aktarımını tamamladığında yöntem, tarih ve boyut özeti burada görünecek.</span><a href="/transfer">İlk aktarımı başlat <span aria-hidden="true">→</span></a></div> : (
            <div className="history-list">{transfers.map((item) => <article key={item.id}><div><b>{METHOD_LABELS[item.method]}</b><span>{new Date(item.created_at).toLocaleString("tr-TR")}</span></div><span>{item.file_count} dosya</span><span>{formatBytes(Number(item.total_size_bytes))}</span><em>{item.status === "completed" ? "Tamamlandı" : "Başarısız"}</em></article>)}</div>
          )}
        </section>
      </main>
    </div>
  );
}
