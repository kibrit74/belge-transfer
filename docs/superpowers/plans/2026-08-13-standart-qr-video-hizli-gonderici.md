# Standart QR Video Hızlı Gönderici Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2,36 MB standart siyah-beyaz `Dengeli` QR Videoyu orta seviye Android Chrome cihazda en fazla 120 saniyede, tercihen 60–90 saniyede üretmek.

**Architecture:** QRF1 metinleri doğal QR matris boyutunda 2–4 Web Worker tarafından hazırlanacak, en fazla sekiz karelik sınırlı tamponda tutulacak ve ana ekran yalnız küçük bitmapleri keskin biçimde 900×900 profil bölgelerine büyütecek. QRF1, 1.400 bayt sembol, yüzde 50 kurtarma payı, hata düzeltme seviyesi `M`, video çözünürlüğü ve alıcı sözleşmesi değişmeyecek.

**Tech Stack:** React 19, Vite 8, Vitest 4, `qrcode` 1.5.4, Web Worker, Canvas 2D, MediaRecorder, mevcut QRF1/fountain şifreli aktarım katmanı.

## Global Constraints

- Onaylı tasarım: `docs/superpowers/specs/2026-08-13-standart-qr-video-hizli-gonderici-design.md`.
- Bağlayıcı hedef: 2,36 MB sıkıştırılamayan veri için toplam üretim süresi `<= 120 saniye`; tercih edilen aralık `60–90 saniye`.
- QRF1 metni, `encodeFrameV4`, 1.400 bayt sembol, `1.5` emission ratio ve QR hata düzeltme seviyesi `M` değişmeyecek.
- `balanced`: 1920×1080, 24 FPS, iki QR; `compatible`: 1280×720, 15 FPS, tek QR olarak kalacak.
- Standart üretici hiçbir QR için 900×900 ara `ImageData` üretmeyecek.
- Worker sayısı 2–4; hazır tampon en fazla sekiz video karesi olacak.
- Şifreleme anahtarı QR metnine, worker mesajına veya kurtarma kaydına eklenmeyecek.
- Worker kullanılamazsa aynı doğal boyutlu raster üretimi ana ekranda güvenli yedek olarak çalışacak.
- Renkli QR/CRF2 koduna dokunulmayacak.
- Yeni bağımlılık eklenmeyecek.
- Proje Git deposu değildir. `git init`, commit, branch veya başka Git komutu çalıştırılmayacak.
- Her üretim değişikliği önce beklenen nedenle başarısız olan testle başlayacak.
- Her görev kanıtı `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-gonderici/task-N-report.md` içine yazılacak.

## File Map

### Yeni dosyalar

- `src/video/qr-raster.js` — QR metnini modül başına tek piksellik doğal RGBA rasterına dönüştürür.
- `src/workers/standard-qr-render.worker.js` — raster işlemini arka planda yürütür ve piksel tamponunu aktarır.
- `src/video/qr-render-pool.js` — 2–4 işçiye tek aktif görev dağıtır; sıra, iptal ve kapanışı yönetir.
- `src/video/qr-frame-preloader.js` — en fazla sekiz video karesini sıralı tüketim için hazırlar.
- `src/__tests__/qr-raster.test.js` — doğal boyut, renk paleti, kenar ve hata davranışları.
- `src/__tests__/standard-qr-render-worker.test.js` — worker mesaj sözleşmesi ve aktarılabilir tampon.
- `src/__tests__/qr-render-pool.test.js` — işçi sınırı, eşzamanlılık, sıra, hata ve iptal.
- `src/__tests__/qr-frame-preloader.test.js` — sekiz kare sınırı ve sıra dışı worker sonuçları.
- `src/__tests__/standard-qr-render-roundtrip.test.js` — gerçek QRF1 metninin büyütülüp gerçek okuyucuyla geri okunması.
- `scripts/benchmark-standard-qr-render.mjs` — 2,36 MB için kare sayısı ve ara piksel azaltımını ölçer.

### Değişecek dosyalar

- `src/video/create-qr-video.js` — worker/prefetch hızlı yol, doğal raster çizimi, abort ve kaynak temizliği.
- `src/__tests__/create-qr-video.test.js` — doğal raster, zamanlama, fallback ve abort regresyonları.
- `src/__tests__/create-qr-video-v4.test.js` — QRF1 alanları, çift QR, kurtarma ve worker yaşam döngüsü.
- `src/VideoTransferPanel.jsx` — `preparing` aşaması ve anlaşılır durum metni.
- `src/__tests__/video-transfer-ui.test.jsx` — yeni aşama ve mevcut oluşturma akışı.
- `docs/standard-qr-video-performance-test.md` — gönderici için 2,36 MB / 120 saniye gerçek cihaz satırı.

---

### Task 1: Doğal Boyutlu Siyah-Beyaz QR Rasterı

**Files:**

- Create: `src/video/qr-raster.js`
- Create: `src/__tests__/qr-raster.test.js`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-gonderici/task-1-report.md`

**Interfaces:**

- Consumes: `QRCode.create(text, { errorCorrectionLevel: "M" })`.
- Produces: `rasterizeQrText(text, options?) -> { width: number, height: number, pixels: Uint8ClampedArray, moduleCount: number, margin: number }`.

- [ ] **Step 1: Doğal raster sözleşmesini RED testleriyle yaz**

`src/__tests__/qr-raster.test.js`:

```js
import { describe, expect, it } from "vitest";
import { rasterizeQrText } from "../video/qr-raster.js";

describe("standart QR doğal rasterı", () => {
  it("modül başına tek piksel ve iki modül beyaz kenar üretir", () => {
    const raster = rasterizeQrText("HELLO WORLD");

    expect(raster).toMatchObject({ moduleCount: 21, margin: 2, width: 25, height: 25 });
    expect(raster.pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(raster.pixels).toHaveLength(25 * 25 * 4);
    expect(Array.from(raster.pixels.slice(0, 4))).toEqual([255, 255, 255, 255]);
  });

  it("yalnız tam opak siyah ve beyaz piksel üretir", () => {
    const { pixels } = rasterizeQrText("QRF1|test-verisi");
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
    }
    expect(colors).toEqual(new Set(["255,255,255,255", "0,0,0,255"]));
  });

  it("boş olmayan metin ve güvenli kenar ister", () => {
    expect(() => rasterizeQrText("")).toThrow(TypeError);
    expect(() => rasterizeQrText("veri", { margin: -1 })).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: RED testini çalıştır**

```powershell
npm test -- --run src/__tests__/qr-raster.test.js
```

Expected: `../video/qr-raster.js` bulunamadığı için test dosyası başarısız olur.

- [ ] **Step 3: Doğal raster üretimini uygula**

`src/video/qr-raster.js`:

```js
import QRCode from "qrcode";

export function rasterizeQrText(text, { margin = 2 } = {}) {
  if (typeof text !== "string" || text.length === 0) {
    throw new TypeError("QR metni boş olamaz.");
  }
  if (!Number.isSafeInteger(margin) || margin < 0 || margin > 16) {
    throw new RangeError("QR kenarı güvenli sınırlar içinde olmalı.");
  }

  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const moduleCount = qr.modules.size;
  const width = moduleCount + (margin * 2);
  const pixels = new Uint8ClampedArray(width * width * 4);

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= margin && y >= margin
        && x < width - margin && y < width - margin;
      const dark = inside && qr.modules.get(y - margin, x - margin);
      const value = dark ? 0 : 255;
      const offset = ((y * width) + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }

  return { width, height: width, pixels, moduleCount, margin };
}
```

- [ ] **Step 4: GREEN ve lint çalıştır**

```powershell
npm test -- --run src/__tests__/qr-raster.test.js
npx oxlint src/video/qr-raster.js src/__tests__/qr-raster.test.js
```

Expected: 3/3 test geçer ve yeni lint hatası yoktur.

- [ ] **Step 5: RED/GREEN çıktısını ve doğal raster boyutlarını görev raporuna yaz**

---

### Task 2: QR Raster Worker ve 2–4 İşçilik Havuz

**Files:**

- Create: `src/workers/standard-qr-render.worker.js`
- Create: `src/video/qr-render-pool.js`
- Create: `src/__tests__/standard-qr-render-worker.test.js`
- Create: `src/__tests__/qr-render-pool.test.js`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-gonderici/task-2-report.md`

**Interfaces:**

- Consumes: `rasterizeQrText(text)` from Task 1.
- Produces: `createQrRasterWorkerMessageHandler({ postMessage, rasterize }?)`.
- Produces: `createQrRenderPool({ workerFactory?, size? }?) -> { render(text, context), close() }`.
- `context`: `{ frameIndex: number, regionIndex: number, signal?: AbortSignal }`.
- `render` result: `{ frameIndex, regionIndex, width, height, pixels: Uint8ClampedArray }`.

- [ ] **Step 1: Worker mesaj sözleşmesini RED testle tanımla**

```js
it("QR rasterını aktarılabilir piksel tamponuyla döndürür", async () => {
  const postMessage = vi.fn();
  const rasterize = vi.fn(() => ({
    width: 25,
    height: 25,
    pixels: new Uint8ClampedArray(25 * 25 * 4),
  }));
  const handleMessage = createQrRasterWorkerMessageHandler({ postMessage, rasterize });

  await handleMessage({ data: {
    id: 7,
    frameIndex: 3,
    regionIndex: 1,
    text: "QRF1|örnek",
  } });

  expect(postMessage).toHaveBeenCalledWith({
    id: 7,
    frameIndex: 3,
    regionIndex: 1,
    width: 25,
    height: 25,
    pixels: expect.any(Uint8ClampedArray),
  }, [expect.any(ArrayBuffer)]);
});
```

Hata testinde `rasterize` hata atsın; `{ id, error: { code: "QR_RENDER_ERROR", message } }` bekle.

- [ ] **Step 2: Worker testini RED çalıştır**

```powershell
npm test -- --run src/__tests__/standard-qr-render-worker.test.js
```

Expected: Worker modülü bulunamadığı için import hatası.

- [ ] **Step 3: Worker handler'ını uygula**

```js
import { rasterizeQrText } from "../video/qr-raster.js";

export function createQrRasterWorkerMessageHandler(dependencies = {}) {
  const postMessage = dependencies.postMessage ?? ((...args) => globalThis.postMessage(...args));
  const rasterize = dependencies.rasterize ?? rasterizeQrText;

  return async function handleMessage(event) {
    const { id, frameIndex, regionIndex, text } = event?.data ?? {};
    try {
      const raster = rasterize(text);
      const result = { id, frameIndex, regionIndex, ...raster };
      postMessage(result, [raster.pixels.buffer]);
    } catch (error) {
      postMessage({
        id,
        error: {
          code: "QR_RENDER_ERROR",
          message: error instanceof Error ? error.message : "QR karesi hazırlanamadı.",
        },
      });
    }
  };
}

if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = createQrRasterWorkerMessageHandler();
}
```

- [ ] **Step 4: Havuzun tek-aktif-iş ve sıra testlerini RED yaz**

İki kontrollü worker oluştur. Dört `render` çağrısından sonra her worker'ın yalnız bir `postMessage` aldığını; ilk sonuç gelince boşalan işçinin üçüncü işi aldığını doğrula. Sonuçların `frameIndex/regionIndex` değerlerini koruduğunu test et.

Abort testi:

```js
const controller = new AbortController();
const rendering = pool.render("QRF1|bekleyen", {
  frameIndex: 2,
  regionIndex: 0,
  signal: controller.signal,
});
controller.abort();
await expect(rendering).rejects.toMatchObject({ code: "ABORTED" });
```

- [ ] **Step 5: Havuz RED testini çalıştır**

```powershell
npm test -- --run src/__tests__/qr-render-pool.test.js
```

Expected: `createQrRenderPool` bulunamadığı için başarısız olur.

- [ ] **Step 6: FIFO havuzu uygula**

Havuz şu sabit sınırı kullanmalı:

```js
const requestedSize = Number.isSafeInteger(size)
  ? size
  : (globalThis.navigator?.hardwareConcurrency ?? 2) - 1;
const safeSize = Math.max(2, Math.min(4, requestedSize));
```

Her worker state'i `{ worker, activeJob: null }`, kuyruk ise FIFO dizi olmalı. `onmessage` aktif işi çözüp worker'ı boşaltmalı ve `dispatch()` çağırmalı. `close()` kuyruk ve aktif işleri `{ code: "CLOSED" }` ile reddedip yalnız havuzun oluşturduğu workerları sonlandırmalı.

Varsayılan worker fabrikası:

```js
function createDefaultWorker() {
  return new Worker(
    new URL("../workers/standard-qr-render.worker.js", import.meta.url),
    { type: "module" },
  );
}
```

- [ ] **Step 7: Worker + havuz GREEN ve lint çalıştır**

```powershell
npm test -- --run src/__tests__/standard-qr-render-worker.test.js src/__tests__/qr-render-pool.test.js
npx oxlint src/workers/standard-qr-render.worker.js src/video/qr-render-pool.js src/__tests__/standard-qr-render-worker.test.js src/__tests__/qr-render-pool.test.js
```

- [ ] **Step 8: İşçi sayısı, en yüksek aktif iş ve iptal kanıtını görev raporuna yaz**

---

### Task 3: Sekiz Karelik Sıralı Ön Hazırlama Tamponu

**Files:**

- Create: `src/video/qr-frame-preloader.js`
- Create: `src/__tests__/qr-frame-preloader.test.js`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-gonderici/task-3-report.md`

**Interfaces:**

- Consumes: `schedule: string[][]` and `renderQr(text, { frameIndex, regionIndex, signal })`.
- Produces: `createQrFramePreloader({ schedule, renderQr, signal, maxBufferedFrames? })`.
- Returned API: `{ takeNext(): Promise<QrRaster[] | null>, close(): void, stats(): { bufferedFrames, maxObservedBufferedFrames, consumedFrames } }`.

- [ ] **Step 1: Tampon sınırı ve sıra testlerini RED yaz**

```js
it("en fazla sekiz kareyi hazırlar ve sonuçları kare sırasıyla tüketir", async () => {
  const controls = [];
  const renderQr = vi.fn((text, context) => new Promise((resolve) => {
    controls.push({ text, context, resolve });
  }));
  const schedule = Array.from({ length: 12 }, (_, frameIndex) => [
    `sol-${frameIndex}`,
    `sağ-${frameIndex}`,
  ]);
  const preloader = createQrFramePreloader({ schedule, renderQr, maxBufferedFrames: 8 });

  expect(renderQr).toHaveBeenCalledTimes(16);
  expect(preloader.stats().maxObservedBufferedFrames).toBe(8);

  controls.filter(({ context }) => context.frameIndex === 1)
    .forEach(({ context, resolve }) => resolve(context));
  controls.filter(({ context }) => context.frameIndex === 0)
    .forEach(({ context, resolve }) => resolve(context));

  await expect(preloader.takeNext()).resolves.toEqual([
    expect.objectContaining({ frameIndex: 0, regionIndex: 0 }),
    expect.objectContaining({ frameIndex: 0, regionIndex: 1 }),
  ]);
  expect(renderQr).toHaveBeenCalledTimes(18);
  expect(preloader.stats().maxObservedBufferedFrames).toBe(8);
});
```

Aşağıdaki hata/sınır testlerini aynı dosyaya ekle:

```js
it("boş programda hemen null döndürür", async () => {
  const preloader = createQrFramePreloader({ schedule: [], renderQr: vi.fn() });
  await expect(preloader.takeNext()).resolves.toBeNull();
});

it("QR hazırlama hatasını değiştirmeden tüketiciye verir", async () => {
  const failure = Object.assign(new Error("QR bozuk"), { code: "QR_RENDER_ERROR" });
  const preloader = createQrFramePreloader({
    schedule: [["bozuk"]],
    renderQr: vi.fn().mockRejectedValue(failure),
  });
  await expect(preloader.takeNext()).rejects.toBe(failure);
});

it("iptal ve kapanıştan sonra yeni kare tüketmez", async () => {
  const controller = new AbortController();
  controller.abort();
  const aborted = createQrFramePreloader({
    schedule: [["kare"]],
    renderQr: vi.fn(),
    signal: controller.signal,
  });
  await expect(aborted.takeNext()).rejects.toMatchObject({ code: "ABORTED" });

  const closed = createQrFramePreloader({ schedule: [["kare"]], renderQr: vi.fn() });
  closed.close();
  await expect(closed.takeNext()).rejects.toMatchObject({ code: "CLOSED" });
});
```

- [ ] **Step 2: RED testi çalıştır**

```powershell
npm test -- --run src/__tests__/qr-frame-preloader.test.js
```

Expected: Modül bulunamadığı için import hatası.

- [ ] **Step 3: Kayan pencere tamponunu uygula**

Çekirdek durum:

```js
const limit = Math.max(1, Math.min(8, maxBufferedFrames ?? 8));
const frames = new Map();
let nextPrepareIndex = 0;
let nextTakeIndex = 0;
let maxObservedBufferedFrames = 0;

function fill() {
  while (!closed && frames.size < limit && nextPrepareIndex < schedule.length) {
    const frameIndex = nextPrepareIndex++;
    const promise = Promise.all(schedule[frameIndex].map((text, regionIndex) => (
      renderQr(text, { frameIndex, regionIndex, signal })
    )));
    frames.set(frameIndex, promise);
    maxObservedBufferedFrames = Math.max(maxObservedBufferedFrames, frames.size);
  }
}
```

`takeNext()` yalnız `nextTakeIndex` promise'ını beklemeli, Map'ten silmeli, sayacı artırmalı ve `fill()` çağırmalı. Worker sonuç sırası tüketim sırasını değiştirmemeli.

- [ ] **Step 4: GREEN ve lint çalıştır**

```powershell
npm test -- --run src/__tests__/qr-frame-preloader.test.js
npx oxlint src/video/qr-frame-preloader.js src/__tests__/qr-frame-preloader.test.js
```

- [ ] **Step 5: En yüksek tampon değerini ve sıra testini görev raporuna yaz**

---

### Task 4: Hızlı Hazırlamayı Standart Video Üreticisine Bağla

**Files:**

- Modify: `src/video/create-qr-video.js`
- Modify: `src/__tests__/create-qr-video.test.js`
- Modify: `src/__tests__/create-qr-video-v4.test.js`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-gonderici/task-4-report.md`

**Interfaces:**

- Consumes: `createQrRenderPool`, `createQrFramePreloader`, `rasterizeQrText`.
- Preserves: `createQrVideo(file, options?, onProgress?)` and all existing result fields.
- New injectable options: `qrRenderPool`, `createQrRenderPool`, `maxBufferedFrames`.

- [ ] **Step 1: 900×900 ara QR'ı yasaklayan RED testi yaz**

Mevcut `qrcode.toCanvas` mock beklentilerini kaldır. Enjekte edilen pool doğal raster döndürsün:

```js
const qrRenderPool = {
  render: vi.fn(async (_text, context) => ({
    ...context,
    width: 25,
    height: 25,
    pixels: new Uint8ClampedArray(25 * 25 * 4),
  })),
  close: vi.fn(),
};

const promise = createQrVideo(new File(["x"], "x.pdf"), {
  profileId: "balanced",
  qrRenderPool,
});
await vi.runAllTimersAsync();
await promise;

const qrCanvases = createdCanvases.filter((canvas) => !canvas.captureStream);
expect(qrCanvases.every((canvas) => canvas.width === 25 && canvas.height === 25)).toBe(true);
expect(videoContext.imageSmoothingEnabled).toBe(false);
expect(videoContext.drawImage).toHaveBeenCalledWith(
  expect.anything(), 60, 90, 900, 900,
);
```

- [ ] **Step 2: Worker yaşam döngüsü, fallback ve abort RED testlerini ekle**

- Başarıda sahip olunan pool `close()` bir kez çağrılır.
- Enjekte edilen `qrRenderPool` oturumda kullanılır fakat üretici bu dış kaynağa `close()` çağırmaz; yalnız kendi oluşturduğu pool'u kapatır ve her durumda preloader'ı kapatır.
- `createQrRenderPool` `SecurityError` atarsa `rasterizeQrText` yedeğiyle video üretilir.
- Abort sinyali kayıt sırasında verilirse sonuç `{ code: "ABORTED" }` ile reddedilir, recorder durur, stream track'leri durur, kurtarma kaydı silinmez.
- Worker sonucu hata verirse eksik blob resolve edilmez.

- [ ] **Step 3: RED video testlerini çalıştır**

```powershell
npm test -- --run src/__tests__/create-qr-video.test.js src/__tests__/create-qr-video-v4.test.js
```

Expected: Üretici hâlâ `QRCode.toCanvas(... width: 900)` kullandığı ve pool/preloader tanımadığı için yeni testler başarısız olur.

- [ ] **Step 4: Eski büyük `renderQr` yolunu doğal raster çizimiyle değiştir**

Doğal rasterı küçük tuvale yazan yardımcı:

```js
function drawRasterToCanvas(canvas, raster) {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("QR ara tuvali hazırlanamadı.");
  const imageData = context.createImageData(raster.width, raster.height);
  imageData.data.set(raster.pixels);
  context.putImageData(imageData, 0, 0);
}
```

Video context oluşturulduktan hemen sonra:

```js
videoContext.imageSmoothingEnabled = false;
```

`QRCode` importunu `create-qr-video.js` dosyasından kaldır; QR matrisi yalnız Task 1/2 katmanında üretilsin.

- [ ] **Step 5: Pool seçimi ve ana-ekran fallback'ini ekle**

```js
function createMainThreadRenderer() {
  return {
    async render(text, context) {
      return { ...context, ...rasterizeQrText(text) };
    },
    close() {},
  };
}

function resolveQrRenderer(options) {
  if (options.qrRenderPool) return { renderer: options.qrRenderPool, owned: false };
  try {
    const factory = options.createQrRenderPool ?? createQrRenderPool;
    return { renderer: factory(), owned: true };
  } catch (error) {
    options.onPerformanceWarning?.(error);
    return { renderer: createMainThreadRenderer(), owned: true };
  }
}
```

- [ ] **Step 6: Preloader'ı kayıt döngüsüne bağla**

```js
const preloader = createQrFramePreloader({
  schedule,
  signal: options.signal,
  maxBufferedFrames: options.maxBufferedFrames ?? 8,
  renderQr: (text, context) => renderer.render(text, context),
});
reportProgress(onProgress, "preparing", 0);
let preparedFrame = await preloader.takeNext();
throwIfVideoAborted(options.signal);
reportProgress(onProgress, "preparing", 100);
recorder.start();
```

Her `drawNextFrame` hazır `preparedFrame` rasterlarını küçük QR tuvallerine yazıp mevcut profil bölgelerine büyütsün. Sonraki kareyi `await preloader.takeNext()` ile alsın. `frameIndex` artışı yalnız çizimden sonra yapılsın.

- [ ] **Step 7: Abort ve tüm kaynak temizliğini tek finalizer'da topla**

Finalizer şunları tam bir kez yapmalı:

```js
preloader.close();
if (ownedRenderer) renderer.close();
stream.getTracks?.().forEach((track) => track.stop());
options.signal?.removeEventListener("abort", onAbort);
```

Abort hatası:

```js
function abortedVideoError() {
  return new VideoTransferError("ABORTED", "QR video oluşturma iptal edildi.");
}
```

Recorder `onstop` yalnız `recordingSucceeded === true` ise resolve ve kurtarma silme yapmalı. Hata/abort sonrasında geç `onstop` başarı yayımlamamalı.

- [ ] **Step 8: GREEN ve standart video regresyonlarını çalıştır**

```powershell
npm test -- --run src/__tests__/qr-raster.test.js src/__tests__/standard-qr-render-worker.test.js src/__tests__/qr-render-pool.test.js src/__tests__/qr-frame-preloader.test.js src/__tests__/create-qr-video.test.js src/__tests__/create-qr-video-v4.test.js
```

Expected: Doğal raster, worker, tampon, fallback, abort, çift QR ve kurtarma testleri geçer.

- [ ] **Step 9: Kaynak sahipliği ve hata yollarını görev raporuna yaz**

---

### Task 5: Üretim Ekranında Hazırlama ve Kayıt Aşamaları

**Files:**

- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/__tests__/video-transfer-ui.test.jsx`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-gonderici/task-5-report.md`

**Interfaces:**

- Consumes progress `{ stage: "preparing" | "recording", percent: number }`.
- Produces user text: `QR kareleri hazırlanıyor…` and `Video kaydediliyor…`.

- [ ] **Step 1: Yeni aşamayı RED UI testiyle yaz**

```jsx
it("QR hazırlama ile video kaydını ayrı aşamalar olarak gösterir", async () => {
  const creation = deferred();
  let reportProgress;
  createQrVideoMock.mockImplementation((_file, _options, onProgress) => {
    reportProgress = onProgress;
    onProgress({ stage: "preparing", percent: 40 });
    return creation.promise;
  });

  render(<VideoTransferPanel view="create" />);
  fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
    target: { files: [new File(["belge"], "belge.pdf", { type: "application/pdf" })] },
  });
  await screen.findByText("ornek-video-sha256");
  confirmKeySafety();
  fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

  expect((await screen.findByText("QR kareleri hazırlanıyor…")).closest("li"))
    .toHaveClass("active");
  await act(async () => reportProgress({ stage: "recording", percent: 1 }));
  expect(screen.getByText("Video kaydediliyor…").closest("li")).toHaveClass("active");

  creation.resolve({
    blob: new Blob(["video-bytes"], { type: "video/webm" }),
    keyText: SECRET_KEY,
    transferId: "Vid123456789",
    sha256: "ornek-video-sha256",
    durationSeconds: 6,
    mimeType: "video/webm",
  });
  await act(async () => { await creation.promise; });
});
```

Test fixture'ı mevcut `beforeEach` içindeki tam result yapısını kullanmalı: `blob`, `keyText`, `transferId`, `sha256`, `durationSeconds`, `mimeType`.

- [ ] **Step 2: UI RED testini çalıştır**

```powershell
npm test -- --run src/__tests__/video-transfer-ui.test.jsx
```

Expected: `preparing` aşaması ve iki yeni metin olmadığı için test başarısız olur.

- [ ] **Step 3: Aşama listesini ve aktif durum metnini ekle**

```js
const CREATE_STAGES = [
  ["encrypting", "Şifreleme"],
  ["encoding", "Kurtarma parçaları"],
  ["preparing", "QR kareleri hazırlanıyor…"],
  ["recording", "Video kaydediliyor…"],
  ["complete", "Tamamlandı"],
];
```

Mevcut yüzde ve `isCreating` davranışı korunmalı. `onPerformanceWarning` ana-ekran fallback'inde şu mesajı göstermeli:

```text
Bu cihazda paralel QR hazırlama kullanılamadı; video daha yavaş hazırlanabilir.
```

- [ ] **Step 4: GREEN ve oluşturma yaşam döngüsü testlerini çalıştır**

```powershell
npm test -- --run src/__tests__/video-transfer-ui.test.jsx src/__tests__/create-qr-video.test.js src/__tests__/create-qr-video-v4.test.js
```

- [ ] **Step 5: Görünen metinleri, fallback uyarısını ve test sonuçlarını görev raporuna yaz**

---

### Task 6: Gerçek QR Roundtrip, Benchmark ve Nihai Kabul

**Files:**

- Create: `src/__tests__/standard-qr-render-roundtrip.test.js`
- Create: `scripts/benchmark-standard-qr-render.mjs`
- Modify: `docs/standard-qr-video-performance-test.md`
- Create: `.superpowers/sdd/2026-08-13-standart-qr-video-hizli-gonderici/task-6-report.md`

**Interfaces:**

- Consumes: `rasterizeQrText`, gerçek `encodeFrameV4`, gerçek `jsQR`.
- Benchmark output: JSON `{ byteLength, sourceSymbols, emittedSymbols, videoFrames, nominalSeconds, naturalPixelsPerQr, legacyPixelsPerQr, pixelReductionRatio, sampledQrAverageMs }`.

- [ ] **Step 1: Gerçek QRF1 doğal-raster roundtrip testini yaz**

Test gerçek fountain sembolü ve `encodeFrameV4` ile metin üretmeli. `rasterizeQrText` sonucunu en yakın komşu yöntemiyle 900×900 RGBA görüntüye büyütüp `jsQR` ile okumalı:

```js
const decoded = jsQR(scaled.data, scaled.width, scaled.height, {
  inversionAttempts: "dontInvert",
});
expect(decoded?.data).toBe(frameText);
expect(parseFrameV4(decoded.data)).toEqual(expect.objectContaining({
  protocolVersion: "QRF1",
  transferId: "QrRenderTst1",
  symbolId: 0,
}));
```

Beklenen metin üretim kodundan bağımsız olarak `frameText` değişkenindeki gerçek `encodeFrameV4` çıktısıdır; test raster ve ölçekleme sırasında bozulmayı yakalar.

- [ ] **Step 2: Roundtrip testini çalıştır**

```powershell
npm test -- --run src/__tests__/standard-qr-render-roundtrip.test.js
```

Expected: Gerçek doğal raster 900×900'e büyütüldükten sonra aynı QRF1 metni okunur. Test başarısızsa üretim tamamlanmış sayılmaz; hata düzeltme seviyesi veya protokol değiştirilmez, raster koordinatları düzeltilir.

- [ ] **Step 3: Deterministik benchmark scriptini yaz**

Script 2,36 MiB deterministik veri üretmeli, `blockBytes: 1400`, `emissionRatio: 1.5` ile fountain encoder kurmalı, ilk 30 gerçek QRF1 metnini rasterlaştırmalı ve JSON yazmalı. Kabul kontrolleri:

```js
if (result.nominalSeconds > 60) process.exitCode = 1;
if (result.pixelReductionRatio < 20) process.exitCode = 1;
if (result.naturalPixelsPerQr >= 900 * 900) process.exitCode = 1;
```

`sampledQrAverageMs` yalnız masaüstü tanı ölçümüdür; Android 120 saniye kabulünün yerine geçmez.

- [ ] **Step 4: Benchmark ve hedefli entegrasyon grubunu çalıştır**

```powershell
node scripts/benchmark-standard-qr-render.mjs
npm test -- --run src/__tests__/qr-raster.test.js src/__tests__/standard-qr-render-worker.test.js src/__tests__/qr-render-pool.test.js src/__tests__/qr-frame-preloader.test.js src/__tests__/standard-qr-render-roundtrip.test.js src/__tests__/create-qr-video.test.js src/__tests__/create-qr-video-v4.test.js src/__tests__/video-transfer-ui.test.jsx src/__tests__/decode-qr-video-v4.test.js
```

Expected: Benchmark exit code 0; bütün hedefli testler geçer.

- [ ] **Step 5: Gerçek cihaz formuna gönderici satırı ekle**

`docs/standard-qr-video-performance-test.md` tablosuna:

```md
| Orta seviye Android / Chrome — gönderici | 2,36 MB sıkıştırılamayan | Yaklaşık 56 sn | ___ sn üretim | Aynı/Farklı | Geçti/Kaldı |
```

Geçme koşulu üretim `<= 120 saniye`, video yaklaşık 56 saniye, alıcı çıktı SHA-256 aynı, sekme kapanmıyor ve telefon kullanılabilir kalıyor.

- [ ] **Step 6: Tam otomatik doğrulamayı taze çalıştır**

```powershell
cmd /c npm test
cmd /c npm run lint
cmd /c npm run build
```

Expected:

- Testler 0 failure ile biter; yalnız önceden kayıtlı skip kabul edilir.
- Lint exit code 0; eski `color-frame-v1.js` ve `AuthContext.jsx` uyarıları yeni hata sayılmaz, yeni dosyalarda uyarı kabul edilmez.
- Build exit code 0; mevcut 500 kB chunk uyarısı rapora yazılır.

- [ ] **Step 7: Orta seviye Android Chrome'da bağlayıcı performans testini yap**

1. 2,36 MB sıkıştırılamayan fixture'ın SHA-256 değerini kaydet.
2. Dengeli profili seç ve `QR video oluştur` düğmesine basarken kronometreyi başlat.
3. İndirilebilir video hazır olduğunda kronometreyi durdur.
4. Video süresini medya bilgisinden kaydet.
5. Videoyu alıcı akışında açıp çıktı ad/MIME/boyut/SHA-256 değerlerini karşılaştır.
6. Sonucu performans belgesine yaz.

Expected: Üretim `<= 120 saniye`, video yaklaşık 56 saniye ve SHA-256 aynı. Fiziksel cihaz yoksa otomatik doğrulamalar tamamlanabilir ancak “120 saniye hedefi gerçek cihazda doğrulandı” denmez.

- [ ] **Step 8: Nihai raporu yaz**

Rapor şunları içermeli:

- Değişen/eklenen dosyalar.
- Her RED testinin beklenen başarısızlık nedeni.
- Hedefli ve tam test sayıları ile exit code'lar.
- Benchmark JSON çıktısı.
- En yüksek worker, aktif iş, tampon kare ve piksel belleği değerleri.
- Gerçek Android sonucu veya açık kalan fiziksel cihaz kabulü.
- Yeni uyarılar ile önceden var olan uyarıların ayrımı.

---

## Final Acceptance Checklist

- [ ] Standart QR üretici 900×900 ara QR `ImageData` üretmiyor.
- [ ] QR rasterı modül başına tek piksel, iki modül beyaz kenar ve `M` hata düzeltme kullanıyor.
- [ ] Varsayılan worker sayısı 2–4 ve her worker tek aktif iş taşıyor.
- [ ] Hazır tampon sekiz video karesini aşmıyor.
- [ ] İşçiler sıra dışı tamamlansa bile video kareleri doğru sırada çiziliyor.
- [ ] Video tuvali `imageSmoothingEnabled = false` kullanıyor.
- [ ] Worker olmayan cihazda doğal boyutlu ana-ekran fallback'i çalışıyor.
- [ ] İptal/hata worker, preloader, recorder ve stream kaynaklarını kapatıyor.
- [ ] QRF1, 1.400 bayt, 1.5 oranı, `M` seviyesi, profil çözünürlük/FPS/koordinatları değişmedi.
- [ ] Gerçek doğal raster → 900×900 → QR okuyucu roundtrip testi aynı QRF1 metnini veriyor.
- [ ] Sonuç alanları ve şifreli kurtarma davranışı geriye uyumlu.
- [ ] Tam test, lint ve build exit code 0.
- [ ] Gerçek Android'de 2,36 MB üretim 120 saniye veya altında.
- [ ] Alıcı çıktısının SHA-256 değeri kaynakla aynı.
