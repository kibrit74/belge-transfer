# Mobil Canlı QR Tam Ekran Alım Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alıcı telefonda Canlı QR kamerasını güvenilir biçimde ekranı kaplayan bir tarayıcıya dönüştürmek ve doğrulanmış aktarım ilerlemesini büyük yüzde, çubuk ve parça sayısıyla göstermek.

**Architecture:** Tarama motorları ve dosya doğrulaması `ReceivePanel` içinde kalır. Yeni `LiveQrReceiveScanner` bileşeni yalnız kamera yüzeyini, mobil tam ekran davranışını, erişilebilir ilerlemeyi ve gerçek tarayıcı tam ekranı için güvenli iyileştirmeyi yönetir. Worker, son parçalar geldiğinde doğrulamaya başlamadan hemen önce görünür bir `verifying` durumu yollar.

**Tech Stack:** React 19, JavaScript, CSS, Vitest, Testing Library, mevcut Canlı QR worker ve kamera hook'ları.

## Global Constraints

- Değişiklik yalnız **Al → Canlı QR** alıcı akışını kapsar.
- Gönderici QR ekranı, QR Video, renkli QR, VaultDrop ve Yakındaki Cihazlar davranışları değişmez.
- Uygulama içi mobil tam ekran temel yoldur; `requestFullscreen()` yalnız desteklenen cihazlarda ve kullanıcı dokunuşuyla çağrılır.
- Gerçek tam ekran reddi veya desteğinin olmaması alımı durdurmaz.
- Dosya doğrulanmadan indirme bağlantısı gösterilmez.
- Mobil olmayan geniş ekranlarda mevcut kart içi kamera düzeni korunur.
- Düğmeler en az 44×44 piksel olur; çentik ve alt hareket alanı için güvenli ekran boşlukları kullanılır.
- Yeni bağımlılık eklenmez ve bütün metin/kaynak dosyaları UTF-8 kalır.
- Çalışma alanında Git deposu bulunmadığı için commit adımları uygulanmaz; her görev testli bir kontrol noktasıyla kapanır.

---

## File Structure

- Create: `src/LiveQrReceiveScanner.jsx` — sunum, ilerleme normalleştirme, gövde kaydırma kilidi ve gerçek tam ekran yaşam döngüsü.
- Create: `src/live-qr/receive-progress.js` — ilerleme değerlerini saf ve test edilebilir biçimde sınırlandırma.
- Create: `src/__tests__/mobile-live-qr-receive.test.jsx` — yeni mobil alıcı sözleşmesinin bileşen ve entegrasyon testleri.
- Modify: `src/ReceivePanel.jsx` — mevcut kamera/worker durumunu yeni tarayıcıya bağlama, kapat/yeniden aç/yeniden dene davranışı.
- Modify: `src/workers/live-qr-receive.worker.js` — bütünlük kontrolünden hemen önce `verifying` durumunu gönderme.
- Modify: `src/__tests__/live-qr-receive-worker.test.js` — `verifying → complete` sırasını ve başarısız doğrulamayı sabitleme.
- Modify: `src/App.css` — mobil tam ekran, güvenli alanlar, ilerleme ve azaltılmış hareket kuralları.
- Create: `docs/mobile-live-qr-fullscreen-manual-test.md` — Android Chrome ve iPhone Safari yayın öncesi cihaz matrisi.

---

### Task 1: Erişilebilir tarayıcı yüzeyi ve ilerleme hesabı

**Files:**
- Create: `src/LiveQrReceiveScanner.jsx`
- Create: `src/__tests__/mobile-live-qr-receive.test.jsx`

**Interfaces:**
- Consumes: React `videoRef`; `{ collected, total }` ilerlemesi; `status`; `error`; `onToggleCamera`, `onExit`, `onRetry` callback'leri.
- Produces: `normalizeReceiveProgress(progress)` ve varsayılan `LiveQrReceiveScanner` bileşeni.

- [ ] **Step 1: İlerleme ve temel görünüm için başarısız testleri yaz**

`src/__tests__/mobile-live-qr-receive.test.jsx` içinde şu sözleşmeleri kur:

```jsx
expect(normalizeReceiveProgress({ collected: 150, total: 100 })).toEqual({
  collected: 100,
  total: 100,
  percentage: 100,
  determinate: true,
});

renderScanner({ progress: { collected: 0, total: 0 } });
expect(screen.getByRole('progressbar', { name: 'Canlı QR alım ilerlemesi' }))
  .not.toHaveAttribute('aria-valuenow');
expect(screen.getByText('QR bekleniyor…')).toBeInTheDocument();

renderScanner({ progress: { collected: 42, total: 100 }, status: 'receiving' });
expect(screen.getByText('%42')).toBeInTheDocument();
expect(screen.getByText('42 / 100 parça alındı')).toBeInTheDocument();
```

- [ ] **Step 2: RED doğrulamasını çalıştır**

Run: `npm test -- src/__tests__/mobile-live-qr-receive.test.jsx`

Expected: `LiveQrReceiveScanner.jsx` bulunamadığı için FAIL.

- [ ] **Step 3: Saf ilerleme normalleştirmesini ve tarayıcı iskeletini ekle**

`normalizeReceiveProgress` geçersiz, negatif veya taşan değerleri güvenli biçimde sınırlar:

```jsx
export function normalizeReceiveProgress(progress = {}) {
  const rawTotal = Number.isFinite(progress.total) ? Math.floor(progress.total) : 0;
  const total = Math.max(0, rawTotal);
  const rawCollected = Number.isFinite(progress.collected) ? Math.floor(progress.collected) : 0;
  const collected = Math.min(total, Math.max(0, rawCollected));
  const determinate = total > 0;
  const percentage = determinate ? Math.round((collected / total) * 100) : 0;
  return { collected, total, percentage, determinate };
}
```

Bileşen aşağıdaki kararlı erişilebilirlik sözleşmesini üretir:

```jsx
<section ref={surfaceRef} className="live-receive-scanner" aria-label="Canlı QR tarayıcı">
  <header className="live-receive-header">
    <div>
      <strong>Canlı QR alınıyor</strong>
      <span role="status" aria-live="polite">{statusText}</span>
    </div>
    <button type="button" onClick={onExit} aria-label="Taramadan çık">×</button>
  </header>
  <div className="live-receive-camera">
    <video ref={videoRef} muted playsInline className="video" />
    <div className="live-receive-target" aria-hidden="true" />
  </div>
  <div className="live-receive-progress">
    <strong>{determinate ? `%${percentage}` : '—'}</strong>
    <div role="progressbar" aria-label="Canlı QR alım ilerlemesi" {...progressAria}>
      <span style={determinate ? { width: `${percentage}%` } : undefined} />
    </div>
    <span>{determinate ? `${collected} / ${total} parça alındı` : 'QR bekleniyor…'}</span>
  </div>
</section>
```

- [ ] **Step 4: GREEN doğrulamasını çalıştır**

Run: `npm test -- src/__tests__/mobile-live-qr-receive.test.jsx`

Expected: ilerleme ve temel görünüm testleri PASS.

- [ ] **Step 5: Gerçek tam ekranın yalnız kullanıcı eylemiyle çağrıldığını test et**

Testte `Element.prototype.requestFullscreen` fonksiyonunu taklit et. İlk renderda çağrılmadığını, `Gerçek tam ekran` düğmesine basılınca yüzey üzerinde bir kez çağrıldığını doğrula. Reddedilen Promise için tarayıcının ham hata metninin görünmediğini ve tarayıcı yüzeyinin DOM'da kaldığını doğrula.

- [ ] **Step 6: Tam ekran yaşam döngüsünü uygula**

- Destek kontrolünü `typeof surfaceRef.current?.requestFullscreen === 'function'` ile yap.
- Düğme tıklamasında `await surfaceRef.current.requestFullscreen({ navigationUI: 'hide' })` çağrısını `try/catch` ile koru.
- Bileşen kapanırken yalnız kendi yüzeyi `document.fullscreenElement` ise `document.exitFullscreen()` çağır.
- Mount sırasında `document.body.classList.add('live-qr-scanner-open')`, cleanup sırasında aynı sınıfı kaldır.
- Fullscreen reddinde error state üretme; alım uygulama içi tam ekranda sürsün.

- [ ] **Step 7: Task 1 testlerini yeniden çalıştır**

Run: `npm test -- src/__tests__/mobile-live-qr-receive.test.jsx`

Expected: bütün Task 1 testleri PASS.

---

### Task 2: ReceivePanel entegrasyonu, kapatma ve temiz yeniden başlama

**Files:**
- Modify: `src/ReceivePanel.jsx`
- Modify: `src/__tests__/mobile-live-qr-receive.test.jsx`
- Test: `src/__tests__/receive-panel.test.jsx`
- Test: `src/__tests__/live-qr-multi-ui.test.jsx`

**Interfaces:**
- Consumes: Task 1'deki `LiveQrReceiveScanner` props sözleşmesi.
- Produces: `scannerDismissed` yaşam döngüsü; kullanıcıya `Taramayı yeniden aç`; hata için `Tekrar dene`; worker durumunu tarayıcıya ileten `liveStatus`.

- [ ] **Step 1: Entegrasyon için başarısız testleri yaz**

Enjekte edilen alıcı istemcisiyle şu davranışları doğrula:

```jsx
act(() => subscriber({
  type: 'progress',
  state: 'collecting',
  progress: { solved: 25, sourceCount: 100 },
}));
expect(screen.getByText('%25')).toBeInTheDocument();
expect(screen.getByText('25 / 100 parça alındı')).toBeInTheDocument();

fireEvent.click(screen.getByRole('button', { name: 'Taramadan çık' }));
expect(screen.queryByLabelText('Canlı QR tarayıcı')).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Taramayı yeniden aç' })).toBeInTheDocument();

fireEvent.click(screen.getByRole('button', { name: 'Taramayı yeniden aç' }));
expect(screen.getByLabelText('Canlı QR tarayıcı')).toBeInTheDocument();
expect(screen.getByText('QR bekleniyor…')).toBeInTheDocument();
```

Tamamlanma testinde doğrulanmış `File` mesajından sonra tarayıcının kalktığını ve yalnız `Dosyayı indir` bağlantısının kaldığını doğrula. Unmount testinde gövde sınıfının ve gerçek tam ekranın temizlendiğini doğrula.

- [ ] **Step 2: RED doğrulamasını çalıştır**

Run: `npm test -- src/__tests__/mobile-live-qr-receive.test.jsx src/__tests__/receive-panel.test.jsx`

Expected: `ReceivePanel` henüz yeni tarayıcıyı kullanmadığı için yeni entegrasyon testleri FAIL.

- [ ] **Step 3: ReceivePanel'i yeni tarayıcıya bağla**

Şu state'i ekle:

```jsx
const [scannerDismissed, setScannerDismissed] = useState(false);
const [liveStatus, setLiveStatus] = useState('waiting');
```

Her iki hook'un `enabled` koşuluna `!scannerDismissed` ekle. Eski `.video-frame` bloğunu `LiveQrReceiveScanner` ile değiştir:

```jsx
<LiveQrReceiveScanner
  videoRef={liveMode ? liveScanner.videoRef : scanner.videoRef}
  progress={progress}
  status={liveStatus}
  error={error}
  onToggleCamera={toggleCamera}
  onExit={dismissScanner}
  onRetry={retryScanner}
/>
```

`dismissScanner` kısa taramayı bitirir, `scannerDismissed` değerini `true` yapar ve hook'ların `enabled: false` etkisiyle kamera akışlarını kapatır. Kapanmış durumda yalnız şu geri dönüşü göster:

```jsx
<div className="receive-resume">
  <p>Canlı QR taraması durduruldu.</p>
  <button type="button" className="btn-solid" onClick={resumeScanner}>
    Taramayı yeniden aç
  </button>
</div>
```

`resumeScanner` önce `sessionRef.current.reset()`, `liveClientRef.current?.reset()` ve `setProgress({ collected: 0, total: 0 })` çağırır; sonra hata/durum state'lerini temizleyip tarayıcıyı açar.

- [ ] **Step 4: Worker mesajlarını görünür duruma dönüştür**

`handleLiveQrMessage` içinde:

```jsx
if (message.type === 'progress') {
  setLiveStatus(message.state === 'verifying' ? 'verifying' : 'receiving');
  setProgress({
    collected: message.progress?.solved ?? 0,
    total: message.progress?.sourceCount ?? 0,
  });
  return;
}
```

`reset`, `resumeScanner` ve yeni aktarım başlangıcı `liveStatus` değerini `waiting` yapar. `complete` yalnız doğrulanmış `File` için sonucu yayınlar ve iki tarayıcıyı durdurur. `error` güvenli mevcut hata metnini kullanır.

- [ ] **Step 5: Task 2 GREEN ve gerileme testlerini çalıştır**

Run: `npm test -- src/__tests__/mobile-live-qr-receive.test.jsx src/__tests__/receive-panel.test.jsx src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/live-qr-receive-routing.test.jsx`

Expected: dört dosyanın tamamı PASS.

---

### Task 3: Worker doğrulama durumu

**Files:**
- Modify: `src/workers/live-qr-receive.worker.js`
- Modify: `src/__tests__/live-qr-receive-worker.test.js`

**Interfaces:**
- Consumes: `createLiveQrReceiveSession()` nesnesindeki `accept(frame)`, `progress()`, `assemble()` ve `getState()`.
- Produces: `{ type: 'progress', state: 'verifying', progress, sessionId }` mesajı; ardından mevcut `complete` veya `error` mesajı.

- [ ] **Step 1: Mesaj sırası için başarısız worker testini yaz**

Gerçek karelerle yapılan testte çağrı türlerini al ve sırayı doğrula:

```js
const typesAndStates = postMessage.mock.calls.map(([message]) => (
  message.type === 'progress' ? `${message.type}:${message.state}` : message.type
));
expect(typesAndStates).toContain('progress:verifying');
expect(typesAndStates.indexOf('progress:verifying')).toBeLessThan(typesAndStates.indexOf('complete'));
```

Ayrı testte `assemble()` reddederken `verifying` sonrasında `error` geldiğini ve `complete` gelmediğini doğrula.

- [ ] **Step 2: RED doğrulamasını çalıştır**

Run: `npm test -- src/__tests__/live-qr-receive-worker.test.js`

Expected: `progress:verifying` mesajı olmadığı için yeni test FAIL.

- [ ] **Step 3: Worker akışını doğrulama öncesi ilerleme mesajı gönderecek şekilde ayır**

Mevcut `acceptMany` tek çağrısını davranış eşdeğeri adımlara böl:

```js
for (const frame of frames) session.accept(frame);
const progress = session.progress();
if (progress.sourceCount > 0 && progress.solved >= progress.sourceCount) {
  postMessage({ type: 'progress', sessionId, progress, state: 'verifying' });
}
const result = await session.assemble();
postMessage({
  type: 'progress',
  sessionId,
  progress: session.progress(),
  state: session.getState(),
});
```

Sonrasında mevcut `complete` ve güvenli `error` davranışlarını koru. Testlerdeki sahte session nesnelerini aynı `accept/assemble` arayüzüne geçir.

- [ ] **Step 4: Worker GREEN ve oturum gerilemesini çalıştır**

Run: `npm test -- src/__tests__/live-qr-receive-worker.test.js src/__tests__/live-qr-receive-session.test.js`

Expected: iki dosya PASS.

---

### Task 4: Mobil tam ekran CSS ve manuel cihaz matrisi

**Files:**
- Modify: `src/App.css`
- Modify: `src/__tests__/mobile-live-qr-receive.test.jsx`
- Create: `docs/mobile-live-qr-fullscreen-manual-test.md`

**Interfaces:**
- Consumes: `.live-receive-scanner`, `.live-receive-camera`, `.live-receive-progress`, `.live-receive-actions`, `body.live-qr-scanner-open` sınıfları.
- Produces: `max-width: 650px` mobil tam ekran düzeni ve masaüstü kart düzeni.

- [ ] **Step 1: Sınıf ve erişilebilirlik sözleşmesini testte sabitle**

Tarayıcı kökünün `live-receive-scanner`, kamera alanının `live-receive-camera` ve eylemlerin `live-receive-actions` sınıfını taşıdığını doğrula. Düğmelerin görünür adlarını ve progressbar niteliklerini test et; CSS piksel değerini jsdom ile taklit etme.

- [ ] **Step 2: Mobil ve masaüstü stillerini ekle**

Temel masaüstü görünüm mevcut kart yapısını korur. `@media (max-width: 650px)` içinde:

```css
body.live-qr-scanner-open { overflow: hidden; }
.live-receive-scanner {
  position: fixed;
  inset: 0;
  z-index: 1000;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  padding: max(12px, env(safe-area-inset-top))
           max(12px, env(safe-area-inset-right))
           max(12px, env(safe-area-inset-bottom))
           max(12px, env(safe-area-inset-left));
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  background: #080808;
  color: #fff;
}
.live-receive-camera { min-height: 0; border-radius: 20px; }
.live-receive-camera .video { width: 100%; height: 100%; object-fit: cover; }
.live-receive-actions button { min-width: 44px; min-height: 44px; }
```

Belirsiz çubuk animasyonu ekle; `@media (prefers-reduced-motion: reduce)` içinde animasyonu kapat.

- [ ] **Step 3: Manuel test belgesini yaz**

`docs/mobile-live-qr-fullscreen-manual-test.md` içinde Android Chrome ve iPhone Safari için şu satırları işaretlenebilir tablo olarak yaz:

- Dikey/yatay kamera ekranı dolduruyor.
- Üst kapatma ve alt düğmeler çentik/alt hareket alanında kesilmiyor.
- İlk QR öncesi `QR bekleniyor…` görünüyor.
- Yüzde ve parça sayısı geriye gitmiyor, 100'ü aşmıyor.
- Gerçek tam ekran reddedilirse tarama devam ediyor.
- Kamera izni reddi güvenli hata ve tekrar deneme sunuyor.
- Başarıdan önce indirme yok; başarıda doğrulanmış dosya indirilebiliyor.

- [ ] **Step 4: Hedefli test, lint ve build doğrulamasını çalıştır**

Run: `npm test -- src/__tests__/mobile-live-qr-receive.test.jsx src/__tests__/receive-panel.test.jsx src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/live-qr-receive-routing.test.jsx src/__tests__/live-qr-receive-worker.test.js src/__tests__/live-qr-receive-session.test.js`

Expected: bütün hedef testler PASS.

Run: `npx oxlint src/LiveQrReceiveScanner.jsx src/ReceivePanel.jsx src/workers/live-qr-receive.worker.js src/__tests__/mobile-live-qr-receive.test.jsx src/__tests__/live-qr-receive-worker.test.js`

Expected: exit 0, yeni hata veya uyarı yok.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: İlgili ürün gerileme paketini çalıştır**

Run: `npm test -- src/__tests__/three-method-routing.test.jsx src/__tests__/three-method-security-contract.test.jsx src/__tests__/secure-package-ui.test.jsx src/__tests__/nearby-transfer-ui.test.jsx`

Expected: Canlı QR dışındaki üç yöntem sözleşmeleri dahil bütün dosyalar PASS.

---

## Self-Review Sonucu

- Spec coverage: mobil tam ekran, gerçek tam ekran geri dönüşü, ilerleme, doğrulama, başarı/hata, cleanup, erişilebilirlik, güvenli alan ve manuel cihaz matrisi Task 1–4 ile kapsandı.
- Placeholder scan: planda `TBD`, `TODO`, belirsiz “uygun şekilde” veya tanımsız arayüz bulunmuyor.
- Type consistency: `progress` bütün görevlerde `{ collected, total }`; worker durumu `waiting | receiving | verifying`; bileşen callback adları Task 1 ve Task 2'de aynıdır.
- Kapsam kontrolü: Gönderici, QR kapasitesi ve diğer aktarım yöntemleri değiştirilmez.
