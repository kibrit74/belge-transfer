# VaultDrop Landing Page ve Transfer Arayüzü Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut belge aktarım işlevlerini koruyarak VaultDrop markalı landing page, `/transfer` uygulama sayfası ve `/sss` yardım sayfası oluşturmak.

**Architecture:** React kök bileşeni URL yolunu küçük bir saf fonksiyonla çözecek ve üç sayfadan birini gösterecek. Landing ve SSS içerikleri yerel veri dizilerinden üretilecek; mevcut aktarım bileşenleri `TransferPage` altında aynı durum ve protokol koduyla çalışmaya devam edecek. Ortak renk, tipografi ve hareket kuralları CSS değişkenleriyle paylaşılacak.

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, mevcut Web Crypto/QR/video bileşenleri, bağımlılıksız CSS animasyonları.

## Global Constraints

- Geliştirme adresi `http://localhost:5173` olacak.
- Yeni yönlendirme veya animasyon paketi eklenmeyecek.
- Rotalar `/`, `/transfer` ve `/sss` olacak.
- VaultDrop logosu `public/brand/vaultdrop-mark.png` dosyasından kullanılacak.
- Vurgu rengi `#FF493D`, ana metin `#171717`, arka plan `#FBFAF7` olacak.
- Yazı ailesi `Inter`, ardından sistem sans-serif yazı tipleri olacak.
- Genel dosya sınırı 50 MiB, QR Video sınırı 2 MiB olarak kalacak.
- UDF, desteklenen dosya örnekleri arasında gösterilecek; aktarım motoru tüm dosya türlerini kabul etmeye devam edecek.
- `prefers-reduced-motion: reduce` durumunda içerikler görünür kalacak.
- Mevcut protokol, şifreleme ve aktarım işlevleri değiştirilmeyecek.
- Projede `.git` bulunmadığı için görev sonlarında commit yerine test çıktısı kontrol noktası kullanılacak.

---

### Task 1: Sayfa çözümleme ve rota kabuğu

**Files:**
- Create: `src/routes.js`
- Create: `src/pages/TransferPage.jsx`
- Create: `src/pages/NotFoundPage.jsx`
- Modify: `src/App.jsx`
- Test: `src/__tests__/routes.test.js`

**Interfaces:**
- Produces: `resolveRoute(pathname: string): "landing" | "transfer" | "faq" | "not-found"`
- Produces: `TransferPage(): JSX.Element`
- Consumes later: `LandingPage` and `FaqPage` default exports

- [ ] **Step 1: Rota davranışını tanımlayan başarısız testi yaz**

```js
import { describe, expect, it } from "vitest";
import { resolveRoute } from "../routes";

describe("resolveRoute", () => {
  it.each([
    ["/", "landing"],
    ["/transfer", "transfer"],
    ["/transfer/", "transfer"],
    ["/sss", "faq"],
    ["/bilinmeyen", "not-found"],
  ])("%s yolunu %s sayfasına çözer", (pathname, page) => {
    expect(resolveRoute(pathname)).toBe(page);
  });
});
```

- [ ] **Step 2: Testin beklenen nedenle başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/routes.test.js`

Expected: `../routes` modülü bulunamadığı için FAIL.

- [ ] **Step 3: Saf rota çözümleyicisini oluştur**

```js
export function resolveRoute(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (normalized === "/") return "landing";
  if (normalized === "/transfer") return "transfer";
  if (normalized === "/sss") return "faq";
  return "not-found";
}
```

- [ ] **Step 4: Mevcut `App` içeriğini işlev değiştirmeden `TransferPage` içine taşı**

`TransferPage` mevcut `mode`, `sendMethod` ve `receiveMethod` durumlarını koruyacak. Üstüne yalnızca VaultDrop sayfa kabuğu eklenecek:

```jsx
export default function TransferPage() {
  return (
    <div className="transfer-page">
      <header className="transfer-header">
        <a className="brand" href="/" aria-label="VaultDrop ana sayfa">
          <img src="/brand/vaultdrop-mark.png" alt="" />
          <span>Vault<strong>Drop</strong></span>
        </a>
        <a className="header-link" href="/">Ana sayfa</a>
      </header>
      <section className="transfer-shell">{/* mevcut Gönder/Al içeriği */}</section>
    </div>
  );
}
```

- [ ] **Step 5: `App` bileşenini rota kabuğuna dönüştür**

`LandingPage` ve `FaqPage` geçici olarak basit başlık döndürecek; sonraki görevlerde gerçek içerikleriyle değiştirilecek.

- [ ] **Step 6: Rota testini ve mevcut aktarım testlerini çalıştır**

Run: `npm test -- src/__tests__/routes.test.js src/__tests__/secure-package-ui.test.jsx src/__tests__/mobile-receive-flow.test.jsx`

Expected: PASS.

---

### Task 2: Ortak VaultDrop tasarım sistemi

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/shared.css`
- Modify: `src/index.css`
- Modify: `src/main.jsx`
- Test: `src/__tests__/brand-shell.test.jsx`

**Interfaces:**
- Produces CSS variables: `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-accent`, `--color-border`
- Produces shared classes: `.brand`, `.pill-button`, `.section-wrap`, `.eyebrow`

- [ ] **Step 1: VaultDrop marka kabuğu testini yaz**

```jsx
import { render, screen } from "@testing-library/react";
import TransferPage from "../pages/TransferPage";

it("VaultDrop marka adı ve logosunu gösterir", () => {
  render(<TransferPage />);
  expect(screen.getByRole("link", { name: "VaultDrop ana sayfa" })).toBeInTheDocument();
  expect(screen.getByRole("img", { hidden: true })).toHaveAttribute(
    "src",
    "/brand/vaultdrop-mark.png",
  );
});
```

- [ ] **Step 2: Testin mevcut kabukta başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/brand-shell.test.jsx`

Expected: VaultDrop bağlantısı bulunamadığı için FAIL.

- [ ] **Step 3: Tasarım değişkenlerini oluştur**

```css
:root {
  color-scheme: light;
  --color-bg: #fbfaf7;
  --color-surface: #ffffff;
  --color-text: #171717;
  --color-muted: #6f6f6f;
  --color-accent: #ff493d;
  --color-border: #ddd7d0;
  --radius-card: 22px;
  --shadow-soft: 0 18px 48px rgb(40 26 20 / 9%);
  font-family: Inter, "Segoe UI", system-ui, sans-serif;
}
```

- [ ] **Step 4: Ortak reset, buton, marka ve içerik genişliği kurallarını ekle**

`body` arka planı `var(--color-bg)`, metin rengi `var(--color-text)` olacak. Bağlantı ve buton odak halkaları `2px solid var(--color-accent)` kullanacak.

- [ ] **Step 5: `main.jsx` içinde CSS içe aktarma sırasını sabitle**

```jsx
import "./styles/tokens.css";
import "./styles/shared.css";
import "./index.css";
```

- [ ] **Step 6: Marka testini çalıştır**

Run: `npm test -- src/__tests__/brand-shell.test.jsx`

Expected: PASS.

---

### Task 3: Landing page içeriği, UDF ve hareketli demolar

**Files:**
- Create: `src/content/landingContent.js`
- Create: `src/pages/LandingPage.jsx`
- Create: `src/pages/LandingPage.css`
- Create: `src/components/TransferDemo.jsx`
- Create: `src/components/SupportedFiles.jsx`
- Create: `src/hooks/useReducedMotion.js`
- Test: `src/__tests__/landing-page.test.jsx`

**Interfaces:**
- Produces: `FILE_TYPES: Array<{ extension: string; title: string; detail: string; tone: string }>`
- Produces: `TransferDemo({ reducedMotion: boolean }): JSX.Element`
- Produces: `useReducedMotion(): boolean`

- [ ] **Step 1: Landing page kabul testlerini yaz**

```jsx
import { render, screen } from "@testing-library/react";
import LandingPage from "../pages/LandingPage";

it("ana CTA ile transfer sayfasına bağlanır", () => {
  render(<LandingPage />);
  expect(screen.getByRole("link", { name: /aktarıma başla/i })).toHaveAttribute(
    "href",
    "/transfer",
  );
});

it("UDF ve genel dosya sınırını gösterir", () => {
  render(<LandingPage />);
  expect(screen.getByText("UDF")).toBeInTheDocument();
  expect(screen.getByText(/50 MiB/)).toBeInTheDocument();
});

it("Canlı QR ve Şifreli Paket demolarını aynı sahnede sunar", () => {
  render(<LandingPage />);
  const stage = screen.getByTestId("transfer-demo-stage");
  expect(stage).toHaveTextContent("Canlı QR");
  expect(stage).toHaveTextContent("Şifreli Paket");
});
```

- [ ] **Step 2: Testlerin placeholder landing sayfasında başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/landing-page.test.jsx`

Expected: CTA, UDF ve demo sahnesi bulunamadığı için FAIL.

- [ ] **Step 3: İçerik verilerini oluştur**

`FILE_TYPES` dizisi PDF, DOC, XLS, PPT, IMG, ZIP, TXT, UDF ve diğer dosyaları içerecek. UDF girdisi tam olarak şöyle olacak:

```js
{ extension: "UDF", title: "UYAP Belgeleri", detail: ".udf", tone: "udf" }
```

- [ ] **Step 4: Hareket azaltma kancasını oluştur**

```js
import { useEffect, useState } from "react";

export default function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
```

- [ ] **Step 5: `TransferDemo` bileşenini aynı sahnede iki katmanla kur**

Normal modda iki demo 16 saniyelik döngüde 8'er saniye görünür olacak. Azaltılmış hareket modunda `Canlı QR` katmanı `is-static` sınıfıyla görünür, Şifreli Paket katmanı gizli olacak. Temel CSS opaklığı azaltılmış hareket kuralı tarafından açıkça geçersiz kılınacak.

- [ ] **Step 6: Landing page bölümlerini oluştur**

Hero, güven bandı, aktarım demosu, üç adım, desteklenen dosyalar, güvenlik özellikleri, kullanım senaryoları, kısa SSS ve ayrıntılı footer sırasını koru. CTA hedefleri `/transfer`, SSS hedefi `/sss` olacak.

- [ ] **Step 7: Kaydırma ve hover hareketlerini bağımlılıksız CSS/IntersectionObserver ile ekle**

Observer yalnızca sunum sınıfı ekleyecek. JavaScript çalışmazsa içerik temel durumda görünür kalacak; `.has-motion` sınıfı yalnızca effect çalıştıktan sonra kök elemana eklenecek.

- [ ] **Step 8: Landing testlerini çalıştır**

Run: `npm test -- src/__tests__/landing-page.test.jsx`

Expected: PASS.

---

### Task 4: Ayrıntılı SSS sayfası ve kısa SSS alanı

**Files:**
- Create: `src/content/faqContent.js`
- Create: `src/pages/FaqPage.jsx`
- Create: `src/pages/FaqPage.css`
- Create: `src/components/FaqList.jsx`
- Test: `src/__tests__/faq-page.test.jsx`

**Interfaces:**
- Produces: `FAQ_ITEMS: Array<{ id: string; category: "general" | "security" | "usage" | "technical"; question: string; answer: string }>`
- Produces: `FaqList({ items }): JSX.Element`

- [ ] **Step 1: Arama ve kategori testlerini yaz**

```jsx
import { fireEvent, render, screen } from "@testing-library/react";
import FaqPage from "../pages/FaqPage";

it("soruları metne göre filtreler", () => {
  render(<FaqPage />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "anahtar" } });
  expect(screen.getByText(/Anahtarı neden ayrı/)).toBeInTheDocument();
  expect(screen.queryByText("VaultDrop nedir?")).not.toBeInTheDocument();
});

it("güvenlik kategorisini seçer", () => {
  render(<FaqPage />);
  fireEvent.click(screen.getByRole("button", { name: "Güvenlik" }));
  expect(screen.getByText(/Dosyalarım bir sunucuya/)).toBeInTheDocument();
  expect(screen.queryByText(/QR Video neden/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Testlerin placeholder sayfada başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/faq-page.test.jsx`

Expected: Arama alanı ve filtreler bulunamadığı için FAIL.

- [ ] **Step 3: SSS veri dizisini dört kategori ve 12 soruyla oluştur**

Sorular tasarım belgesindeki güvenlik, kullanım ve teknik sınırları aynen koruyacak. Dosya sınırı cevabı 50 MiB ve QR Video cevabı 2 MiB değerlerini içerecek.

- [ ] **Step 4: Arama ve kategori durumunu uygula**

```jsx
const [query, setQuery] = useState("");
const [category, setCategory] = useState("all");
const visibleItems = FAQ_ITEMS.filter((item) => {
  const inCategory = category === "all" || item.category === category;
  const text = `${item.question} ${item.answer}`.toLocaleLowerCase("tr");
  return inCategory && text.includes(query.toLocaleLowerCase("tr").trim());
});
```

- [ ] **Step 5: Erişilebilir açılır soruları ve boş durumu oluştur**

Yerel `<details>`/`<summary>` elemanları kullanılacak. `visibleItems.length === 0` durumunda “Aramana uygun soru bulunamadı.” metni gösterilecek.

- [ ] **Step 6: SSS testlerini çalıştır**

Run: `npm test -- src/__tests__/faq-page.test.jsx`

Expected: PASS.

---

### Task 5: Transfer uygulamasının VaultDrop görsel sistemine taşınması

**Files:**
- Modify: `src/App.css`
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/SendPanel.jsx`
- Modify: `src/SecurePackagePanel.jsx`
- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/ReceivePanel.jsx`
- Test: `src/__tests__/transfer-page-shell.test.jsx`
- Test existing: `src/__tests__/secure-package-ui.test.jsx`
- Test existing: `src/__tests__/mobile-receive-flow.test.jsx`

**Interfaces:**
- Consumes existing: `TransferMethodSelector`, `ReceiveMethodSelector`, `SendPanel`, `ReceivePanel`, `SecurePackagePanel`, `VideoTransferPanel`
- Produces no protocol or crypto changes

- [ ] **Step 1: Transfer sayfası kabuk testini yaz**

```jsx
import { render, screen } from "@testing-library/react";
import TransferPage from "../pages/TransferPage";

it("yeni VaultDrop transfer kabuğunu ve mevcut işlem sekmelerini gösterir", () => {
  render(<TransferPage />);
  expect(screen.getByRole("heading", { name: /güvenli dosya aktarımı/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Gönder" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Al" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Testin eski koyu kabukta başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/transfer-page-shell.test.jsx`

Expected: Yeni başlık bulunamadığı için FAIL.

- [ ] **Step 3: Transfer sayfası düzenini açık temaya geçir**

Sayfa genişliği masaüstünde `960px`, form çalışma alanı `680px` olacak. Başlık ve güven açıklaması üstte; Gönder/Al sekmeleri beyaz kart içinde; yöntem kartları masaüstünde üç sütun, mobilde tek sütun olacak.

- [ ] **Step 4: Mevcut global sınıfları VaultDrop değişkenleriyle yeniden stillendir**

`.dropzone`, `.package-section`, `.meta`, `.receive-tip`, `.status-logs-box`, `.btn-solid`, `.btn-ghost`, `.warning` ve `.error` sınıfları işlevsel DOM yapısı değiştirilmeden açık renk sistemine taşınacak.

- [ ] **Step 5: Dosya seçme açıklamasına UDF örneğini ekle**

Canlı QR ve Şifreli Paket seçim alanlarının alt metni “PDF, UDF, DOCX, fotoğraf veya başka bir format” olacak. `accept` kısıtı eklenmeyecek.

- [ ] **Step 6: Mevcut aktarım testlerini çalıştır ve regresyon olmadığını doğrula**

Run: `npm test -- src/__tests__/transfer-page-shell.test.jsx src/__tests__/secure-package-ui.test.jsx src/__tests__/mobile-receive-flow.test.jsx src/__tests__/receive-panel.test.jsx`

Expected: PASS.

---

### Task 6: Entegrasyon, mobil kontrol ve localhost 5173 doğrulaması

**Files:**
- Modify if needed: `vite.config.js`
- Modify: `index.html`
- Test: all existing and new tests

**Interfaces:**
- Final routes: `/`, `/transfer`, `/sss`
- Dev server: `http://localhost:5173`

- [ ] **Step 1: Sayfa başlığını ve favicon'u VaultDrop olarak güncelle**

`index.html` başlığı `VaultDrop — Güvenli Belge Aktarımı`, favicon kaynağı `/brand/vaultdrop-mark.png` olacak.

- [ ] **Step 2: Tüm testleri çalıştır**

Run: `npm test`

Expected: Tüm test dosyaları PASS, sıfır başarısız test.

- [ ] **Step 3: Lint kontrolünü çalıştır**

Run: `npm run lint`

Expected: Exit code 0.

- [ ] **Step 4: Üretim derlemesini doğrula**

Run: `npm run build`

Expected: Exit code 0 ve `dist` çıktısı.

- [ ] **Step 5: Vite geliştirme sunucusunu 5173 portunda başlat**

Run: `npm run dev -- --host 127.0.0.1 --port 5173`

Expected: `Local: http://localhost:5173/`.

- [ ] **Step 6: Gerçek tarayıcıda üç rotayı ve azaltılmış hareket modunu kontrol et**

Kontrol listesi:

- `/` landing page açılır; CTA `/transfer` hedefine gider.
- `/transfer` mevcut Gönder/Al işlevlerini ve VaultDrop açık temasını gösterir.
- `/sss` arama ve kategori filtreleri çalışır.
- Canlı QR mockup'ı normal modda animasyonlu, azaltılmış hareket modunda statik görünür.
- 390px mobil genişlikte yatay taşma oluşmaz.
- Tarayıcı konsolunda hata bulunmaz.

- [ ] **Step 7: Son doğrulama çıktısını kaydet**

Git deposu bulunmadığı için commit atma. Değişen dosyaları ve `test/lint/build` sonuçlarını teslim mesajında listele.
