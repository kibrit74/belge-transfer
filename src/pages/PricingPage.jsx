import SiteFooter from "../components/SiteFooter.jsx";
import SiteNavbar from "../components/SiteNavbar.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { writeSelectedPlan } from "../billing/selected-plan.js";
import "./PricingPage.css";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "₺0",
    priceNote: "/ ay",
    quota: "10 MiB",
    description: "VaultDrop'u güvenle denemek ve küçük aktarımlar yapmak için.",
    features: ["Aylık 10 MiB üyelik kotası", "Misafir: tek dosya, toplam 10 MiB", "Tüm aktarım yöntemleri"],
    actionLabel: "Free ile başla",
  },
  {
    id: "standard",
    name: "Standart",
    price: "₺99",
    priceNote: "/ ay",
    quota: "50 MiB",
    description: "Düzenli kişisel kullanım için daha geniş aylık alan.",
    features: ["Aylık 50 MiB güvenli gönderim", "90 günlük işlem özeti", "Öncelikli kişisel kullanım"],
    actionLabel: "Standart ile başla",
    highlighted: true,
  },
  {
    id: "plus",
    name: "Plus",
    price: "₺199",
    priceNote: "/ ay",
    quota: "250 MiB",
    description: "Yoğun belge trafiği olan profesyoneller için.",
    features: ["Aylık 250 MiB güvenli gönderim", "Daha yoğun kullanım", "90 günlük işlem özeti"],
    actionLabel: "Plus'a geç",
  },
  {
    id: "corporate",
    name: "Kurumsal",
    price: "Teklif al",
    priceNote: "",
    quota: "1 GiB",
    description: "Ekipler ve yüksek hacimli kurumsal aktarımlar için.",
    features: ["Aylık toplam 1 GiB gönderim", "Kurumsal kullanım", "İhtiyaca uygun iletişim"],
    actionLabel: "İletişime geç",
  },
];

function getPlanHref(planId, user) {
  if (planId === "corporate") return "mailto:destek@vaultdrop.app";
  if (planId === "free") return user ? "/transfer" : "/giris?returnTo=/transfer";
  return user ? `/transfer?plan=${planId}` : `/giris?returnTo=/transfer&plan=${planId}`;
}

function PlanAction({ plan, user }) {
  const isPrimary = plan.id === "free" || plan.highlighted;
  const rememberPlan = () => {
    if (plan.id !== "corporate") writeSelectedPlan(plan.id);
  };

  return (
    <a
      className={`pricing-action${isPrimary ? " primary" : ""}`}
      href={getPlanHref(plan.id, user)}
      onClick={rememberPlan}
    >
      {plan.actionLabel}
      {plan.id !== "corporate" && <span aria-hidden="true">→</span>}
    </a>
  );
}

export default function PricingPage() {
  const { user } = useAuth();
  return (
    <div className="pricing-page">
      <SiteNavbar />
      <main>
        <section className="pricing-hero section-wrap">
          <span className="eyebrow">● AYLIK PAKETLER</span>
          <h1>İhtiyacın kadar.<br /><em>Kontrol yine sende.</em></h1>
          <p>Free paketle başla, kullanımın büyüdükçe sana uygun aylık kotaya geç. Dosya içeriğin her pakette cihazında işlenir.</p>
        </section>

        <section className="pricing-grid section-wrap" aria-label="VaultDrop paketleri">
          {PLANS.map((plan) => (
            <article
              className={`pricing-card${plan.highlighted ? " highlighted" : ""}`}
              data-testid="pricing-card"
              key={plan.id}
            >
              {plan.highlighted && <span className="pricing-badge">EN ÇOK TERCİH EDİLEN</span>}
              <div className="pricing-card-heading">
                <span className="pricing-plan-icon" aria-hidden="true">{plan.id === "corporate" ? "◇" : "●"}</span>
                <h2>{plan.name}</h2>
                <p>{plan.description}</p>
              </div>
              <div className="pricing-price">
                <strong>{plan.price}</strong>
                {plan.priceNote && <span>{plan.priceNote}</span>}
              </div>
              <div className="pricing-quota">
                <span>Aylık kota</span>
                <strong>{plan.quota}</strong>
              </div>
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <PlanAction plan={plan} user={user} />
            </article>
          ))}
        </section>

        <section className="pricing-note section-wrap">
          <span aria-hidden="true">i</span>
          <p>
            <b>Teknik sınırlar kotadan ayrıdır.</b> Paket kotası aylık olarak yenilenir. Canlı QR tek aktarımda 2 MiB, Yakındaki Cihazlar tek dosyada 100 MiB destekler. Giriş yapan üyeler tek VaultDrop paketinde en fazla 15 dosya ve toplam 50 MiB seçebilir. Misafirler tek dosya seçebilir ve toplam 10 MiB ile sınırlıdır. Plus paket ay boyunca toplam 250 MiB, Kurumsal paket toplam 1 GiB kullanım sunar. VaultDrop paketi cihazında hazırlanır; oluşan `.vdrop` paketini seçtiğin kanalla iletirsin.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
