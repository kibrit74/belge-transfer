# Üç Yöntemli Ürün ve VaultDrop Entegrasyonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlı QR, Yakındaki Cihazlar ve VaultDrop yöntemlerini tek ve anlaşılır gönder/al akışında birleştirip kullanıcıyı konum, ağ, dosya boyutu ve güvenlik ihtiyacına göre doğru yönteme yönlendirmek.

**Architecture:** Yöntem kimlikleri, sınırlar, kullanıcı metinleri ve özellik kapıları tek bir ürün kayıt modülünde tutulacak. Transfer sayfası yalnız seçilen ağır paneli yükleyecek; Canlı QR ve Nearby başarısızlıkları dosyayı sunucuya yüklemeden VaultDrop'a geçiş sunacak. Mevcut AES-256-GCM `.vdrop` üretme/açma motoru ve `.bta` okuma uyumluluğu korunacak.

**Tech Stack:** React 19, React lazy/Suspense, Express/Zod kota kayıtları, mevcut VaultDrop worker ve BTA2 kapsayıcı, Vitest/Testing Library

## Global Constraints

- Aktif ürün yöntemleri yalnız Canlı QR, Yakındaki Cihazlar ve VaultDrop olacak.
- QR Video ve renkli QR aktif ürün kartı, alım alanı veya öneri olarak gösterilmeyecek.
- Canlı QR: yan yana cihazlar, tek dosya/ZIP, ilk yayın sınırı 10 MiB, şifreli değil.
- Yakındaki Cihazlar: aynı Wi-Fi/yerel ağ, tek dosya, ilk yayın sınırı 100 MiB, WebRTC DTLS şifreli.
- VaultDrop: farklı ağ/şehir ve hassas dosyalar, `.vdrop` AES-256-GCM; eski `.bta` yalnız açma uyumluluğu.
- Uygulama dosya içeriğini web veya tanıştırma sunucusuna yüklemeyecek.
- Tanıştırma sunucusu bulunduğu için ürün genelinde “tamamen sunucusuz” denmeyecek; “dosya içeriği sunucuya yüklenmez” denecek.
- Seçilmemiş yöntemin kamera, worker, WebRTC ve zamanlayıcıları çalışmayacak.
- SHA doğrulaması tamamlanmadan hiçbir yöntemde indirme başarı durumu oluşmayacak.
- Kullanıcı metinleri UTF-8, sade Türkçe ve mobilde taşmadan görünür olacak.
- Çalışma dizininde Git yoksa `git init` çalıştırılmayacak; commit adımı test raporunda “Git deposu yok” olarak kaydedilecek.

---

### Task 1: Tek kaynaklı yöntem kayıt defteri

**Files:**
- Create: `src/transfer/method-registry.js`
- Create: `src/__tests__/method-registry.test.js`

**Interfaces:**
- Produces:

```js
TRANSFER_METHODS = ReadonlyArray<{
  id: "live" | "nearby" | "package",
  activityMethod: "live_qr" | "nearby" | "secure_package",
  title: string,
  sendDescription: string,
  receiveTitle: string,
  receiveDescription: string,
  maxBytes: number,
  encrypted: boolean,
  requiresCamera: boolean,
  requiresSameNetwork: boolean,
}>

getTransferMethod(id) => TransferMethod | null
recommendTransferMethod({ proximity, sameNetwork, sensitive, sizeBytes, cameraAvailable })
  => { primary: MethodId, fallback: MethodId | null, reason: string }
```

- [ ] **Step 1: Kayıt ve karar tablosu testlerini yaz**

```js
expect(recommendTransferMethod({
  proximity: "near", sameNetwork: false, sensitive: false,
  sizeBytes: 2 * MIB, cameraAvailable: true,
})).toMatchObject({ primary: "live", fallback: "package" });

expect(recommendTransferMethod({
  proximity: "remote", sameNetwork: false, sensitive: true,
  sizeBytes: 2 * MIB, cameraAvailable: false,
})).toMatchObject({ primary: "package", fallback: null });

expect(recommendTransferMethod({
  proximity: "near", sameNetwork: true, sensitive: false,
  sizeBytes: 80 * MIB, cameraAvailable: false,
})).toMatchObject({ primary: "nearby", fallback: "package" });
```

Test, kayıt dizisinde tam üç yöntem olmasını; `qr_video`/`color` bulunmamasını; Canlı QR 10 MiB, Nearby 100 MiB ve VaultDrop 50 MiB ürün sınırlarını doğrulayacak.

- [ ] **Step 2: Testi çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/method-registry.test.js`

Expected: FAIL with module resolution error.

- [ ] **Step 3: Dondurulmuş kayıtları ekle**

```js
export const TRANSFER_METHODS = Object.freeze([
  Object.freeze({
    id: "live", activityMethod: "live_qr", title: "Canlı QR",
    sendDescription: "Yanındaki telefona kamerayla gönder.",
    receiveTitle: "Kameradan tara",
    receiveDescription: "Yanındaki ekrandaki Canlı QR'ı okut.",
    maxBytes: 10 * MIB, encrypted: false, requiresCamera: true, requiresSameNetwork: false,
  }),
  Object.freeze({
    id: "nearby", activityMethod: "nearby", title: "Yakındaki Cihazlar",
    sendDescription: "Aynı Wi-Fi'daki bilgisayara doğrudan gönder.",
    receiveTitle: "Yakındaki cihaz kodunu gir",
    receiveDescription: "Aynı ağdaki bilgisayarın 6 karakterli kodunu kullan.",
    maxBytes: 100 * MIB, encrypted: true, requiresCamera: false, requiresSameNetwork: true,
  }),
  Object.freeze({
    id: "package", activityMethod: "secure_package", title: "VaultDrop",
    sendDescription: "Uzak cihaza şifreli paket gönder.",
    receiveTitle: "VaultDrop paketini aç",
    receiveDescription: ".vdrop veya eski .bta paketini ayrı gelen anahtarla aç.",
    maxBytes: 50 * MIB, encrypted: true, requiresCamera: false, requiresSameNetwork: false,
  }),
]);
```

- [ ] **Step 4: Saf öneri fonksiyonunu ekle**

Öncelik sırası: `sensitive → package`; `remote → package`; `sameNetwork && size <= 100 MiB → nearby`; `cameraAvailable && size <= 10 MiB → live`; kalan durumda `package`. VaultDrop 50 MiB üstünde seçilirse reason, kullanıcıya mevcut kanalın boyut sınırını açıklayacak; otomatik dosya yükleme yapılmayacak.

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test -- src/__tests__/method-registry.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/transfer/method-registry.js src/__tests__/method-registry.test.js
git commit -m "feat: centralize transfer method registry"
```

---

### Task 2: Gönder/al seçicileri ve tembel panel yükleme

**Files:**
- Modify: `src/TransferMethodSelector.jsx`
- Modify: `src/ReceiveMethodSelector.jsx`
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/App.css`
- Modify: `src/__tests__/transfer-page-shell.test.jsx`
- Modify: `src/__tests__/mobile-receive-flow.test.jsx`
- Create: `src/__tests__/three-method-routing.test.jsx`

**Interfaces:**
- Consumes: Task 1 registry, `SendPanel`, `ReceivePanel`, `NearbyTransferPanel`, `SecurePackagePanel`
- Produces: üç kartlı gönder/al yönlendirmesi ve yalnız aktif panel yaşam döngüsü

- [ ] **Step 1: Üç yöntem ve seçilmeyen panel izolasyon testlerini yaz**

```jsx
expect(screen.getByRole("button", { name: /Canlı QR/ })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Yakındaki Cihazlar/ })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /VaultDrop/ })).toBeInTheDocument();
expect(screen.queryByText(/QR Video/)).not.toBeInTheDocument();

await user.click(screen.getByRole("button", { name: /Yakındaki Cihazlar/ }));
expect(await screen.findByLabelText("Yakındaki cihaza gönderilecek dosya")).toBeInTheDocument();
expect(cameraFactory).not.toHaveBeenCalled();
expect(vaultDropWorkerFactory).not.toHaveBeenCalled();
```

Al ekranında “Kameradan tara”, “Yakındaki cihaz kodunu gir”, “VaultDrop paketini aç” kartları bulunacak. Yöntem değişiminde önceki panel unmount ve cleanup testleri çalışacak.

- [ ] **Step 2: Testleri çalıştır ve iki kartlı mevcut arayüzde kırıldığını doğrula**

Run: `npm test -- src/__tests__/three-method-routing.test.jsx src/__tests__/transfer-page-shell.test.jsx src/__tests__/mobile-receive-flow.test.jsx`

Expected: FAIL because Nearby cards/panel are absent.

- [ ] **Step 3: Seçicileri registry üzerinden üret**

Gönder başlığı “Alıcı nerede?”, al başlığı “Nasıl alacaksın?” olacak. Kart sırası Canlı QR, Yakındaki Cihazlar, VaultDrop olacak; VaultDrop kartında uzak/hassas dosya önerisi gösterilecek.

- [ ] **Step 4: Ağır panelleri React.lazy ile ayır**

```jsx
const LiveSendPanel = lazy(() => import("../SendPanel.jsx"));
const LiveReceivePanel = lazy(() => import("../ReceivePanel.jsx"));
const NearbyTransferPanel = lazy(() => import("../NearbyTransferPanel.jsx"));
const SecurePackagePanel = lazy(() => import("../SecurePackagePanel.jsx"));
```

Her branch benzersiz `key` alacak ve yalnız seçili yöntem render edilecek. `Suspense` fallback “Yöntem hazırlanıyor…” olacak. Varsayılan gönder/al yöntemi `package` kalacak; kullanıcı açıkça seçmeden kamera veya WebRTC başlamayacak.

- [ ] **Step 5: Responsive üç kart düzenini ekle**

Masaüstünde üç eşit kolon; 900 px altında tek kolon kullanılacak. Kart metni, badge ve butonlar 320 px viewportta taşmayacak. Klavye focus halkası ve `aria-pressed` korunacak.

- [ ] **Step 6: Testleri çalıştır**

Run: `npm test -- src/__tests__/three-method-routing.test.jsx src/__tests__/transfer-page-shell.test.jsx src/__tests__/mobile-receive-flow.test.jsx`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

```bash
git add src/TransferMethodSelector.jsx src/ReceiveMethodSelector.jsx src/pages/TransferPage.jsx src/App.css src/__tests__
git commit -m "feat: route three transfer methods"
```

---

### Task 3: Nearby kullanım politikası, kota ve geçmiş kaydı

**Files:**
- Modify: `src/transfer/usage-policy.js`
- Modify: `server/validation.js`
- Modify: `src/pages/ProfilePage.jsx`
- Modify: `src/__tests__/usage-policy.test.js`
- Modify: `server/__tests__/validation.test.js`
- Modify: `src/__tests__/auth-profile-ui.test.jsx`
- Modify: `server/__tests__/auth-api.test.js`

**Interfaces:**
- Consumes: registry limitleri, mevcut reservation/finalization API
- Produces: `method: "nearby"` için tek dosya/100 MiB ve profil etiketi “Yakındaki Cihazlar”

- [ ] **Step 1: İstemci ve sunucu politika testlerini yaz**

```js
expect(() => validateTransferSelection([file(100 * MIB)], {
  method: "nearby", user: member,
})).not.toThrow();
expect(() => validateTransferSelection([file((100 * MIB) + 1)], {
  method: "nearby", user: member,
})).toThrow(/100 MiB/);
expect(() => validateTransferSelection([file(1), file(1)], {
  method: "nearby", user: member,
})).toThrow(/tek dosya/);
```

Server testi `transferReservationSchema` ve `transferSchema` içinde `nearby` kabulünü, 100 MiB + 1 reddini, `live_qr` 10 MiB ve `secure_package` 50 MiB sınırlarının değişmemesini doğrulayacak.

- [ ] **Step 2: Testleri çalıştır ve enum/sınır nedeniyle kırıldığını doğrula**

Run: `npm test -- src/__tests__/usage-policy.test.js server/__tests__/validation.test.js src/__tests__/auth-profile-ui.test.jsx server/__tests__/auth-api.test.js`

Expected: FAIL on unknown `nearby` and old Canlı QR limit.

- [ ] **Step 3: Politika sınırlarını ekle**

```js
export const NEARBY_MAX_BYTES = 100 * MIB;

if (method === "nearby" && normalized.length !== 1) {
  throw new RangeError("Yakındaki Cihazlar yalnızca tek dosya destekler.");
}
if (method === "nearby" && totalBytes > NEARBY_MAX_BYTES) {
  throw new RangeError("Yakındaki Cihazlar en fazla 100 MiB destekler.");
}
```

Server `itemSchema.max(100 * MiB)` olacak, fakat yöntem bazlı `secure_package` 50 MiB ve `live_qr` 10 MiB denetimleri korunacak. Yeni kayıt şemaları yalnız `live_qr`, `nearby`, `secure_package` kabul edecek; `qr_video` yalnız `transferQuerySchema` içinde eski geçmiş kayıtlarını filtrelemek için kalacak.

- [ ] **Step 4: Kota kesinleştirme zamanını bağla**

Nearby gönderici dosya seçildiğinde rezervasyon alacak; alıcı `accept-file` göndermeden önce hata/iptal olursa `failed`; son `complete` ve karşı uç doğrulama onayı sonrası `completed` olacak. Stale dosya değişimi completed kaydını `failed` iadesiyle düzeltecek.

- [ ] **Step 5: Profil etiketini ekle**

```js
const METHOD_LABELS = {
  live_qr: "Canlı QR",
  nearby: "Yakındaki Cihazlar",
  secure_package: "VaultDrop",
  qr_video: "Eski QR Video kaydı",
};
```

- [ ] **Step 6: Testleri çalıştır**

Run: `npm test -- src/__tests__/usage-policy.test.js server/__tests__/validation.test.js src/__tests__/auth-profile-ui.test.jsx server/__tests__/auth-api.test.js src/__tests__/activity-client.test.js`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

```bash
git add src/transfer/usage-policy.js server/validation.js src/pages/ProfilePage.jsx src/__tests__/usage-policy.test.js server/__tests__/validation.test.js src/__tests__/auth-profile-ui.test.jsx server/__tests__/auth-api.test.js
git commit -m "feat: add nearby transfer policy and activity"
```

---

### Task 4: Yöntem değiştirme ve VaultDrop geri dönüşü

**Files:**
- Create: `src/transfer/use-method-handoff.js`
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/SendPanel.jsx`
- Modify: `src/NearbyTransferPanel.jsx`
- Modify: `src/SecurePackagePanel.jsx`
- Create: `src/__tests__/method-handoff.test.jsx`

**Interfaces:**
- Produces:

```js
useMethodHandoff() => {
  handoff: { from, to, reason, file } | null,
  requestHandoff({ from, to: "package", reason, file }): void,
  consumeHandoff(targetMethod): File | null,
  clearHandoff(): void
}
```

- [ ] **Step 1: Dosyayı ağ isteği olmadan VaultDrop'a taşıma testini yaz**

```jsx
await user.upload(screen.getByLabelText("Canlı QR ile gönderilecek belge"), fileOverLimit);
await user.click(screen.getByRole("button", { name: "VaultDrop ile devam et" }));
expect(screen.getByRole("button", { name: /VaultDrop/ })).toHaveAttribute("aria-pressed", "true");
expect(screen.getByText(fileOverLimit.name)).toBeInTheDocument();
expect(fetchBodies).not.toContain(fileMarker);
```

Nearby 15 saniye timeout ve desteklenmeyen WebRTC yolları aynı handoff'u kullanacak. VaultDrop paneli dosyayı sadece yerel prop/state üzerinden alacak; URL, sessionStorage veya sunucuya koymayacak.

- [ ] **Step 2: Testi çalıştır ve ortak handoff bulunmadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/method-handoff.test.jsx`

Expected: FAIL with missing hook/CTA.

- [ ] **Step 3: Tek kullanımlık bellek içi handoff'u ekle**

Hook dosya nesnesini yalnız TransferPage yaşam döngüsü boyunca tutacak. `consumeHandoff("package")` aynı File referansını bir kez döndürüp iç kaydı silecek. Sayfa yenilenirse dosya korunmayacak; kullanıcıdan yeniden seçim istenecek.

- [ ] **Step 4: Kaynak panellere açık geri dönüş CTA'sı ekle**

Canlı QR limit/ekran/kamera hatasında ve Nearby timeout/WebRTC unsupported hatasında “VaultDrop ile devam et” butonu görünecek. Otomatik yöntem değişimi yapılmayacak; kullanıcı butona basacak. Handoff başlamadan önce kaynak panel tüm worker, kamera, peer ve timerlarını kapatacak.

- [ ] **Step 5: SecurePackagePanel başlangıç dosyasını kabul etsin**

```jsx
export default function SecurePackagePanel({ view, user, initialFile = null }) {
  // initialFile nesli yalnız create görünümünde bir kez seçime dönüştürülür.
}
```

Başlangıç dosyası yine `validateTransferSelection()` ve VaultDrop 50 MiB sınırından geçecek; sınır aşılırsa açık hata gösterecek.

- [ ] **Step 6: Testleri çalıştır**

Run: `npm test -- src/__tests__/method-handoff.test.jsx src/__tests__/secure-package-ui.test.jsx src/__tests__/send-panel-quota.test.jsx src/__tests__/nearby-transfer-ui.test.jsx`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

```bash
git add src/transfer/use-method-handoff.js src/pages/TransferPage.jsx src/SendPanel.jsx src/NearbyTransferPanel.jsx src/SecurePackagePanel.jsx src/__tests__/method-handoff.test.jsx
git commit -m "feat: hand off failed local methods to vaultdrop"
```

---

### Task 5: VaultDrop güvenlik sözleşmesini üç yöntem içinde koruma

**Files:**
- Modify: `src/SecurePackagePanel.jsx`
- Modify: `src/__tests__/secure-package-ui.test.jsx`
- Modify: `src/__tests__/vaultdrop-network-isolation.test.jsx`
- Modify: `src/__tests__/encrypted-container.test.js`
- Modify: `src/__tests__/safe-download-name.test.js`

**Interfaces:**
- Consumes: mevcut BTA2 create/open, BTA1/BTA2 decrypt, güvenli indirme adı
- Produces: yeni `.vdrop`, eski `.bta` okuma ve iki taraflı SHA görünürlüğü

- [ ] **Step 1: Üç yöntem entegrasyonunda VaultDrop regresyon testlerini genişlet**

```jsx
expect(screen.getByRole("link", { name: "VaultDrop paketini indir" }))
  .toHaveAttribute("download", expect.stringMatching(/^vaultdrop-.+\.vdrop$/));
expect(document.body.textContent).not.toContain(packageKey);
expect(fetchBodies).not.toContain(fileMarker);
```

Testler yeni `.vdrop` üretimi, `.vdrop/.bta` accept, BTA1 fixture, BTA2 tam metadata anahtar kümesi, AES-GCM bozulma, özgün/saklanan SHA ve kullanıcıya gösterilen gönderen/alıcı SHA eşleşmesini koruyacak.

- [ ] **Step 2: VaultDrop regresyon paketini çalıştır**

Run: `npm test -- src/__tests__/secure-package-ui.test.jsx src/__tests__/vaultdrop-network-isolation.test.jsx src/__tests__/encrypted-container.test.js src/__tests__/safe-download-name.test.js`

Expected: PASS before source changes; any failure integration regression olarak ele alınacak.

- [ ] **Step 3: Yalnız gerekli arayüz uyarlamasını yap**

SecurePackagePanel başlığında “Uzak veya hassas dosya için VaultDrop” alt metni olacak. Anahtar paket adına, indirme URL'sine, DOM data attribute'larına veya ağ isteğine yazılmayacak. `.bta` hiçbir yeni paket/ürün adı olarak gösterilmeyecek; yalnız dosya seçici ve “eski paket uyumluluğu” açıklamasında kalacak.

- [ ] **Step 4: Regresyon testlerini yeniden çalıştır**

Run: `npm test -- src/__tests__/secure-package-ui.test.jsx src/__tests__/vaultdrop-network-isolation.test.jsx src/__tests__/encrypted-container.test.js src/__tests__/safe-download-name.test.js`

Expected: PASS.

- [ ] **Step 5: Kontrol noktası oluştur**

```bash
git add src/SecurePackagePanel.jsx src/__tests__/secure-package-ui.test.jsx src/__tests__/vaultdrop-network-isolation.test.jsx src/__tests__/encrypted-container.test.js src/__tests__/safe-download-name.test.js
git commit -m "test: preserve vaultdrop security contract"
```

---

### Task 6: Ürün metinleri, landing ve SSS tutarlılığı

**Files:**
- Modify: `README.md`
- Create: `SECURITY.md`
- Modify: `src/pages/LandingPage.jsx`
- Modify: `src/components/TransferDemo.jsx`
- Modify: `src/components/SiteFooter.jsx`
- Modify: `src/content/landingContent.js`
- Modify: `src/content/faqContent.js`
- Modify: `src/pages/FaqPage.jsx`
- Modify: `src/__tests__/landing-page.test.jsx`
- Modify: `src/__tests__/faq-page.test.jsx`
- Modify: `src/__tests__/docs-security-contract.test.js`
- Modify: `src/__tests__/readme-limits.test.js`

**Interfaces:**
- Produces: bütün ana kullanıcı yüzeylerinde aynı üç yöntem ve doğru güvenlik iddiaları

- [ ] **Step 1: Üç yöntem ve yasaklı iddialar için metin testlerini yaz**

```js
expect(readme).toContain("Canlı QR");
expect(readme).toContain("Yakındaki Cihazlar");
expect(readme).toContain("VaultDrop");
expect(readme).not.toMatch(/tamamen sunucusuz/i);
expect(readme).toContain("Dosya içeriği tanıştırma sunucusuna yüklenmez");
```

UI testleri landing demo, üç adım, footer ve SSS'de üç yöntemi bulacak; QR Video ve renkli QR'ı aktif yöntem olarak bulmayacak.

- [ ] **Step 2: Testleri çalıştır ve iki yöntemli eski metinlerde kırıldığını doğrula**

Run: `npm test -- src/__tests__/landing-page.test.jsx src/__tests__/faq-page.test.jsx src/__tests__/docs-security-contract.test.js src/__tests__/readme-limits.test.js`

Expected: FAIL on missing Nearby and stale serverless/QR Video copy.

- [ ] **Step 3: Kullanıcı metinlerini karar tablosuna göre güncelle**

Ana açıklama şu anlamı koruyacak: “Yan yanaysa Canlı QR, aynı Wi-Fi'daysa Yakındaki Cihazlar, uzaktaysa veya dosya hassassa VaultDrop.” Canlı QR'ın şifreli olmadığı; Nearby'nin WebRTC ile şifreli olduğu ama doğrudan bağlantının bazı ağlarda kurulamayabileceği; VaultDrop anahtarının ayrı kanaldan gönderilmesi açıkça yazılacak.

- [ ] **Step 4: Güvenlik belgesini oluştur**

`SECURITY.md` tehdit modeli ekranı gören kamera, kötü niyetli oda kodu denemesi, sinyal sunucusu, ağ dinleyicisi, bozuk paket ve yanlış dosya adı tehditlerini ayrı maddelerle açıklayacak. Loglanmayan değerler ve SHA sonrası indirme kapısı üç yöntem için ayrı yazılacak.

- [ ] **Step 5: Metin testlerini çalıştır**

Run: `npm test -- src/__tests__/landing-page.test.jsx src/__tests__/faq-page.test.jsx src/__tests__/docs-security-contract.test.js src/__tests__/readme-limits.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add README.md SECURITY.md src/pages/LandingPage.jsx src/components/TransferDemo.jsx src/components/SiteFooter.jsx src/content/landingContent.js src/content/faqContent.js src/pages/FaqPage.jsx src/__tests__
git commit -m "docs: explain three transfer methods"
```

---

### Task 7: Özellik kapıları ve güvenli geri dönüş

**Files:**
- Create: `src/config/feature-flags.js`
- Modify: `src/transfer/method-registry.js`
- Modify: `src/pages/TransferPage.jsx`
- Create: `src/__tests__/feature-flags.test.js`
- Modify: `src/__tests__/three-method-routing.test.jsx`

**Interfaces:**
- Produces:

```js
getFeatureFlags(environment = import.meta.env) => {
  nearbyEnabled: boolean,
  liveQr10MiBEnabled: boolean,
  liveQrFastProfileEnabled: boolean,
}

getEffectiveMethodRegistry(flags) => ReadonlyArray<TransferMethod>
```

- [ ] **Step 1: Varsayılan kapalı deneysel özellik testlerini yaz**

```js
expect(getFeatureFlags({})).toEqual({
  nearbyEnabled: false,
  liveQr10MiBEnabled: false,
  liveQrFastProfileEnabled: false,
});
expect(getFeatureFlags({ VITE_ENABLE_NEARBY: "true" }).nearbyEnabled).toBe(true);
```

Canlı QR 10 MiB kapısı kapalıysa `getEffectiveMethodRegistry()` Canlı QR sınırını mevcut doğrulanmış 1 MiB değere düşürecek; Nearby kapalıysa kart “Yakında” etiketiyle disabled olacak ve VaultDrop çalışmaya devam edecek. Hızlı profil kapalıysa Dengeli/Uyumlu profiller etkilenmeyecek.

- [ ] **Step 2: Testi çalıştır ve flag modülü olmadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/feature-flags.test.js src/__tests__/three-method-routing.test.jsx`

Expected: FAIL with missing module.

- [ ] **Step 3: Kesin boolean parserı ekle**

Yalnız tam küçük harf `"true"` değeri özelliği açacak. Eksik, `1`, `TRUE`, boş veya başka değer kapalı sayılacak. UI kapalı özellik için ağır modülü import etmeyecek.

- [ ] **Step 4: Kapıları registry ve sayfaya bağla**

Nearby kartı kapalı durumda açıklamasıyla gösterilecek veya üretim kararı gereği tamamen gizlenebilecek; test ve ürün metni aynı seçimi kullanacak. Bu planın varsayılanı kartı “Yakında” badge'iyle disabled göstermektir. Manuel kabul belgesi imzalanınca yalnız ortam değişkeni açılacak; kod değiştirilmeden geri kapanabilecek.

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test -- src/__tests__/feature-flags.test.js src/__tests__/three-method-routing.test.jsx src/__tests__/method-registry.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/config/feature-flags.js src/transfer/method-registry.js src/pages/TransferPage.jsx src/__tests__/feature-flags.test.js src/__tests__/three-method-routing.test.jsx
git commit -m "feat: gate new transfer methods safely"
```

---

### Task 8: Birleşik kabul matrisi ve yayın doğrulaması

**Files:**
- Create: `docs/three-method-acceptance-test.md`
- Create: `src/__tests__/three-method-security-contract.test.jsx`
- Modify: `docs/live-qr-10mib-manual-test.md`
- Modify: `docs/nearby-devices-manual-test.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: ilk iki planın kabul formları ve tamamlanmış ürün yönlendirmesi
- Produces: tek yayın kararı ve geri dönüş kaydı

- [ ] **Step 1: Birleşik güvenlik sözleşmesi testini yaz**

```js
expect(activeMethods()).toEqual(["live", "nearby", "package"]);
expect(httpBodies).not.toContain(fileMarker);
expect(downloadsBeforeVerification).toHaveLength(0);
expect(qrVideoButtons).toHaveLength(0);
expect(colorQrButtons).toHaveLength(0);
```

Test yöntem değişiminde önceki kamera/peer/workerların kapandığını; stale sonuçların yeni yönteme indirme veya hata yazamadığını; VaultDrop anahtarının DOM/ağ/URL'ye sızmadığını kapsayacak.

- [ ] **Step 2: Birleşik otomatik test paketini çalıştır**

Run: `npm test -- src/__tests__/three-method-security-contract.test.jsx src/__tests__/three-method-routing.test.jsx src/__tests__/method-handoff.test.jsx src/__tests__/vaultdrop-network-isolation.test.jsx src/__tests__/nearby-network-isolation.test.jsx src/__tests__/live-qr-10mib-performance.test.js`

Expected: PASS.

- [ ] **Step 3: Manuel karar tablosunu doldurulabilir biçimde ekle**

Belge üç bölüm taşıyacak:

1. Canlı QR: tasarım belgesindeki 10 MiB başarı/süre matrisi.
2. Nearby: Windows/macOS tarayıcı çiftleri, 1/25/100 MiB, SHA ve 15 saniye fallback.
3. VaultDrop: Windows↔macOS ve telefon↔PC `.vdrop`, eski `.bta`, ad/MIME/byte/SHA.

Her satır `PASS/FAIL`, tarayıcı sürümü, cihaz, süre, deneme sayısı ve hata kodu olmadan tamamlanmış sayılmayacak.

- [ ] **Step 4: Tam test, lint ve build çalıştır**

Run: `npm test`

Expected: all existing and new tests PASS, with only explicitly documented skips.

Run: `npm run lint`

Expected: exit 0; yeni hata ve uyarı 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Yayın kararını uygula**

Canlı QR matrisi geçmezse `liveQr10MiBEnabled=false`; Nearby matrisi veya ağ izolasyonu geçmezse `nearbyEnabled=false`; VaultDrop her durumda çalışan uzak/hassas dosya yöntemi olarak kalacak. QR Video ve renkli QR geri getirilmeyecek.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add docs/three-method-acceptance-test.md docs/live-qr-10mib-manual-test.md docs/nearby-devices-manual-test.md src/__tests__/three-method-security-contract.test.jsx README.md
git commit -m "test: verify three method product release"
```
