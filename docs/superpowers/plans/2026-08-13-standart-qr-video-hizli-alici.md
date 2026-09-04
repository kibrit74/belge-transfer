# Standart QR Video Hızlı Alıcı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 MiB büyüklüğündeki standart siyah-beyaz `Dengeli` QR Videoyu orta seviye Android Chrome cihazda dosya bütünlüğünü koruyarak en fazla 180 saniyede, tercihen 90–150 saniyede açmak.

**Architecture:** Gönderici ve QRF1 protokolü değişmeden kalacak. Alıcı videoyu sürekli oynatarak kareleri 1280×720 çözünürlükte işleyecek, iki QR bölgesini sınırlı bir işçi kuyruğuna verecek ve dosya SHA-256 kontrolünden geçtiği anda duracak. Sıralı kare okuma kullanılamazsa mevcut zaman-atlamalı tarayıcı güvenli yedek olarak çalışacak.

**Tech Stack:** React 19, Vite 8, Vitest 4, Web Worker, `requestVideoFrameCallback`, Canvas 2D, `zxing-wasm`, mevcut QRF1 alım oturumu.

## Global Constraints

- Onaylı tasarım belgesi: `docs/superpowers/specs/2026-08-13-standart-qr-video-hizli-alici-design.md`.
- Gönderici video biçimi, QRF1 çerçevesi, `balanced`/`compatible` profilleri, şifreleme ve SHA-256 denetimi değiştirilmeyecek.
- Renkli QR motoru ve renkli laboratuvar görünürlüğü bu planın dışında kalacak.
- Ana standart QR Video ekranı renkli probu çalıştırmayacak; doğrudan API kullanan eski çağrılar için otomatik renkli algılama varsayılan olarak korunacak.
- Kuyruk en fazla iki video karesi tutacak; her işçi aynı anda yalnız bir QR bölgesi çözecek.
- Yeni bağımlılık eklenmeyecek.
- Çalışma klasörü Git deposu değildir. `git init`, commit veya başka Git komutu çalıştırılmayacak.
- Her görev test-önce uygulanacak: önce beklenen RED, sonra en küçük GREEN değişikliği, ardından ilgili regresyonlar.
- Her görevin kanıtı `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-alici/task-N-report.md` dosyasına yazılacak.

## File Map

### Yeni dosyalar

- `src/video/sequential-video-frame-reader.js` — sıralı kare sunma, iki karelik sınır, duraklat/devam ve 1×–2× hız kontrolü.
- `src/__tests__/sequential-video-frame-reader.test.js` — okuyucu yaşam döngüsü ve kuyruk testleri.
- `src/__tests__/decode-qr-video-sequential.test.js` — hızlı yol, erken bitiş, yedek yol ve renkli prob ayrımı.
- `docs/standard-qr-video-performance-test.md` — gerçek cihaz kabul formu.

### Değişecek dosyalar

- `src/optical/frame-layout.js` — profil koordinatlarını hedef çözünürlüğe ölçekleme.
- `src/__tests__/optical-frame-layout.test.js` — 720p çift-bölge geometrisi.
- `src/video/qr-worker-pool.js` — her işçiye tek aktif iş veren sınırlı kuyruk.
- `src/__tests__/qr-worker-pool.test.js` — eşzamanlı çağrı, sıra, iptal ve kapanış.
- `src/video/decode-qr-video.js` — sıralı hızlı yol, 720p iki bölge, erken çıkış ve seek yedeği.
- `src/__tests__/decode-qr-video-v4.test.js` — mevcut yönlendirme ve geriye dönük uyum regresyonları.
- `src/__tests__/video-decode-state.test.js` — mevcut seek yedeğinin korunması.
- `src/VideoTransferPanel.jsx` — ana ekranda standart-only çağrı, geçen süre ve 180 saniye önerisi.
- `src/__tests__/video-transfer-ui.test.jsx` — standart-only seçenek ve süre mesajı.

---

## Task 1: Profil Bazlı 720p QR Bölgeleri

**Files:**

- Modify: `src/optical/frame-layout.js`
- Modify: `src/__tests__/optical-frame-layout.test.js`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-alici/task-1-report.md`

- [ ] **Step 1: Ölçekli bölge testlerini RED olarak ekle**

`src/__tests__/optical-frame-layout.test.js` içindeki importu genişlet ve aşağıdaki testleri ekle:

```js
import { getQrRegions, scaleQrRegions } from "../optical/frame-layout.js";

it("Dengeli profilin iki QR bölgesini 1280×720 analiz alanına ölçekler", () => {
  expect(scaleQrRegions(getOpticalProfile("balanced"), 1280, 720)).toEqual([
    { x: 40, y: 60, width: 600, height: 600 },
    { x: 640, y: 60, width: 600, height: 600 },
  ]);
});

it("Uyumlu profilin tek QR bölgesini 1280×720 boyutunda korur", () => {
  expect(scaleQrRegions(getOpticalProfile("compatible"), 1280, 720)).toEqual([
    { x: 280, y: 0, width: 720, height: 720 },
  ]);
});

it("geçersiz hedef boyutunu reddeder", () => {
  expect(() => scaleQrRegions(getOpticalProfile("balanced"), 0, 720)).toThrow(TypeError);
});
```

- [ ] **Step 2: RED testini çalıştır**

Run:

```powershell
npm test -- --run src/__tests__/optical-frame-layout.test.js
```

Expected: `scaleQrRegions` export edilmediği için test dosyası başarısız olur.

- [ ] **Step 3: En küçük ölçekleme uygulamasını yaz**

`src/optical/frame-layout.js` sonuna şu API'yi ekle:

```js
export function scaleQrRegions(profile, targetWidth, targetHeight) {
  if (!Number.isSafeInteger(targetWidth) || targetWidth < 1
    || !Number.isSafeInteger(targetHeight) || targetHeight < 1) {
    throw new TypeError("Hedef video boyutu geçersiz.");
  }

  const scaleX = targetWidth / profile.width;
  const scaleY = targetHeight / profile.height;

  return getQrRegions(profile).map((region) => ({
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    width: Math.round(region.size * scaleX),
    height: Math.round(region.size * scaleY),
  }));
}
```

- [ ] **Step 4: GREEN ve optik profil regresyonlarını çalıştır**

```powershell
npm test -- --run src/__tests__/optical-frame-layout.test.js src/__tests__/optical-profiles.test.js
```

Expected: Tüm testler geçer; 1920×1080 üretici geometrisi değişmez.

- [ ] **Step 5: Görev raporuna RED/GREEN komutlarını, sonuç sayılarını ve değişen dosyaları yaz**

---

## Task 2: Her İşçiye Tek Aktif İş Veren Kuyruk

**Files:**

- Modify: `src/video/qr-worker-pool.js`
- Modify: `src/__tests__/qr-worker-pool.test.js`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-alici/task-2-report.md`

- [ ] **Step 1: Kontrol edilebilir sahte işçi ve eşzamanlılık testini ekle**

Test yardımcısı iş sonuçlarını otomatik döndürmemeli:

```js
function makeControlledWorker() {
  return {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
    complete(callIndex, texts) {
      const message = this.postMessage.mock.calls[callIndex][0];
      this.onmessage?.({ data: { id: message.id, texts } });
    },
  };
}

it("bir işçi tamamlanmadan aynı işçiye ikinci işi göndermez", async () => {
  const workers = [makeControlledWorker(), makeControlledWorker()];
  let index = 0;
  const pool = createQrWorkerPool({ workerFactory: () => workers[index++], size: 2 });
  const regions = [
    { imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) } },
    { imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) } },
  ];

  const first = pool.decode(regions);
  const second = pool.decode(regions);

  expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
  expect(workers[1].postMessage).toHaveBeenCalledTimes(1);

  workers[0].complete(0, ["ilk-sol"]);
  await Promise.resolve();
  expect(workers[0].postMessage).toHaveBeenCalledTimes(2);

  workers[1].complete(0, ["ilk-sağ"]);
  workers[0].complete(1, ["ikinci-sol"]);
  await Promise.resolve();
  workers[1].complete(1, ["ikinci-sağ"]);

  await expect(first).resolves.toEqual(["ilk-sol", "ilk-sağ"]);
  await expect(second).resolves.toEqual(["ikinci-sol", "ikinci-sağ"]);
  pool.close();
});
```

Ayrıca kuyrukta bekleyen isteğin iptal edildiğinde `postMessage` almamasını ve `close()` sonrasında tüm bekleyen sözlerin `CLOSED` ile reddedilmesini test et.

- [ ] **Step 2: RED testini çalıştır**

```powershell
npm test -- --run src/__tests__/qr-worker-pool.test.js
```

Expected: Mevcut havuz aynı işçiye ikinci çağrıyı hemen gönderdiği için eşzamanlılık testi başarısız olur.

- [ ] **Step 3: Havuzu boş işçi + FIFO kuyruk düzenine geçir**

Mevcut dış API değişmeyecek: `decode(regions, signal)` ve `close()`.

Uygulama çekirdeği şu durumu kullanmalı:

```js
const queue = [];
const workerStates = workers.map((worker) => ({ worker, activeJob: null }));

function dispatch() {
  if (closed) return;
  for (const state of workerStates) {
    if (state.activeJob || queue.length === 0) continue;
    const job = queue.shift();
    if (job.signal?.aborted) {
      job.reject(new QrWorkerPoolError("ABORTED", "QR çözme iptal edildi."));
      continue;
    }
    state.activeJob = job;
    pending.set(job.id, { ...job, state });
    state.worker.postMessage({
      id: job.id,
      regionIndex: job.regionIndex,
      imageData: job.imageData,
    });
  }
}
```

İşçi sonucu geldiğinde `activeJob = null` yap, sonucu ilgili `decode` çağrısındaki bölge sırasına yerleştir ve tekrar `dispatch()` çağır. Aktif iş iptal edilirse işçiyi zorla boş sayma; geç sonuç gelene kadar aynı işçiye yeni iş gönderme. Böylece iki mesaj aynı işçide üst üste binmez.

- [ ] **Step 4: GREEN ve hata yollarını çalıştır**

```powershell
npm test -- --run src/__tests__/qr-worker-pool.test.js src/__tests__/decode-qr-video-v4.test.js
```

Expected: Sıralama, iptal, kapanış ve mevcut video testleri geçer.

- [ ] **Step 5: Görev raporuna en yüksek gözlenen aktif iş sayısını ve test kanıtlarını yaz**

---

## Task 3: İki Kareyle Sınırlı Sıralı Video Okuyucu

**Files:**

- Create: `src/video/sequential-video-frame-reader.js`
- Create: `src/__tests__/sequential-video-frame-reader.test.js`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-alici/task-3-report.md`

- [ ] **Step 1: Okuyucu sözleşmesini testlerle tanımla**

Yeni API:

```js
readSequentialVideoFrames(video, {
  signal,
  maxPendingFrames: 2,
  captureFrame,
  processFrame,
  onProgress,
})
```

Testlerde elle tetiklenebilen sahte video kullan:

```js
function makeFrameVideo() {
  let callbackId = 0;
  const callbacks = new Map();
  return {
    duration: 10,
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    ended: false,
    play: vi.fn(async function play() { this.paused = false; }),
    pause: vi.fn(function pause() { this.paused = true; }),
    requestVideoFrameCallback: vi.fn((callback) => {
      const id = ++callbackId;
      callbacks.set(id, callback);
      return id;
    }),
    cancelVideoFrameCallback: vi.fn((id) => callbacks.delete(id)),
    emit(mediaTime) {
      const entry = callbacks.entries().next().value;
      callbacks.delete(entry[0]);
      this.currentTime = mediaTime;
      entry[1](performance.now(), { mediaTime });
    },
  };
}
```

Şu davranışları ayrı testlerle doğrula:

- API yoksa `{ code: "SEQUENTIAL_UNSUPPORTED" }`.
- En fazla iki `processFrame` sözü bekler; üçüncü kare için yeni callback kurmaz ve `pause()` çağırır.
- Bir iş tamamlanınca video devam eder ve callback yeniden kurulur.
- Arka arkaya 12 rahat karede hız 1.5×, 24 karede 2× olur; hiçbir zaman 2× aşılmaz.
- Kuyruk dolunca hız 1× olur.
- `processFrame` ilk kez değer döndürdüğünde sonraki kare alınmaz ve aynı değer sonuç olur.
- Abort callback'i iptal eder, videoyu durdurur ve `{ code: "ABORTED" }` ile reddeder.
- Video bittikten sonra bekleyen işler süzülür; sonuç çıkmazsa `null` döner.

- [ ] **Step 2: RED testini çalıştır**

```powershell
npm test -- --run src/__tests__/sequential-video-frame-reader.test.js
```

Expected: Modül henüz olmadığı için import hatası alınır.

- [ ] **Step 3: Okuyucuyu küçük ve bağımsız bir modül olarak uygula**

Hata sınıfı ve giriş doğrulaması:

```js
export class SequentialVideoFrameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SequentialVideoFrameError";
    this.code = code;
  }
}

function assertSequentialVideoSupport(video) {
  if (typeof video?.requestVideoFrameCallback !== "function"
    || typeof video?.cancelVideoFrameCallback !== "function"
    || typeof video?.play !== "function") {
    throw new SequentialVideoFrameError(
      "SEQUENTIAL_UNSUPPORTED",
      "Bu cihaz sıralı video karesi okumayı desteklemiyor.",
    );
  }
}
```

`readSequentialVideoFrames(video, options = {})` bu destek kontrolünü ilk satırda çağırmalı; ardından aşağıdaki `maxPending`, callback kimliği, bekleyen iş sayısı ve tek temizleme fonksiyonunu kurmalıdır. Buradaki blok tam hata sınıfını ve desteklenmeme koşulunu tanımlar; ana durum makinesi bir sonraki bloktaki kesin kurallarla uygulanır.

Durum makinesi şu kesin kuralları izlemeli:

```js
const maxPending = Math.max(1, Math.min(2, options.maxPendingFrames ?? 2));
let pendingCount = 0;
let frameCallbackId = null;
let settled = false;
let calmFrames = 0;

function updatePlaybackRate(backpressured) {
  if (backpressured) calmFrames = 0;
  else calmFrames += 1;
  video.playbackRate = calmFrames >= 24 ? 2 : calmFrames >= 12 ? 1.5 : 1;
}
```

Her karede `captureFrame(video, metadata)` senkron çağrılmalı; böylece Canvas içeriği sonraki kare çizilmeden kendine ait `ImageData` nesnelerine kopyalanır. `processFrame` sözleri `Set` içinde izlenmeli. `pendingCount === maxPending` olduğunda video durmalı; bir iş `finally` ile düşünce yeniden başlamalı. Tek bir tamamlanma fonksiyonu callback'i, abort dinleyicisini ve videoyu her sonuç/hata yolunda temizlemeli.

- [ ] **Step 4: GREEN testini ve kaynak denetimini çalıştır**

```powershell
npm test -- --run src/__tests__/sequential-video-frame-reader.test.js
npx oxlint src/video/sequential-video-frame-reader.js src/__tests__/sequential-video-frame-reader.test.js
```

Expected: Okuyucu testleri geçer; denetim yeni hata üretmez.

- [ ] **Step 5: Görev raporuna duraklat/devam sayısını, en yüksek pending değerini ve RED/GREEN kanıtını yaz**

---

## Task 4: Hızlı Yolu Standart Video Çözücüsüne Entegre Et

**Files:**

- Modify: `src/video/decode-qr-video.js`
- Create: `src/__tests__/decode-qr-video-sequential.test.js`
- Modify: `src/__tests__/decode-qr-video-v4.test.js`
- Modify: `src/__tests__/video-decode-state.test.js`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-alici/task-4-report.md`

- [ ] **Step 1: Hızlı yolun davranış testlerini yaz**

Bağımlılıkları seçenekle enjekte edilebilir tut. `decodeQrVideo` seçeneklerine şunları ekle:

```js
{
  allowColor = true,
  readSequentialFrames = readSequentialVideoFrames,
  createWorkerPool,
}
```

Yeni test dosyasında şu senaryoları kur:

1. `allowColor: false` iken renkli client/probe oluşturulmaz.
2. 1920×1080 kaynak video hızlı yolda 1280×720 çizilir ve iki adet 600×600 bölge işçiye gider.
3. 1280×720 uyumlu kaynak tek 720×720 bölge verir.
4. Alım oturumu tamamlandığında sıralı okuyucu değer döndürür; sonraki kare çözülmez.
5. `SEQUENTIAL_UNSUPPORTED` hatası mevcut seek geçişini başlatır.
6. Sıralı geçiş `null` dönerse yalnız yarım-kare kaydırılmış tamamlama geçişi aynı alım oturumuyla çalışır.
7. SHA-256 uyuşmazlığı yedek taramaya düşmez ve dosya yayımlamaz.

Çift bölge beklentisi:

```js
expect(workerPool.decode).toHaveBeenCalledWith([
  expect.objectContaining({ imageData: expect.objectContaining({ width: 600, height: 600 }) }),
  expect.objectContaining({ imageData: expect.objectContaining({ width: 600, height: 600 }) }),
], expect.any(AbortSignal));
```

- [ ] **Step 2: RED testi çalıştır**

```powershell
npm test -- --run src/__tests__/decode-qr-video-sequential.test.js
```

Expected: `allowColor`, sıralı okuyucu ve profil bazlı 720p iki bölge henüz bağlanmadığı için testler başarısız olur.

- [ ] **Step 3: Renkli yönlendirme seçeneğini geriye uyumlu ekle**

`decodeQrVideo` başında varsayılan davranışı koru:

```js
export async function decodeQrVideo(file, options = {}) {
  if (options.allowColor !== false && !options.frameTexts) {
    return decodeRoutedQrVideo(file, options);
  }
  return decodeStandardQrVideo(file, options);
}
```

Doğrudan API çağrıları renkli videoyu eskisi gibi algılar; yalnız ana ürün ekranı Task 5'te `false` geçer.

- [ ] **Step 4: Kaynak profilini küçültmeden önce belirle**

Metadata yüklendikten sonra:

```js
const sourceProfile = video.videoWidth >= 1600 && video.videoHeight >= 900
  ? getOpticalProfile("balanced")
  : getOpticalProfile("compatible");
const analysisSize = fitVideoFrame(video.videoWidth, video.videoHeight, 1280, 720);
const regions = scaleQrRegions(sourceProfile, analysisSize.width, analysisSize.height);
```

`fitVideoFrame` oranı korumalıdır. Dengeli video için kesin sonuç 1280×720 olmalıdır. Bölge kararını küçültülmüş tuvalin çözünürlüğünden tekrar çıkarmayın; bu, çift QR'nin tek bölgeye düşmesine neden olur.

- [ ] **Step 5: Kare yakalama ve sonuç kabulünü ayır**

`captureStandardFrame` bir kez `drawImage` yapıp sahipli `ImageData` listesi döndürmeli:

```js
function captureStandardFrame(video, canvas, context, sourceProfile) {
  const size = fitVideoFrame(video.videoWidth, video.videoHeight, 1280, 720);
  canvas.width = size.width;
  canvas.height = size.height;
  context.drawImage(video, 0, 0, size.width, size.height);
  return scaleQrRegions(sourceProfile, size.width, size.height).map((region) => ({
    imageData: context.getImageData(region.x, region.y, region.width, region.height),
  }));
}
```

`processFrame` işçi sonuçlarını sırayla `acceptQrFrameText` fonksiyonuna vermeli. İlk tam sonuç SHA-256 doğrulamasını içeren mevcut `session.assemble()` yolundan gelmeli.

- [ ] **Step 6: Sıralı geçişi varsayılan, seek'i güvenli yedek yap**

Akış:

```js
let assembled = null;
try {
  assembled = await readSequentialFrames(video, {
    signal,
    maxPendingFrames: 2,
    captureFrame: () => captureStandardFrame(video, canvas, context, sourceProfile),
    processFrame: async (regions) => {
      const texts = await workerPool.decode(regions, signal);
      return acceptFrameTexts(texts);
    },
    onProgress: ({ mediaTime }) => reportScanProgress(mediaTime, video.duration),
  });
} catch (error) {
  if (error?.code !== "SEQUENTIAL_UNSUPPORTED") throw error;
  assembled = await runSeekScanPass({ offset: 0, session, signal });
}

if (!assembled && !signal?.aborted) {
  assembled = await runSeekScanPass({
    offset: FAST_SCAN_STEP_SECONDS / 2,
    session,
    signal,
  });
}
```

Sıralı API desteklenirken ortaya çıkan worker, SHA veya veri hatalarını `SEQUENTIAL_UNSUPPORTED` gibi ele alma; bunlar kullanıcıya gerçek hata olarak çıkmalıdır.

- [ ] **Step 7: GREEN ve standart regresyonları çalıştır**

```powershell
npm test -- --run src/__tests__/decode-qr-video-sequential.test.js src/__tests__/decode-qr-video-v4.test.js src/__tests__/video-decode-state.test.js src/__tests__/qr-worker-pool.test.js
```

Expected: Hızlı yol ve yedek yol testleri geçer; eski QRF1 ve renkli otomatik yönlendirme testleri bozulmaz.

- [ ] **Step 8: Görev raporuna normal yolun seek sayısını (0), yedek yolun tetik koşulunu ve test sonuçlarını yaz**

---

## Task 5: Ana Ekranı Standart Hızlı Yola Bağla ve Süreyi Göster

**Files:**

- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/__tests__/video-transfer-ui.test.jsx`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-alici/task-5-report.md`

- [ ] **Step 1: Ana ekran çağrısı ve süre mesajı için RED testleri yaz**

Ertelenmiş bir `decodeQrVideo` sözü ve sahte zaman kullan:

Mevcut test dosyasındaki `decodeQrVideoMock` adı kullanılmalı ve ilk test şu gerçek kullanıcı akışını kurmalı:

```jsx
it("ana QR Video ekranında renkli probu kapatır", async () => {
  render(<VideoTransferPanel view="open" />);
  const video = new File(["video"], "aktarim.webm", { type: "video/webm" });
  fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
    target: { files: [video] },
  });
  fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));

  await waitFor(() => expect(decodeQrVideoMock).toHaveBeenCalledWith(
    video,
    expect.objectContaining({ allowColor: false }),
  ));
});

it("tarama süresini gösterir ve 180 saniyede pratik yöntemi önerir", async () => {
  vi.useFakeTimers();
  const scan = deferred();
  decodeQrVideoMock.mockReturnValue(scan.promise);
  render(<VideoTransferPanel view="open" />);
  fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
    target: { files: [new File(["video"], "aktarim.webm", { type: "video/webm" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(181_000);
  });
  expect(screen.getByText("Geçen süre: 3:01")).toBeInTheDocument();
  expect(screen.getByText(
    "Bu cihazda QR Video taraması uzun sürüyor. Büyük dosyalarda Şifreli Paket daha hızlıdır.",
  )).toBeInTheDocument();

  scan.resolve(new Uint8Array([66, 84, 65, 49]));
  await act(async () => { await scan.promise; });
  vi.useRealTimers();
});
```

Bu test için ilk import satırına React Testing Library'den `act` ekle.

Ayrıca yeni video seçimi, başarı, hata ve unmount sonrasında zamanlayıcının temizlendiğini doğrula.

- [ ] **Step 2: RED testi çalıştır**

```powershell
npm test -- --run src/__tests__/video-transfer-ui.test.jsx
```

Expected: `allowColor: false` ve süre metni olmadığı için yeni testler başarısız olur.

- [ ] **Step 3: Standart-only çağrıyı ekle**

`handleDecodeVideo` içindeki seçeneklere ekle:

```js
const result = await decodeQrVideo(selectedDecodeFile, {
  allowColor: false,
  signal: controller.signal,
  onProgress: handleDecodeProgress,
  onScanProgress: setScanPercent,
});
```

Mevcut nesil (`openGeneration`) ve abort korumaları aynen korunmalı.

- [ ] **Step 4: Geçen süreyi yaşam döngüsüne güvenli bağla**

State ve biçimleyici:

```js
const [decodeElapsedSeconds, setDecodeElapsedSeconds] = useState(0);

function formatElapsedTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
```

Tarama başladığında `performance.now()` kaydet ve saniyede bir state güncelle. `finally`, yeni seçim, iptal ve unmount yollarında interval'i temizle. Eski bir neslin yeni taramanın interval'ini kapatmaması için interval kimliğini ref'te ve nesil numarasıyla birlikte tut.

Tarama alanında:

```jsx
<p>Geçen süre: {formatElapsedTime(decodeElapsedSeconds)}</p>
{decodeElapsedSeconds >= 180 && (
  <p role="status">
    Bu cihazda QR Video taraması uzun sürüyor. Büyük dosyalarda Şifreli Paket daha hızlıdır.
  </p>
)}
```

- [ ] **Step 5: GREEN ve kullanıcı akışı regresyonlarını çalıştır**

```powershell
npm test -- --run src/__tests__/video-transfer-ui.test.jsx src/__tests__/decode-qr-video-sequential.test.js src/__tests__/decode-qr-video-v4.test.js
```

Expected: Ana ekran renkli probu atlar; süre yalnız aktif taramada ilerler; mevcut indirme/açma akışı geçer.

- [ ] **Step 6: Görev raporuna zamanlayıcı temizlik yollarını ve test sonuçlarını yaz**

---

## Task 6: Entegrasyon, Performans Kabulü ve Tam Doğrulama

**Files:**

- Modify: `src/__tests__/optical-5mib-performance.test.js`
- Create: `docs/standard-qr-video-performance-test.md`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-alici/task-6-report.md`

- [ ] **Step 1: 5 MiB otomatik kabul testini alıcı varsayımlarıyla genişlet**

Mevcut testin gerçek 5 MiB veri, `balanced` profil, 1400 bayt sembol ve 1.5 kurtarma oranı denetimleri korunmalı. Şunları ekle:

```js
expect(profile).toMatchObject({
  width: 1920,
  height: 1080,
  fps: 24,
  qrCount: 2,
});
expect(scaleQrRegions(profile, 1280, 720)).toEqual([
  { x: 40, y: 60, width: 600, height: 600 },
  { x: 640, y: 60, width: 600, height: 600 },
]);
expect(estimatedVideoDurationSeconds).toBeLessThanOrEqual(120);
```

Bu test gerçek telefon hızını taklit ettiği iddiasında bulunmamalı; yalnız gönderilen video süresi ve analiz geometrisinin kabul sınırını korumalı.

- [ ] **Step 2: Otomatik entegrasyon grubunu çalıştır**

```powershell
npm test -- --run src/__tests__/optical-5mib-performance.test.js src/__tests__/optical-frame-layout.test.js src/__tests__/qr-worker-pool.test.js src/__tests__/sequential-video-frame-reader.test.js src/__tests__/decode-qr-video-sequential.test.js src/__tests__/decode-qr-video-v4.test.js src/__tests__/video-decode-state.test.js src/__tests__/video-transfer-ui.test.jsx
```

Expected: Bütün hedefli testler geçer. Başarısızlık varsa tam suite'e geçme.

- [ ] **Step 3: Gerçek cihaz performans formunu yaz**

`docs/standard-qr-video-performance-test.md` şu bağlayıcı tabloyu içermeli:

```md
| Cihaz/Tarayıcı | Dosya | Video süresi | Tarama süresi | SHA-256 | Sonuç |
|---|---:|---:|---:|---|---|
| Orta seviye Android / Chrome | 5 MiB sıkıştırılamayan | ___ sn | ___ sn | Aynı/Farklı | Geçti/Kaldı |
| iPhone / Safari | 5 MiB sıkıştırılamayan | ___ sn | ___ sn | Aynı/Farklı | Gözlem |
| Windows / Chrome veya Edge | 5 MiB sıkıştırılamayan | ___ sn | ___ sn | Aynı/Farklı | Regresyon |
```

Android satırının geçme koşulları:

- Tarama süresi `<= 180 saniye`.
- Çıktı adı, MIME türü ve boyutu aynı.
- SHA-256 aynı.
- Sekme kapanmıyor ve işlem sırasında cihaz kullanılabilir kalıyor.
- 90–150 saniye tercih edilen sonuçtur; yalnız 180 saniye bağlayıcı sınırdır.

- [ ] **Step 4: Tam otomatik doğrulamayı çalıştır**

```powershell
npm test -- --run
npm run lint
npm run build
```

Expected:

- Tüm test dosyaları geçer; yalnız önceden var olan açıkça kayıtlı skip kabul edilir.
- Lint yeni hata üretmez.
- Üretim derlemesi exit code 0 döner; mevcut büyük bundle uyarısı varsa rapora uyarı olarak yazılır, başarı diye gizlenmez.

- [ ] **Step 5: Orta seviye gerçek Android cihazda bağlayıcı 5 MiB testi yap**

1. Aynı 5 MiB sıkıştırılamayan fixture'ın SHA-256 değerini gönderen cihazda kaydet.
2. `Dengeli` QR Video üret.
3. Android Chrome'da videoyu seçip “QR videoyu tara” düğmesine basarken kronometreyi başlat.
4. Dosya indirilebilir hale geldiğinde kronometreyi durdur.
5. Çıktı dosyasının ad, MIME, boyut ve SHA-256 değerlerini karşılaştır.
6. Sonucu performans formuna yaz.

Expected: En fazla 180 saniye ve SHA-256 aynı. Gerçek cihaz bulunamazsa görev “otomatik testler geçti, gerçek cihaz kabulü bekliyor” olarak raporlanır; performans hedefi tamamlandı diye ilan edilmez.

- [ ] **Step 6: Nihai görev raporunu yaz**

Rapor şunları içermeli:

- Değişen ve eklenen dosyalar.
- Her komutun taze exit code'u ve test sayısı.
- Normal hızlı yolda seek sayısının sıfır olduğuna dair test kanıtı.
- Yedek seek yolunun çalıştığına dair test kanıtı.
- Gerçek Android ölçümü veya açık bekleyen kabul maddesi.
- Yeni uyarılar ile önceden var olan uyarıların ayrımı.

---

## Final Acceptance Checklist

- [ ] Standart ana ekran renkli probu çalıştırmıyor.
- [ ] Sıralı kare okuyucu desteklenen cihazda varsayılan yol.
- [ ] 1920×1080 Dengeli kaynak 1280×720 analizde iki adet 600×600 QR bölgesini koruyor.
- [ ] Kuyruk iki kareyi aşmıyor ve her işçi tek aktif iş taşıyor.
- [ ] Oynatma hızı 1×–2× aralığında ve geri basınca göre ayarlanıyor.
- [ ] Dosya SHA-256 kontrolünden geçtiği anda tarama erken bitiyor.
- [ ] Desteklenmeyen sıralı API'de eski seek yöntemi çalışıyor.
- [ ] SHA-256 hatalı dosya yayımlanmıyor.
- [ ] 180 saniyede kullanıcıya Şifreli Paket önerisi gösteriliyor; işlem zorla kesilmiyor.
- [ ] Mevcut QRF1, standart QR, şifreli paket ve video testleri geçiyor.
- [ ] Gerçek Android 5 MiB sonucu 180 saniye veya altında ve SHA-256 aynı.
- [ ] Lint ve üretim derlemesi exit code 0.
