import { useMemo, useState } from "react";
import FaqList from "../components/FaqList";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import { FAQ_ITEMS } from "../content/faqContent";
import "./FaqPage.css";

const CATEGORIES = [
  ["all", "Tümü"],
  ["general", "Genel"],
  ["security", "Güvenlik"],
  ["usage", "Kullanım"],
  ["technical", "Teknik"],
];

export default function FaqPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const items = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase("tr").trim();

    return FAQ_ITEMS.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const searchableText = `${item.question} ${item.answer}`.toLocaleLowerCase("tr");
      return matchesCategory && searchableText.includes(normalizedQuery);
    });
  }, [category, query]);

  return (
    <div className="faq-page">
      <SiteNavbar />

      <main>
        <section className="faq-hero section-wrap">
          <span className="eyebrow">● YARDIM MERKEZİ</span>
          <h1>Soruların.<br /><em>Cevapları.</em></h1>
          <p>
            VaultDrop&apos;un çalışma biçimi, güvenliği ve aktarım yöntemleri
            hakkında bilmen gerekenler.
          </p>
          <label>
            <input
              aria-label="Sorularda ara"
              type="search"
              placeholder="Sorularda ara…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span aria-hidden="true">⌕</span>
          </label>
        </section>

        <nav className="faq-filters section-wrap" aria-label="SSS kategorileri">
          {CATEGORIES.map(([value, label]) => {
            const isActive = category === value;
            return (
              <button
                key={value}
                type="button"
                className={isActive ? "active" : ""}
                aria-pressed={isActive}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <section className="faq-results section-wrap" aria-live="polite">
          {items.length > 0 ? (
            <FaqList items={items} />
          ) : (
            <p className="faq-empty">Aramana uygun soru bulunamadı.</p>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
