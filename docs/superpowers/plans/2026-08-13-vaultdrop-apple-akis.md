# VaultDrop Apple Esintili Aktarım Akışı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aktarım yöntemini kullanıcının gerçek durumuna göre sadeleştirmek, hareketleri kullanıcı kontrolüne almak ve mobil ilk yüklemeyi hafifletmek.

**Architecture:** `TransferMethodSelector` ve `ReceiveMethodSelector` yalnız seçim yüzeyini yönetir; `TransferPage` hangi işlem panelinin açılacağını belirler. `TransferDemo` kendi içindeki oynatma durumunu yönetir. Renkli QR deneme ekranı React’in yerleşik tembel yüklemesiyle yalnız rota açıldığında indirilir.

**Tech Stack:** React 19, Vite, Vitest, CSS medya sorguları; yeni bağımlılık yok.

## Global Constraints

- Dosya içeriği, dosya adı ve anahtar için ağ isteği eklenmeyecek.
- Şifreleme, QR üretim ve kota akışları değişmeyecek.
- Yeni paket eklenmeyecek; hareket yalnız CSS ve React durumuyla yönetilecek.
- Türkçe metinler UTF-8 olarak yazılacak.
- Projede Git deposu yok; commit adımı uygulanmayacak.

---

### Task 1: Gönderme ve alma karar ekranlarını sadeleştir

**Files:**
- Modify: `src/TransferMethodSelector.jsx`
- Modify: `src/ReceiveMethodSelector.jsx`
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/App.css`
- Test: `src/__tests__/secure-package-ui.test.jsx`
- Test: `src/__tests__/mobile-receive-flow.test.jsx`
- Test: `src/__tests__/vaultdrop-product-naming.test.jsx`

**Interfaces:**
- Consumes: `activeMethod: string`, `onChange(method: string): void`
- Produces: `package`, `live`, `video` gönderim seçimleri ile `package`, `video`, `camera` alım seçimleri.

- [ ] **Step 1: Başarısız arayüz testlerini yaz.**

```jsx
renderAuthenticatedApp();
expect(screen.getByRole("heading", { name: "Alıcı nerede?" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Uzakta \/ farklı şehirde/ })).toHaveAttribute("aria-pressed", "true");
expect(screen.getByText("Önerilen")).toBeInTheDocument();
expect(screen.getByLabelText("Paketlenecek belge")).toBeInTheDocument();
```

- [ ] **Step 2: Testi çalıştır ve mevcut dört eşit seçeneğin yeni yönlendirmeyi vermediğini doğrula.**

Run: `npm.cmd test -- src/__tests__/secure-package-ui.test.jsx src/__tests__/mobile-receive-flow.test.jsx src/__tests__/vaultdrop-product-naming.test.jsx`

Expected: `Alıcı nerede?` başlığı bulunamadığı için başarısızlık.

- [ ] **Step 3: Yalın seçim yüzeylerini uygula.**

```jsx
const [sendMethod, setSendMethod] = useState("package");

<h2 id="send-route-title">Alıcı nerede?</h2>
<button aria-pressed={activeMethod === "package"} onClick={() => onChange("package")}>
  Uzakta / farklı şehirde
  <span>Önerilen</span>
</button>
```

`mobile` ana yolunu `TransferPage` içinden kaldır; `package`, `live`, `video` yolları çalışmaya devam etsin. Alım tarafında “Elinde ne var?” başlığını ve açık açıklamalı seçenekleri ekle.

- [ ] **Step 4: Ana kabuk ve seçim kartları için duyarlı CSS ekle.**

```css
.transfer-route-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 650px) { .transfer-route-grid { grid-template-columns: 1fr; } }
```

Ana aktarım kabuğu tek saydam katman olarak kalacak; seçim kartları opak ve okunabilir olacak.

- [ ] **Step 5: Hedef testleri yeniden çalıştır.**

Run: `npm.cmd test -- src/__tests__/secure-package-ui.test.jsx src/__tests__/mobile-receive-flow.test.jsx src/__tests__/vaultdrop-product-naming.test.jsx`

Expected: PASS.

### Task 2: Demo hareketini kullanıcı kontrolüne ver

**Files:**
- Modify: `src/components/TransferDemo.jsx`
- Modify: `src/pages/LandingPage.css`
- Test: `src/__tests__/landing-page.test.jsx`

**Interfaces:**
- Consumes: Kullanıcının senaryo ve oynatma düğmesi seçimi.
- Produces: `data-scene` ve `data-step` değerlerini yalnız oynatma açıkken güncelleyen demo.

- [ ] **Step 1: Başarısız davranış testini yaz.**

```jsx
vi.useFakeTimers();
render(<TransferDemo />);
act(() => vi.advanceTimersByTime(4_000));
expect(screen.getByTestId("transfer-demo-stage")).toHaveAttribute("data-scene", "live");
fireEvent.click(screen.getByRole("button", { name: "Animasyonu oynat" }));
act(() => vi.advanceTimersByTime(4_000));
expect(screen.getByTestId("transfer-demo-stage")).toHaveAttribute("data-scene", "package");
```

- [ ] **Step 2: Testi çalıştır ve mevcut otomatik döngünün ilk beklentiyi bozduğunu doğrula.**

Run: `npm.cmd test -- src/__tests__/landing-page.test.jsx`

Expected: İlk dört saniyede demo kendiliğinden paket sahnesine geçtiği için başarısızlık.

- [ ] **Step 3: Oynat/durdur ve senaryo seçimini uygula.**

```jsx
const [isPlaying, setIsPlaying] = useState(false);
useEffect(() => {
  if (!isPlaying) return undefined;
  const intervalId = window.setInterval(advance, STEP_DURATION_MS);
  return () => window.clearInterval(intervalId);
}, [isPlaying]);
```

Animasyon kapalıyken adım 0 kalır. Senaryo düğmesi seçildiğinde ilgili sahneye ve adım 0’a dönülür.

- [ ] **Step 4: Sürekli dekoratif yüzdürme ve zıplama animasyonlarını kaldır.**

`product-window`, ürün etiketleri ve “Devamını keşfet” bağlantısı için sürekli `animation` tanımlarını kaldır; ilk açılış geçişi korunabilir.

- [ ] **Step 5: Landing hedef testini yeniden çalıştır.**

Run: `npm.cmd test -- src/__tests__/landing-page.test.jsx`

Expected: PASS.

### Task 3: Anlık dokunma tepkisi, erişilebilir tercihler ve daha hızlı ilk yükleme

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/shared.css`
- Modify: `src/App.css`
- Modify: `src/App.jsx`
- Test: `src/__tests__/app-entry.test.jsx`

**Interfaces:**
- Consumes: Sistem hareket, saydamlık ve kontrast tercihleri.
- Produces: Basma anında görsel tepki veren kontroller ve yalnız istenen rotada yüklenen Color QR Lab ekranı.

- [ ] **Step 1: Temel tercih kurallarını ekle.**

```css
@media (prefers-reduced-motion: reduce) { .interactive { transform: none !important; } }
@media (prefers-reduced-transparency: reduce) { .transfer-shell { backdrop-filter: none; } }
@media (prefers-contrast: more) { .transfer-shell { border-color: var(--color-text); } }
```

Dokunulabilir düğme ve kartlar için `:active { transform: scale(.98); }` kullan; dönüşümler yalnız `transform`, `opacity`, `box-shadow` ve renk üzerinde tanımlansın.

- [ ] **Step 2: Renkli QR laboratuvarını tembel yükle.**

```jsx
import { lazy, Suspense } from "react";
const ColorQrLabPage = lazy(() => import("./ColorQrLabPage.jsx"));

if (route === "color-qr-lab") {
  return <Suspense fallback={<main className="route-loading">Deneysel araç açılıyor…</main>}><ColorQrLabPage /></Suspense>;
}
```

- [ ] **Step 3: Giriş testi ve üretim derlemesini çalıştır.**

Run: `npm.cmd test -- src/__tests__/app-entry.test.jsx && npm.cmd run build`

Expected: PASS; Color QR Lab ayrı üretim parçası olarak görünür.

### Task 4: Tam doğrulama

**Files:**
- Verify only.

- [ ] **Step 1: Lint çalıştır.**

Run: `npm.cmd run lint`

Expected: Yeni hata yok; mevcut uyarılar raporlanır.

- [ ] **Step 2: Tüm test paketini tek işlemde çalıştır.**

Run: `npm.cmd test -- --no-file-parallelism`

Expected: PASS veya önceden var olan açık skip’ler dışında hata yok.

- [ ] **Step 3: Üretim derlemesini yeniden çalıştır.**

Run: `npm.cmd run build`

Expected: PASS; başlangıç paketi Color QR Lab kodundan ayrıdır.

## Plan öz-kontrolü

- Kapsam: Tasarımdaki tüm ana kararlar Task 1–3’e bağlıdır.
- Belirsizlik: QR Video ana işlevi değiştirilmeden ikincil görünür.
- Kısıt: Ağ, kripto ve kota yoluna dokunulmaz.
- Git: Proje Git deposu olmadığı için commit beklenmez.
