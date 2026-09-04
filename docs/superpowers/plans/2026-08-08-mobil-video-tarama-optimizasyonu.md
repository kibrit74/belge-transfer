# Mobil Video Tarama Optimizasyonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobil QR video taramasını daha az işlemci ve bellek kullanacak şekilde hızlandırmak, gerçek tarama yüzdesini göstermek ve kısa kamera taramasında kare biriktirmeyi kaldırmak.

**Architecture:** Video dosyası kareleri en fazla 1280×720 çalışma alanına küçültülür ve QR metni bulunduğu anda mevcut alım oturumuna verilir. Kamera taraması yeni tuval dizisi oluşturmak yerine `useCameraScanner.decodeCanvas(video)` üzerinden tek çalışma tuvalini tekrar kullanır. Paket tamamlanınca her iki tarama da erken sonlanır.

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, jsQR, tarayıcı Video/Canvas API'leri.

## Global Constraints

- Şifreleme, anahtar doğrulama, dosya indirme ve QRT3 paket biçimi değişmeyecek.
- Video örnekleme aralığı `0.1` saniye olarak korunacak.
- Video çalışma alanı en fazla `1280×720` olacak ve görüntü oranı korunacak.
- Kamera çalışma alanı mevcut `640` piksel genişlik sınırını kullanacak.
- İlk aşamada yeni bağımlılık veya yeni arka plan işçisi eklenmeyecek.
- Kullanıcı metinleri Türkçe ve UTF-8 olacak.
- Çalışma klasörü Git deposu olmadığı için commit adımları uygulanamaz.

---

## File Structure

- `src/video/decode-qr-video.js`: Video örnekleme, küçültme, anlık QR kabulü ve tarama yüzdesi.
- `src/VideoTransferPanel.jsx`: Video tarama yüzdesini ve QR kare ilerlemesini kullanıcıya gösterme.
- `src/ReceivePanel.jsx`: Kısa kamera taramasını kare biriktirmeden sıralı çözme.
- `src/__tests__/video-decode-state.test.js`: Video küçültme, ilerleme ve erken bitirme davranışları.
- `src/__tests__/video-transfer-ui.test.jsx`: Yüzde bilgisinin arayüzde görünmesi.
- `src/__tests__/receive-panel.test.jsx`: Kamera karelerinin kayıt sonunda topluca değil, çekildiği anda çözülmesi ve temizlenmesi.
- `docs/mobile-video-manual-test.md`: Gerçek telefonda kısa doğrulama adımları.

### Task 1: Video Motorunu Anlık ve Küçültülmüş Tarama

**Files:**
- Modify: `src/video/decode-qr-video.js`
- Test: `src/__tests__/video-decode-state.test.js`

**Interfaces:**
- Consumes: `parseFrame(text)`, `createReceiveSession()`, `callbacks.onProgress(progress)`.
- Produces: `fitVideoFrame(width, height, maxWidth, maxHeight) -> { width, height }` ve `callbacks.onScanProgress({ percent, currentTime, duration })`.

- [ ] **Step 1: Küçültme testi yaz**

`src/__tests__/video-decode-state.test.js` içine şu testi ekle:

```js
import {
  DEFAULT_SCAN_STEP_SECONDS,
  decodeQrVideo,
  fitVideoFrame,
} from "../video/decode-qr-video.js";

it("yüksek çözünürlüklü videoyu oranını koruyarak 1280x720 alanına sığdırır", () => {
  expect(fitVideoFrame(3840, 2160)).toEqual({ width: 1280, height: 720 });
  expect(fitVideoFrame(1080, 1920)).toEqual({ width: 405, height: 720 });
  expect(fitVideoFrame(640, 360)).toEqual({ width: 640, height: 360 });
});
```

- [ ] **Step 2: Küçültme testinin başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/video-decode-state.test.js`

Expected: FAIL; `fitVideoFrame` dışa aktarılmadığı için test yüklenemez.

- [ ] **Step 3: En küçük küçültme yardımcısını ekle**

`src/video/decode-qr-video.js` içine ekle:

```js
export function fitVideoFrame(width, height, maxWidth = 1280, maxHeight = 720) {
  const safeWidth = Math.max(1, width || 640);
  const safeHeight = Math.max(1, height || 360);
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}
```

`decodeCurrentFrame` içinde tuval ölçülerini bu yardımcıdan al.

- [ ] **Step 4: Küçültme testini geçir**

Run: `npm test -- src/__tests__/video-decode-state.test.js`

Expected: PASS.

- [ ] **Step 5: Tarama yüzdesi ve erken bitirme testlerini yaz**

Test dosyasına aşağıdaki yerel video yardımcısını ekle. Yardımcı, gerçek tarayıcı videosu yerine metadata ve seek olaylarını kontrollü biçimde üretir:

```js
function installVideoHarness({ decodedTexts, duration = 1, width = 3840, height = 2160 }) {
  let decodeIndex = 0;
  const originalCreateElement = document.createElement.bind(document);
  const video = {
    duration,
    videoWidth: width,
    videoHeight: height,
    muted: false,
    playsInline: false,
    preload: "",
    onloadedmetadata: null,
    onseeked: null,
    onerror: null,
    removeAttribute: vi.fn(),
    load: vi.fn(),
    set src(value) {
      this.source = value;
      queueMicrotask(() => this.onloadedmetadata?.());
    },
    set currentTime(value) {
      this.position = value;
      queueMicrotask(() => this.onseeked?.());
    },
    get currentTime() {
      return this.position ?? 0;
    },
  };
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
  const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
    if (tagName === "video") return video;
    if (tagName === "canvas") return canvas;
    return originalCreateElement(tagName);
  });
  const originalUrl = globalThis.URL;
  vi.stubGlobal("URL", {
    ...originalUrl,
    createObjectURL: vi.fn(() => "blob:test-video"),
    revokeObjectURL: vi.fn(),
  });
  const decodeImage = vi.fn(() => decodedTexts[decodeIndex++] ?? null);

  return {
    decodeImage,
    options: { decodeImage, stepSeconds: 0.1 },
    restore() {
      createElement.mockRestore();
      vi.stubGlobal("URL", originalUrl);
    },
  };
}
```

Ardından iki testi ekle:

```js
it("video zamanı ilerledikçe gerçek tarama yüzdesini bildirir", async () => {
  const harness = installVideoHarness({ decodedTexts: [], duration: 1 });
  const scanProgress = vi.fn();
  try {
    await expect(
      decodeQrVideo(new File(["video"], "aktarim.webm"), { onScanProgress: scanProgress }, undefined, harness.options),
    ).rejects.toMatchObject({ code: "INCOMPLETE" });
    expect(scanProgress).toHaveBeenCalledWith({ percent: 0, currentTime: 0, duration: 1 });
    expect(scanProgress).toHaveBeenLastCalledWith({ percent: 100, currentTime: 1, duration: 1 });
  } finally {
    harness.restore();
  }
});

it("paket tamamlanınca videonun kalan karelerini taramaz", async () => {
  const encoded = await encodeFramesV3({
    bytes: new Uint8Array([1, 2, 3, 4]),
    transferId: "Ab12Cd34Ef56",
    chunkBytes: 2,
  });
  const harness = installVideoHarness({ decodedTexts: encoded.frames, duration: 1 });
  try {
    const result = await decodeQrVideo(
      new File(["video"], "aktarim.webm"),
      {},
      undefined,
      harness.options,
    );
    expect(Array.from(result)).toEqual([1, 2, 3, 4]);
    expect(harness.decodeImage).toHaveBeenCalledTimes(2);
  } finally {
    harness.restore();
  }
});
```

Test yardımcısı `document.createElement("video")`, `URL.createObjectURL`, `seeked`, `duration`, `videoWidth`, `videoHeight` ve `decodeImage` davranışlarını tamamen yerel olarak kurmalı; test sonunda sahte işlevleri geri yüklemelidir.

- [ ] **Step 6: Yeni davranış testlerinin başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/video-decode-state.test.js`

Expected: FAIL; tarama yüzdesi çağrılmaz ve mevcut uygulama bütün kare metinlerini topladığı için erken dönmez.

- [ ] **Step 7: Kareleri doğrudan oturuma aktar**

`decodeQrVideo` içinde `frameTexts` dizisini kaldır. Döngüden önce tek `createReceiveSession()` oluştur ve ilk yüzde bildirimini yap:

```js
callbacks.onScanProgress?.({ percent: 0, currentTime: 0, duration });

const frame = parseFrame(decoded);
if (frame) {
  const accepted = session.accept(frame);
  if (accepted.accepted) callbacks.onProgress?.(session.progress());
}

callbacks.onScanProgress?.({
  percent: Math.min(100, Math.round((currentTime / duration) * 100)),
  currentTime,
  duration,
});

if (session.getState() === "complete") {
  callbacks.onScanProgress?.({ percent: 100, currentTime, duration });
  return session.assemble().bytes;
}
```

Döngü biterse mevcut `INCOMPLETE` hatasını `Video tarandı fakat ${collected} / ${total} QR karesi bulundu.` metniyle üret. `options.frameTexts` test yolu `decodeQrFrameTexts` üzerinden çalışmaya devam etsin.

- [ ] **Step 8: Video motoru testlerini geçir**

Run: `npm test -- src/__tests__/video-decode-state.test.js`

Expected: PASS.

### Task 2: Gerçek Tarama Yüzdesini Arayüzde Göster

**Files:**
- Modify: `src/VideoTransferPanel.jsx`
- Test: `src/__tests__/video-transfer-ui.test.jsx`

**Interfaces:**
- Consumes: Task 1'de eklenen `callbacks.onScanProgress({ percent, currentTime, duration })`.
- Produces: `scanPercent` React durumu ve kullanıcı metni `Video taranıyor... %N`.

- [ ] **Step 1: Yüzde görünürlüğü testini yaz**

`decodeQrVideo` sahtesinin callback'i çağırmasını sağlayarak şu beklentiyi ekle:

```jsx
decodeQrVideoMock.mockImplementation(async (_file, callbacks) => {
  callbacks.onScanProgress({ percent: 42, currentTime: 4.2, duration: 10 });
  return pendingPromise;
});

fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));

expect(await screen.findByRole("button", { name: "Video taranıyor... %42" })).toBeDisabled();
```

- [ ] **Step 2: Arayüz testinin başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/video-transfer-ui.test.jsx`

Expected: FAIL; düğme yalnızca `Video taranıyor...` gösterir.

- [ ] **Step 3: Tarama yüzdesi durumunu bağla**

`VideoTransferPanel` içine `scanPercent` durumunu ekle. Yeni video seçildiğinde ve tarama başladığında sıfırla. Callback içinde sınırlandır:

```js
onScanProgress: ({ percent }) => {
  if (mountedRef.current && decodeVersionRef.current === version) {
    setScanPercent(Math.max(0, Math.min(100, Math.round(percent))));
  }
},
```

Düğme metnini şu hale getir:

```jsx
{isDecoding ? `Video taranıyor... %${scanPercent}` : "QR videoyu tara"}
```

- [ ] **Step 4: Video arayüz testlerini geçir**

Run: `npm test -- src/__tests__/video-transfer-ui.test.jsx`

Expected: PASS.

### Task 3: Kamera Kısa Taramasında Kare Biriktirmeyi Kaldır

**Files:**
- Modify: `src/ReceivePanel.jsx`
- Test: `src/__tests__/receive-panel.test.jsx`

**Interfaces:**
- Consumes: `scanner.decodeCanvas(video) -> Promise<string|null>` ve `handleDecoded(text) -> { accepted, reason? }`.
- Produces: Kare listesi oluşturmayan, aynı anda yalnızca bir çözüm çalıştıran kısa tarama döngüsü.

- [ ] **Step 1: Anlık çözüm testini yaz**

Mevcut burst testini, çözümün 8 saniye dolmadan başladığını doğrulayacak şekilde değiştir:

```jsx
fireEvent.click(screen.getByRole("button", { name: "Kısa kayıtla tara" }));

await act(async () => {
  await vi.advanceTimersByTimeAsync(200);
});

expect(jsQrMock).toHaveBeenCalled();
expect(screen.getByText(/kare tarandı/)).toBeInTheDocument();
```

Ayrıca `document.createElement` üzerinde oluşturulan `canvas` sayısını ölç ve 8 saniyelik tarama boyunca yüzlerce yeni tuval oluşmadığını doğrula:

```js
expect(createdCanvasCount).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Kamera testinin başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/receive-panel.test.jsx`

Expected: FAIL; mevcut kod kareleri önce toplar, QR çözümünü süre sonunda başlatır ve her çekimde yeni tuval oluşturur.

- [ ] **Step 3: Kısa taramayı tek çalışma alanına geçir**

`triggerBurstRecording` içindeki `capturedFrames` dizisini ve `document.createElement("canvas")` çağrısını kaldır. Zamanlayıcı içinde eşzamanlı çözümü engelleyen yerel `decodeBusy` ve `scannedFrames` değişkenleri kullan:

```js
let decodeBusy = false;
let scannedFrames = 0;

burstRecordTimerRef.current = setInterval(async () => {
  if (!mountedRef.current || !burstRecordingRef.current || decodeBusy) return;
  decodeBusy = true;
  try {
    const text = await scanner.decodeCanvas(video);
    scannedFrames += 1;
    if (text) {
      const accepted = handleDecoded(text);
      if (accepted.accepted) newlyFound += 1;
    }
    setBurstStatus(
      `Video taranıyor: kalan ${remainingSec} saniye (${scannedFrames} kare tarandı)`,
    );
  } finally {
    decodeBusy = false;
  }
}, 40);
```

Süre dolduğunda zamanlayıcıları temizleyip bekleyen Promise'i çöz. `sessionRef.current.getState() === "complete"` olduğunda aynı temizliği yaparak erken bitir. `finally` içinde canlı taramayı yalnızca bileşen hâlâ açıksa yeniden başlat.

- [ ] **Step 4: Unmount ve zamanlayıcı testlerini güncelle**

Mevcut iki unmount testini koru. Bekleyen çözüm tamamlandığında yeni tarama başlamadığını ve `vi.getTimerCount()` değerinin sıfır olduğunu doğrula.

- [ ] **Step 5: Kamera testlerini geçir**

Run: `npm test -- src/__tests__/receive-panel.test.jsx`

Expected: PASS.

### Task 4: Gerçek Telefon Kontrol Listesi ve Tam Doğrulama

**Files:**
- Create: `docs/mobile-video-manual-test.md`
- Test: `src/__tests__/video-decode-state.test.js`
- Test: `src/__tests__/video-transfer-ui.test.jsx`
- Test: `src/__tests__/receive-panel.test.jsx`

**Interfaces:**
- Consumes: Task 1–3 sonucundaki tamamlanmış mobil video ve kamera akışları.
- Produces: Tekrarlanabilir gerçek telefon kontrol listesi ve doğrulanmış üretim derlemesi.

- [ ] **Step 1: Telefon kontrol listesini yaz**

Belgede şu kesin adımları kullan:

```markdown
# Mobil QR Video Kontrolü

1. 20–50 KB arası bir PDF seçip QR video oluştur.
2. Videoyu WhatsApp ile telefona gönder ve telefonun dosyalarına indir.
3. Al > QR video dosyası ekranında videoyu seç.
4. Yüzdenin 0'dan 100'e ilerlediğini doğrula.
5. QR kare sayısının arttığını doğrula.
6. Anahtarı gir ve özgün dosyanın indirildiğini/açıldığını doğrula.
7. Al > Kameradan tara ekranında 8 saniyelik kısa taramayı başlat.
8. Tarama sırasında durum metninin değiştiğini ve telefonun kapanmadığını doğrula.
```

- [ ] **Step 2: İlgili testleri birlikte çalıştır**

Run: `npm test -- src/__tests__/video-decode-state.test.js src/__tests__/video-transfer-ui.test.jsx src/__tests__/receive-panel.test.jsx`

Expected: Tüm ilgili testler PASS.

- [ ] **Step 3: Tam test paketini çalıştır**

Run: `npm test`

Expected: Tüm test dosyaları ve testler PASS.

- [ ] **Step 4: Kod denetimini çalıştır**

Run: `npm run lint`

Expected: Çıkış kodu `0`; hata yok.

- [ ] **Step 5: Üretim derlemesini çalıştır**

Run: `npm run build`

Expected: Vite üretim derlemesi çıkış kodu `0` ile tamamlanır.

- [ ] **Step 6: Gerçek telefonda kontrol listesini uygula**

`docs/mobile-video-manual-test.md` adımlarını Android veya iPhone üzerinde uygula. Her adım için başarılı/başarısız notu kaydet; başarısızlık varsa cihaz modeli, tarayıcı adı, video uzantısı ve görünen yüzdeyi yaz.
