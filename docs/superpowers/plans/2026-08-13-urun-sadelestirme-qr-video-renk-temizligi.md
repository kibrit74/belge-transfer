# Ürün Sadeleştirme: QR Video ve Renkli QR Temizliği Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ürünü yalnız Canlı QR ve VaultDrop yöntemlerine indirgemek; QR Video oluşturma/açma, eski aktarımı açma ve renkli QR laboratuvarını kullanıcıdan ve üretim paketinden tamamen kaldırmak.

**Architecture:** Bu plan, VaultDrop ve çoklu Canlı QR planları tamamlandıktan sonra uygulanacak. Önce kullanıcı yolları ve yeni etkinlik kayıtları kapatılacak; ardından artık hiçbir üretim içe aktarımı kalmayan video/renk motorları, workerlar, testler ve stiller silinecek. Veritabanındaki geçmiş `qr_video` satırları korunacak ve profilde yalnız “QR Video (geçmiş)” etiketiyle okunabilecek.

**Tech Stack:** React 19, Vite, Express, Zod, Vitest, Testing Library, Oxlint

## Global Constraints

- Uygulama sırası: önce `2026-08-13-vaultdrop-vdrop-hiz-guvenlik.md`, sonra `2026-08-13-canli-qr-coklu-fountain-hizlandirma.md`, en son bu plan.
- Gönder ekranında yalnız `Canlı QR` ve `VaultDrop`; al ekranında yalnız `VaultDrop` ve `Kameradan tara` bulunmalı.
- QR Video üretme, QR Video dosyası açma, “Eski aktarımı aç” ve renkli QR laboratuvarı için gizli rota bırakılmamalı.
- `qr_video` ile yeni rezervasyon veya etkinlik oluşturulamamalı; geçmiş kayıtlar ve mevcut veritabanı kısıtı silinmemeli.
- Eski `.bta` BTA1/BTA2 paketleri süresiz açılmalı. Yeni `.vdrop` BTA2 üretimi etkilenmemeli.
- Yeni QRL1 Canlı QR ve eski QRT1/QRT2 Canlı QR okuma uyumluluğu korunmalı. QRT3/QRF1/CRF2 kullanıcı akışları kaldırılmalı.
- `src/live-qr/**` altındaki yeni Canlı QR kodu video/optical temizliği sırasında silinmemeli.
- Kamera taramasının kullandığı `.video-frame`, `.video` ve `src/workers/qr-decode.worker.js` korunmalı.
- Tarihsel tasarım ve plan belgeleri `docs/superpowers/**` altında kayıt olarak kalmalı; güncel README ve güvenlik belgesi eski yöntemi önermemeli.
- Yeni bağımlılık eklenmemeli ve veritabanında yıkıcı göç çalıştırılmamalı.
- Kullanıcı metinleri ve kaynak dosyaları UTF-8 olmalı.
- Çalışma dizini Git deposu değildir. `git init` çalıştırılmayacak; görev sonlarında commit yerine test çıktısı kontrol noktası olarak kaydedilecek.

---

### Task 1: Gönder ve al ekranını iki yönteme indir

**Files:**
- Modify: `src/TransferMethodSelector.jsx`
- Modify: `src/ReceiveMethodSelector.jsx`
- Modify: `src/pages/TransferPage.jsx`
- Delete: `src/MobileSharePanel.jsx`
- Modify: `src/__tests__/transfer-page-shell.test.jsx`
- Modify: `src/__tests__/mobile-receive-flow.test.jsx`
- Modify: `src/__tests__/protected-transfer-route.test.jsx`
- Delete: `src/__tests__/mobile-share-panel.test.jsx`

**Interfaces:**
- Produces: `TRANSFER_METHODS = [live, package]`
- Produces: `RECEIVE_METHODS = [package, camera]`
- Preserves: Misafir için varsayılan ve kullanılabilir `package` görünümü

- [ ] **Step 1: Yalnız iki yöntemi gösteren başarısız kabuk testini yaz**

```jsx
it("yalnız Canlı QR ve VaultDrop ürün yollarını gösterir", () => {
  render(<TransferPage />);

  expect(screen.getByRole("button", { name: /Canlı QR/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /VaultDrop/i })).toBeInTheDocument();
  expect(screen.queryByText(/QR Video/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Mobilden mobile/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Al" }));
  expect(screen.getByRole("button", { name: /VaultDrop/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Kameradan tara/i })).toBeInTheDocument();
  expect(screen.queryByText(/video dosyası/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Kabuk testlerini çalıştır ve dört gönderim/üç alım seçeneği nedeniyle kırıldığını doğrula**

Run: `npm test -- src/__tests__/transfer-page-shell.test.jsx src/__tests__/mobile-receive-flow.test.jsx src/__tests__/protected-transfer-route.test.jsx`

Expected: FAIL; QR Video ve “Mobilden mobile” metinleri hâlâ görünmeli.

- [ ] **Step 3: Seçicileri ve sayfa dallarını sadeleştir**

```js
const TRANSFER_METHODS = [
  { id: "live", title: "Canlı QR", description: "Yan yana cihazlar için hızlı aktarım" },
  { id: "package", title: "VaultDrop", description: "Uzak cihazlara şifreli dosya gönderimi" },
];

const RECEIVE_METHODS = [
  { id: "package", title: "VaultDrop", description: ".vdrop veya eski .bta paketini anahtarla aç" },
  { id: "camera", title: "Kameradan tara", description: "Başka bir ekrandaki Canlı QR kodlarını okut" },
];
```

`TransferPage` başlangıç gönderim yöntemi `package` olacak. `VideoTransferPanel` ve `MobileSharePanel` içe aktarımları ile `mobile`/`video` render dalları kaldırılacak. Alt bilgi tam olarak şu olacak: “Canlı QR yan yana cihazlar, VaultDrop uzak cihazlar için önerilir.”

- [ ] **Step 4: Kullanılmayan mobil sarmalayıcıyı ve testini sil**

Delete `src/MobileSharePanel.jsx` and `src/__tests__/mobile-share-panel.test.jsx` after `rg -n "MobileSharePanel" src` returns only those two files.

- [ ] **Step 5: Task 1 testlerini çalıştır**

Run: `npm test -- src/__tests__/transfer-page-shell.test.jsx src/__tests__/mobile-receive-flow.test.jsx src/__tests__/protected-transfer-route.test.jsx`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

İki gönderim, iki alım, misafir varsayılanı ve kaldırılan import sonuçlarını uygulama notuna kaydet.

---

### Task 2: Renk laboratuvarı rotasını ve eski ürün metinlerini kaldır

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/routes.js`
- Modify: `src/pages/LandingPage.jsx`
- Modify: `src/content/faqContent.js`
- Modify: `src/pages/PricingPage.jsx`
- Modify: `src/pages/LoginPage.jsx`
- Modify: `src/pages/ProfilePage.jsx`
- Modify: `src/pages/SecureLinkReceivePage.jsx`
- Modify: `src/components/TransferDemo.jsx`
- Modify: `src/__tests__/routes.test.js`
- Modify: `src/__tests__/landing-page.test.jsx`
- Modify: `src/__tests__/faq-page.test.jsx`
- Modify: `src/__tests__/pricing-page.test.jsx`
- Modify: `src/__tests__/auth-profile-ui.test.jsx`
- Modify: `src/__tests__/secure-link-receive-page.test.jsx`

**Interfaces:**
- Removes: `/renkli-qr-test`
- Produces: Güncel ürün metinlerinde yalnız Canlı QR ve VaultDrop
- Preserves: Profil geçmişinde `qr_video: "QR Video (geçmiş)"`

- [ ] **Step 1: Gizli rotanın kapanmasını ve güncel metinleri test et**

```js
it("renkli QR laboratuvarı rotasını artık sunmaz", () => {
  expect(resolveRoute("/renkli-qr-test")).toBe("not-found");
});
```

```jsx
it("ana sayfa yalnız iki güncel yöntemi anlatır", () => {
  render(<LandingPage />);
  expect(screen.getByText(/Canlı QR/i)).toBeInTheDocument();
  expect(screen.getByText(/VaultDrop/i)).toBeInTheDocument();
  expect(screen.queryByText(/QR Video|Renkli QR/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Hedefli testleri çalıştır ve eski rota/metinler nedeniyle kırıldığını doğrula**

Run: `npm test -- src/__tests__/routes.test.js src/__tests__/landing-page.test.jsx src/__tests__/faq-page.test.jsx src/__tests__/pricing-page.test.jsx src/__tests__/auth-profile-ui.test.jsx src/__tests__/secure-link-receive-page.test.jsx`

Expected: FAIL; renk laboratuvarı ve QR Video metinleri hâlâ bulunmalı.

- [ ] **Step 3: Rotayı ve doğrudan laboratuvar içe aktarımını kaldır**

`App.jsx` içindeki `ColorQrLabPage` import/render dalı ve `routes.js` içindeki `/renkli-qr-test` eşleşmesi silinecek. URL artık standart `NotFoundPage` gösterecek.

- [ ] **Step 4: Ürün metinlerini iki yönteme göre güncelle**

- Landing, SSS, paketler ve giriş sayfalarında QR Video/renkli QR özellik cümleleri silinecek.
- `TransferDemo` dosya etiketi `.VDROP`, açıklaması “Dosya şifrelenir → .vdrop gönderilir → anahtarla açılır” olacak.
- `SecureLinkReceivePage` `.vdrop` ana adını kullanacak ve “Eski .bta paketleri de açılır.” notunu gösterecek.
- Profil sayfası yeni QR Video eylemi göstermeyecek; geçmiş etkinlik sözlüğünde yalnız `qr_video: "QR Video (geçmiş)"` kalacak.

- [ ] **Step 5: Task 2 testlerini çalıştır**

Run: `npm test -- src/__tests__/routes.test.js src/__tests__/landing-page.test.jsx src/__tests__/faq-page.test.jsx src/__tests__/pricing-page.test.jsx src/__tests__/auth-profile-ui.test.jsx src/__tests__/secure-link-receive-page.test.jsx`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

Kapanan rota, güncellenen metinler ve korunan geçmiş etiketini uygulama notuna kaydet.

---

### Task 3: Yeni QR Video etkinliklerini reddet, geçmiş kayıtları koru

**Files:**
- Modify: `src/transfer/usage-policy.js`
- Modify: `src/__tests__/usage-policy.test.js`
- Modify: `server/validation.js`
- Modify: `server/__tests__/validation.test.js`
- Modify: `server/__tests__/auth-api.test.js`
- Preserve without migration: `server/db/migrations/001_auth_usage.sql`
- Preserve historical read test: `server/__tests__/repositories.test.js`

**Interfaces:**
- Produces: Yeni yazma şemalarında `method ∈ {live_qr, secure_package}`
- Preserves: Geçmiş sorgu filtresinde `method ∈ {live_qr, secure_package, qr_video}`

- [ ] **Step 1: Yeni QR Video rezervasyonunun reddedildiğini test et**

```js
it("yeni QR Video rezervasyonunu reddeder, geçmiş sorgu filtresine izin verir", () => {
  expect(transferReservationSchema.safeParse({
    method: "qr_video",
    startedAt: "2026-08-13T10:00:00.000Z",
    items: [{ sizeBytes: 1024 }],
  }).success).toBe(false);

  expect(transferQuerySchema.safeParse({ method: "qr_video" }).success).toBe(true);
});
```

- [ ] **Step 2: Sunucu testini çalıştır ve mevcut enum nedeniyle kırıldığını doğrula**

Run: `npm test -- server/__tests__/validation.test.js server/__tests__/auth-api.test.js server/__tests__/repositories.test.js src/__tests__/usage-policy.test.js`

Expected: FAIL; yeni `qr_video` rezervasyonu kabul edilmeli.

- [ ] **Step 3: Yazma ve okuma enumlarını ayır**

```js
const activeMethodSchema = z.enum(["live_qr", "secure_package"]);
const historicalMethodSchema = z.enum(["live_qr", "secure_package", "qr_video"]);
```

`transferSchema` ve `transferReservationSchema` `activeMethodSchema`; `transferQuerySchema` `historicalMethodSchema` kullanacak. `validateMethodLimits()` içindeki QR Video sınırı kaldırılacak. `usage-policy.js` içindeki `QR_VIDEO_MAX_BYTES` ihracı ve `method === "qr_video"` dalı silinecek.

- [ ] **Step 4: Tarihsel veri korumasını doğrula**

`001_auth_usage.sql` değiştirilmeden kalacak. Repository testi önceden kaydedilmiş `qr_video` satırını okuyabilmeli; API testi aynı yöntemle yeni POST isteğinin 400 döndürdüğünü doğrulamalı.

- [ ] **Step 5: Task 3 testlerini çalıştır**

Run: `npm test -- server/__tests__/validation.test.js server/__tests__/auth-api.test.js server/__tests__/repositories.test.js src/__tests__/usage-policy.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

Yeni yazma reddi, geçmiş okuma başarısı ve migration dosyasının değişmediğini uygulama notuna kaydet.

---

### Task 4: QRT3/QRF1/CRF2 yollarını ayır ve video/renk motorlarını sil

**Files:**
- Create: `src/transfer/limits.js`
- Modify: `src/crypto/encrypted-container.js`
- Modify: `src/protocol.js`
- Modify: `src/protocol/index.js`
- Modify: `src/transfer/receive-session.js`
- Modify: `src/ReceivePanel.jsx`
- Modify: `src/__tests__/protocol-v2.test.js`
- Modify: `src/__tests__/receive-session.test.js`
- Modify: `src/__tests__/receive-panel.test.jsx`
- Modify: `src/__tests__/encrypted-container.test.js`
- Modify: `src/__tests__/batch-files.test.js`
- Modify: `src/__tests__/transfer-roundtrip.test.js`
- Delete: Implementation and test files listed in Step 5

**Interfaces:**
- Produces: `MAX_TRANSFER_BYTES = 50 * 1024 * 1024`, `MAX_LEGACY_FRAME_COUNT = 150_000`
- Produces: `parseFrame()` accepts QRL1 and legacy QRT1/QRT2 only
- Removes: QRT3 encrypted optical, QRF1 video optical and CRF2 color routes

- [ ] **Step 1: Aktif protokol sınırını test et**

```js
it.each(["QRT3|x", "QRF1|x", "CRF2|x"])("%s kullanıcı akışını reddeder", (text) => {
  expect(parseFrame(text)).toBeNull();
});

it("QRL1 ve eski QRT2 yollarını korur", async () => {
  const encoder = await createLiveFountainEncoder(new TextEncoder().encode("canlı"), {
    transferId: "Ab12Cd34Ef56",
    blockBytes: 1400,
  });
  const qrl1 = encodeLiveFrame(encoder.metadata, encoder.symbol(0));
  const legacy = encodeFileToFrames(
    new File(["eski"], "eski.txt", { type: "text/plain" }),
    new TextEncoder().encode("eski").buffer,
    { compress: false },
  );

  expect(parseFrame(qrl1)).toMatchObject({ protocolVersion: "QRL1" });
  expect(parseFrame(legacy.frames[0])).toMatchObject({ transferId: legacy.transferId });
});
```

- [ ] **Step 2: Protokol ve alıcı testlerini çalıştır ve eski dallar nedeniyle kırıldığını doğrula**

Run: `npm test -- src/__tests__/protocol-v2.test.js src/__tests__/receive-session.test.js src/__tests__/receive-panel.test.jsx src/__tests__/transfer-roundtrip.test.js`

Expected: FAIL; QRT3/QRF1 hâlâ ayrıştırılmalı ve alıcı anahtar alanı göstermeli.

- [ ] **Step 3: Genel sınırları video protokolünden ayır**

```js
// src/transfer/limits.js
export const MAX_TRANSFER_BYTES = 50 * 1024 * 1024;
export const MAX_LEGACY_FRAME_COUNT = 150_000;
```

`encrypted-container.js`, `protocol.js`, `transfer/receive-session.js` ve ilgili testler bu sabitleri kullanacak. `receive-session.js` yalnız QRT1/QRT2 metadata ve `assembleChunks()` yolunu tutacak; QRT3 dalı ile `concatenateChunks()` kaldırılacak.

- [ ] **Step 4: Alıcı ve protokol yönlendirmesini sadeleştir**

```js
export function parseFrame(text) {
  if (typeof text !== "string") return null;
  if (text.startsWith("QRL1|")) return parseLiveFrame(text);
  return parseLegacyFrame(text);
}
```

`ReceivePanel` içindeki `protocolVersion === "QRT3"`, şifreli video açma, “QR video anahtarı” ve ilgili decrypt durumu silinecek. QRL1 worker sonucu ve QRT1/QRT2 eski Canlı QR birleştirmesi korunacak.

- [ ] **Step 5: Kullanılmayan video/renk uygulamasını ve yalnız ona ait testleri sil**

Delete these implementation files/directories after `rg` confirms no import from retained production files:

```text
src/ColorQrLabPage.jsx
src/VideoTransferPanel.jsx
src/hooks/useColorQrScanner.js
src/optical/color-frame-v1.js
src/optical/color-frame-v2.js
src/optical/color-matrix.js
src/optical/color-matrix-canvas.js
src/optical/color-matrix-v2.js
src/optical/color-package-v2.js
src/optical/color-receive-session.js
src/optical/fountain.js
src/optical/frame-layout.js
src/optical/frame-v4.js
src/optical/profiles.js
src/optical/receive-session-v4.js
src/video/create-color-qr-video.js
src/video/create-qr-video.js
src/video/decode-color-qr-video.js
src/video/decode-qr-video.js
src/video/frame-schedule.js
src/video/qr-frame-preloader.js
src/video/qr-raster.js
src/video/qr-render-pool.js
src/video/qr-video-recovery-store.js
src/video/qr-worker-pool.js
src/video/sequential-video-frame-reader.js
src/workers/color-qr.worker.js
src/workers/color-qr-client.js
src/workers/qr-wasm-decode.worker.js
src/workers/standard-qr-render.worker.js
src/protocol/frame-v3.js
```

Delete these obsolete tests:

```text
src/__tests__/color-frame-v1.test.js
src/__tests__/color-frame-v2.test.js
src/__tests__/color-matrix.test.js
src/__tests__/color-matrix-v2.test.js
src/__tests__/color-package-v2.test.js
src/__tests__/color-qr-lab-ui.test.jsx
src/__tests__/color-qr-scanner.test.jsx
src/__tests__/color-qr-worker.test.js
src/__tests__/color-receive-session.test.js
src/__tests__/create-color-qr-video.test.js
src/__tests__/create-qr-video.test.js
src/__tests__/create-qr-video-v4.test.js
src/__tests__/decode-color-qr-video.test.js
src/__tests__/decode-qr-video-sequential.test.js
src/__tests__/decode-qr-video-v4.test.js
src/__tests__/frame-schedule.test.js
src/__tests__/frame-v3.test.js
src/__tests__/optical-5mib-performance.test.js
src/__tests__/optical-fountain.test.js
src/__tests__/optical-frame-layout.test.js
src/__tests__/optical-frame-v4.test.js
src/__tests__/optical-network-isolation.test.jsx
src/__tests__/optical-profiles.test.js
src/__tests__/optical-receive-session-v4.test.js
src/__tests__/qr-frame-preloader.test.js
src/__tests__/qr-raster.test.js
src/__tests__/qr-render-pool.test.js
src/__tests__/qr-video-recovery-store.test.js
src/__tests__/qr-worker-pool.test.js
src/__tests__/receive-encrypted-video.test.jsx
src/__tests__/sequential-video-frame-reader.test.js
src/__tests__/standard-qr-render-roundtrip.test.js
src/__tests__/standard-qr-render-worker.test.js
src/__tests__/video-decode-state.test.js
src/__tests__/video-transfer-ui.test.jsx
```

- [ ] **Step 6: Kalan üretim importlarını ve hedefli testleri doğrula**

Run: `rg -n "ColorQrLabPage|VideoTransferPanel|optical/|video/|color-qr|qr-wasm-decode|standard-qr-render|QRT3|QRF1|CRF2" src --glob "!src/__tests__/**" --glob "!src/live-qr/**"`

Expected: no matches. Kamera HTML sınıf adlarındaki `video` kelimesi bu import taramasına dahil değildir.

Run: `npm test -- src/__tests__/protocol-v2.test.js src/__tests__/receive-session.test.js src/__tests__/receive-panel.test.jsx src/__tests__/encrypted-container.test.js src/__tests__/batch-files.test.js src/__tests__/transfer-roundtrip.test.js src/__tests__/live-qr-multi-ui.test.jsx`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

Silinen dosya sayısını, sıfır kalan importu, QRL1/QRT2 geçiş başarısını ve BTA1/BTA2 açma regresyonunu uygulama notuna kaydet.

---

### Task 5: Video/renk stillerini, benchmarkları ve güncel belgeleri temizle

**Files:**
- Modify: `src/App.css`
- Modify: `README.md`
- Modify: `docs/SECURITY.md`
- Modify: `src/__tests__/docs-security-contract.test.js`
- Modify: `src/__tests__/readme-limits.test.js`
- Modify: `src/__tests__/readme-threat-model.test.js`
- Delete: `docs/color-qr-manual-test.md`
- Delete: `docs/mobile-video-manual-test.md`
- Delete: `docs/standard-qr-video-performance-test.md`
- Delete: `scripts/benchmark-color-qr.mjs`
- Delete: `scripts/benchmark-standard-qr-render.mjs`

**Interfaces:**
- Produces: README’de yalnız Canlı QR + VaultDrop karar tablosu
- Preserves: Kamera `.video-frame`/`.video` stilleri ve geçmiş `docs/superpowers/**` kayıtları

- [ ] **Step 1: Güncel belge sözleşmesini test et**

```js
it("güncel belgeler yalnız Canlı QR ve VaultDrop yöntemlerini önerir", () => {
  expect(readme).toContain("Canlı QR");
  expect(readme).toContain("VaultDrop");
  expect(readme).toContain(".vdrop");
  expect(readme).toContain("Eski .bta paketleri");
  expect(readme).not.toMatch(/QR Video|Renkli QR|QRF1|CRF2|CQF2/);
});
```

- [ ] **Step 2: Belge testlerini çalıştır ve eski bölümler nedeniyle kırıldığını doğrula**

Run: `npm test -- src/__tests__/docs-security-contract.test.js src/__tests__/readme-limits.test.js src/__tests__/readme-threat-model.test.js`

Expected: FAIL; README ve güvenlik belgesi QR Video ile `.bta` üretimini önermeli.

- [ ] **Step 3: CSS içinde yalnız kaldırılan bileşenlere ait seçicileri sil**

`color-*`, `mobile-share-*`, `qr-video-*`, `video-result-card`, `video-preview`, `optical-profile-choice`, `transfer-stages.color-profile`, `key-safety-confirmation`, `recovery-notice` ve `video-decode-progress` blokları kaldırılacak. `ReceivePanel` kamera görünümü için `.video-frame`, `.video`, `.scanner-overlay` ve `.scan-region` korunacak. Silme sonrası sınıf kullanım taraması yapılacak.

- [ ] **Step 4: README ve güvenlik belgesini nihai ürün kararına göre yaz**

README yöntem tablosu:

| Durum | Yöntem | Koruma |
|---|---|---|
| Cihazlar yan yana | Canlı QR | Sunucusuz, hızlı; ekrana bakan kamera veriyi görebilir |
| Cihazlar uzakta | VaultDrop `.vdrop` | AES-256-GCM; paket ve anahtar ayrı kanallardan gönderilir |

README’de 5 MiB başlangıç Canlı QR sınırı, cihaz yetersizse 1 MiB güvenli düşüşü, VaultDrop üye/misafir sınırları ve eski `.bta` açma notu bulunacak. `docs/SECURITY.md`, Canlı QR’ın zorunlu şifreli olmadığını ve VaultDrop’un doğrulama tamamlanmadan dosya sunmadığını açıkça söyleyecek.

- [ ] **Step 5: Eski saha formlarını ve benchmarkları sil**

`docs/superpowers/**` kayıtlarına dokunmadan üç güncel QR Video cihaz belgesi ve iki video/renk benchmark betiği silinecek.

- [ ] **Step 6: Belge ve kalıntı taramasını çalıştır**

Run: `rg -n "QR Video|Renkli QR|QRF1|CRF2|CQF2|\.bta paketi oluştur" README.md docs/SECURITY.md src server scripts --glob "!src/__tests__/**"`

Expected: only `ProfilePage` historical label and server historical query compatibility may match `qr_video`; no product recommendation or executable video/color path may match.

Run: `npm test -- src/__tests__/docs-security-contract.test.js src/__tests__/readme-limits.test.js src/__tests__/readme-threat-model.test.js`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

Korunan kamera stillerini, silinen benchmark/belgeleri ve kalıntı taramasının izin verilen iki tarihsel sonucunu uygulama notuna kaydet.

---

### Task 6: Tam ürün doğrulaması ve manuel kabul

**Files:**
- Create: `docs/product-two-path-manual-test.md`
- Modify only if a gate fails: failing source/test file from Tasks 1–5

**Interfaces:**
- Verifies: Canlı QR yakın aktarım, VaultDrop uzak aktarım, BTA1/BTA2 geriye uyumluluğu, geçmiş etkinlik okuma

- [ ] **Step 1: İki ürün yolunun manuel kabul formunu oluştur**

Formda şu bağlayıcı satırlar bulunacak:

```text
[ ] Windows Chrome → Android Chrome, 1 MiB Canlı QR: SHA-256 aynı, süre ≤ 60 sn
[ ] Windows Chrome → iPhone Safari, 1 MiB Canlı QR: SHA-256 aynı, süre ≤ 60 sn
[ ] 5 MiB Canlı QR masaüstü → telefon: SHA-256 aynı, süre ≤ 180 sn
[ ] Windows → macOS, .vdrop + ayrı anahtar: ad/MIME/SHA-256 aynı
[ ] macOS → Windows, .vdrop + ayrı anahtar: ad/MIME/SHA-256 aynı
[ ] Eski BTA1 .bta ve BTA2 .bta: iki fixture da açılıyor
[ ] Uygulamada QR Video, Eski aktarımı aç ve Renkli QR yolu görünmüyor
```

- [ ] **Step 2: Tam test paketini çalıştır**

Run: `npm test`

Expected: PASS; skipped test varsa adı ve gerekçesi kontrol noktasına yazılmalı.

- [ ] **Step 3: Lint ve üretim derlemesini çalıştır**

Run: `npm run lint`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0; çıktı paketinde QR Video/renk worker chunkı bulunmamalı.

- [ ] **Step 4: Üretim paketi kalıntı taramasını yap**

Run: `rg -n "ColorQr|VideoTransfer|QRF1|CRF2|renkli-qr-test" dist`

Expected: no matches.

- [ ] **Step 5: Manuel kabulü iki gerçek cihaz ve iki masaüstü işletim sistemiyle doldur**

Bağlayıcı satırlardan biri başarısızsa ürün temizliği tamamlandı sayılmayacak. Süre ölçümü dosya seçiminden doğrulanmış indirme bağlantısının görünmesine kadar yapılacak.

- [ ] **Step 6: Nihai kontrol noktası oluştur**

Tam test sayısı, lint/build sonuçları, üretim kalıntı taraması ve doldurulan manuel kabul formunun yolunu uygulama notuna kaydet. Git başlatma veya commit yapma.
