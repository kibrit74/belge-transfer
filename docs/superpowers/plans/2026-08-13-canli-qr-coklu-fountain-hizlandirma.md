# Çoklu Siyah-Beyaz Canlı QR ve Fountain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlı QR’ı renk kullanmadan, aynı anda 1–4 standart QR, sıra beklemeyen fountain kurtarma ve worker tabanlı tarama ile güvenilir biçimde hızlandırmak.

**Architecture:** Dosya önce doğrulanabilir fakat şifrelenmemiş `LQP1` canlı paketine dönüşecek. Paket sistematik fountain sembollerine ayrılacak ve her sembol `QRL1` standart QR metni olarak gösterilecek. Alıcı tam kamera karesinden en fazla dört standart QR’ı worker içinde çözecek, sembolleri ayrı alım workerına gönderecek ve yalnız paket SHA-256 doğrulamasından sonra dosya oluşturacak.

**Tech Stack:** React 19, `qrcode`, `zxing-wasm`, `jsqr` fallback, Web Workers, `fflate`, Web Crypto SHA-256, Vitest

## Global Constraints

- Renkli QR kullanılmayacak; bütün görsel kodlar siyah-beyaz standart QR olacak.
- Canlı QR şifreli değildir. UI, kontrollü ve yakın ortam uyarısını açıkça gösterecek.
- İlk kullanıcı sınırı tek dosya ve en fazla 5 MiB olacak.
- 5 MiB üzerindeki dosyada ağır hazırlık veya kota rezervasyonu başlamadan VaultDrop önerilecek.
- Yeni üretim `QRL1` kullanacak; eski QRT2 yalnız geçiş okuyucusu olarak kalacak.
- QRL1 tamamlanması SHA-256 doğrulaması olmadan başarı veya indirme üretemeyecek.
- Sender ekranı dar ise 1, yeterliyse 2, geniş masaüstü kabul testini geçerse en fazla 4 QR gösterecek.
- Her QR en az 280 CSS piksel hedefleyecek; QR sayısı için okunabilirlik feda edilmeyecek.
- Başlangıç blok boyutu 1.400 bayt, hata düzeltme seviyesi `M`, sessiz alan 2 modül ve gösterim hedefi 15 FPS olacak.
- Kareler hız yetiştirmek için arka arkaya sıfır beklemeyle gösterilmeyecek; her tam grup en az `1000 / 15` ms görünür kalacak.
- Yeni bağımlılık eklenmeyecek ve Decimen/başka AGPL projelerinden kod kopyalanmayacak.
- Kullanıcı metinleri ve kaynaklar UTF-8 olacak.
- Çalışma dizini Git deposu değildir. `git init` çalıştırılmayacak; görev sonlarında test çıktısı kontrol noktası olarak kaydedilecek.

---

### Task 1: Doğrulanabilir fakat şifrelenmemiş `LQP1` canlı paket

**Files:**
- Create: `src/live-qr/package-v1.js`
- Create: `src/__tests__/live-qr-package-v1.test.js`

**Interfaces:**
- Consumes: `prepareTransferPayload(bytes, options)`, `restoreTransferPayload(storedBytes, metadata)`, `sanitizeDownloadName(name)`
- Produces:

```js
createLiveQrPackage(file) => Promise<{
  bytes: Uint8Array,
  originalSha256: string,
  compression: "none" | "zlib",
  originalSize: number,
  storedSize: number,
}>

openLiveQrPackage(bytes) => Promise<{
  file: File,
  sha256: string,
  compression: "none" | "zlib",
}>
```

- [ ] **Step 1: Tur, boyut, UTF-8 ve bozulma testlerini yaz**

```js
it("LQP1 dosya adını, MIME türünü ve içeriği kayıpsız taşır", async () => {
  const input = new File(["Merhaba dünya ".repeat(100)], "dava-özeti.udf", {
    type: "application/octet-stream",
  });
  const created = await createLiveQrPackage(input);
  expect(new TextDecoder().decode(created.bytes.subarray(0, 4))).toBe("LQP1");
  const opened = await openLiveQrPackage(created.bytes);
  expect(opened.file.name).toBe("dava-özeti.udf");
  expect(opened.file.type).toBe("application/octet-stream");
  expect(await opened.file.text()).toBe(await input.text());
  expect(opened.sha256).toBe(created.originalSha256);
});

it("5 MiB üzerindeki özgün dosyayı hazırlamadan reddeder", async () => {
  const input = new File([new Uint8Array((5 * 1024 * 1024) + 1)], "buyuk.bin");
  await expect(createLiveQrPackage(input)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
});

it("bir baytı değiştirilen LQP1 paketini açmaz", async () => {
  const created = await createLiveQrPackage(new File(["gizli"], "gizli.txt"));
  const changed = new Uint8Array(created.bytes);
  changed[changed.length - 1] ^= 1;
  await expect(openLiveQrPackage(changed)).rejects.toMatchObject({ code: "HASH_MISMATCH" });
});
```

- [ ] **Step 2: Testi çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-package-v1.test.js`

Expected: FAIL with module resolution error.

- [ ] **Step 3: Sabit başlık ve kesin metadata şemasını ekle**

```js
const MAGIC = new TextEncoder().encode("LQP1");
const METADATA_LENGTH_BYTES = 4;
const MAX_METADATA_BYTES = 16 * 1024;
export const MAX_LIVE_QR_INPUT_BYTES = 5 * 1024 * 1024;
const METADATA_KEYS = [
  "name",
  "type",
  "compression",
  "originalSize",
  "storedSize",
  "originalSha256",
  "storedSha256",
];
```

Paket düzeni: 4 bayt `LQP1`, 4 bayt big-endian metadata uzunluğu, UTF-8 JSON metadata ve saklanan payload. `openLiveQrPackage()` tam olarak yedi metadata anahtarını, uzunlukları ve SHA-256 değerlerini doğrulayacak; eksik veya fazla alanı reddedecek.

- [ ] **Step 4: Oluşturma ve açma işlevlerini ekle**

```js
export async function createLiveQrPackage(file) {
  if (!(file instanceof File)) throw new TypeError("Canlı QR girdisi File olmalı.");
  if (file.size > MAX_LIVE_QR_INPUT_BYTES) throw livePackageError("FILE_TOO_LARGE");
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const prepared = await prepareTransferPayload(rawBytes, {
    fileName: file.name,
    mimeType: file.type,
  });
  const metadata = {
    name: file.name,
    type: file.type || "application/octet-stream",
    compression: prepared.compression,
    originalSize: prepared.originalSize,
    storedSize: prepared.storedSize,
    originalSha256: prepared.originalSha256,
    storedSha256: prepared.storedSha256,
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  if (metadataBytes.length > MAX_METADATA_BYTES) throw livePackageError("INVALID_PACKAGE");
  const bytes = new Uint8Array(8 + metadataBytes.length + prepared.storedBytes.length);
  bytes.set(MAGIC, 0);
  new DataView(bytes.buffer).setUint32(4, metadataBytes.length, false);
  bytes.set(metadataBytes, 8);
  bytes.set(prepared.storedBytes, 8 + metadataBytes.length);
  return {
    bytes,
    originalSha256: prepared.originalSha256,
    compression: prepared.compression,
    originalSize: prepared.originalSize,
    storedSize: prepared.storedSize,
  };
}
```

- [ ] **Step 5: Task 1 testlerini çalıştır**

Run: `npm test -- src/__tests__/live-qr-package-v1.test.js src/__tests__/payload-compression.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

LQP1 tur, boyut ve bozulma sonuçlarını uygulama notuna kaydet.

---

### Task 2: Rateless fountain sınırı ve `QRL1` kare protokolü

**Files:**
- Create: `src/live-qr/fountain.js`
- Create: `src/live-qr/frame-v1.js`
- Create: `src/__tests__/live-qr-fountain.test.js`
- Create: `src/__tests__/live-qr-frame-v1.test.js`

**Interfaces:**
- Produces: `createLiveFountainEncoder(bytes, options)`, `createLiveFountainDecoder(metadata)`
- Produces: `encodeLiveFrame(metadata, symbol)`, `parseLiveFrame(text)`

Fountain metadata:

```js
{
  transferId: string,
  sourceCount: number,
  blockBytes: number,
  originalBytes: number,
  sha256: string,
}
```

- [ ] **Step 1: Sıra kaybı, yüksek sembol kimliği ve bütünlük alanı testlerini yaz**

```js
it("%20 kayıp ve ters sırada özgün paketi kurar", async () => {
  const bytes = seededBytes(256 * 1024);
  const encoder = await createLiveFountainEncoder(bytes, {
    transferId: "Ab12Cd34Ef56",
    blockBytes: 1400,
  });
  const candidates = Array.from(
    { length: Math.ceil(encoder.metadata.sourceCount * 1.5) },
    (_, symbolId) => encoder.symbol(symbolId),
  );
  const decoder = createLiveFountainDecoder(encoder.metadata);
  candidates.filter((_, index) => index % 5 !== 0).reverse().forEach(decoder.accept);
  expect(decoder.bytes()).toEqual(bytes);
});

it("dört kat sınırının üzerindeki yeni onarım sembolünü üretir", async () => {
  const encoder = await createLiveFountainEncoder(seededBytes(4096), {
    transferId: "Ab12Cd34Ef56",
    blockBytes: 256,
  });
  const symbolId = encoder.metadata.sourceCount * 8;
  expect(encoder.symbol(symbolId)).toMatchObject({ symbolId });
});
```

- [ ] **Step 2: Testi çalıştır ve yeni modüller olmadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-fountain.test.js src/__tests__/live-qr-frame-v1.test.js`

Expected: FAIL with module resolution errors.

- [ ] **Step 3: Mevcut fountain motorunu bağımsız canlı modüle taşı ve sembol sınırını düzelt**

`src/optical/fountain.js` algoritması yeni dosyaya kopyalanacak; video modülü import edilmeyecek. Şu farklar uygulanacak:

```js
const MAX_SYMBOL_ID = 0xffff_ffff;
const MAX_ACCEPTED_MULTIPLIER = 3;

function validateSymbolId(symbolId) {
  if (!Number.isSafeInteger(symbolId) || symbolId < 0 || symbolId > MAX_SYMBOL_ID) {
    throw new RangeError("Sembol kimliği güvenli sınırı aşıyor.");
  }
}
```

Decoder aynı sembol kimliğini saklamayacak ve `Math.ceil(sourceCount * 3)` farklı sembolden fazlasını belleğe almayacak. Sınır dolduğunda `{ accepted: false, reason: "symbol-limit" }` döndürecek. `bytes()` yalnız çözüm tamamsa byte döndürecek.

- [ ] **Step 4: `QRL1` kare biçimini ekle**

```js
export const LIVE_FRAME_VERSION = "QRL1";
export const LIVE_BLOCK_BYTES = 1400;
export const MAX_LIVE_SOURCE_COUNT = 10_000;

export function encodeLiveFrame(metadata, symbol) {
  validateMetadata(metadata);
  validateSymbol(metadata, symbol);
  return [
    LIVE_FRAME_VERSION,
    metadata.transferId,
    symbol.symbolId,
    metadata.sourceCount,
    metadata.blockBytes,
    metadata.originalBytes,
    metadata.sha256,
    symbol.data.length,
    crc32Hex(symbol.data),
    toBase64Url(symbol.data),
  ].join("|");
}
```

`parseLiveFrame()` tam 10 alan, 12 karakter aktarım kimliği, 43 karakter SHA-256, 8 hex CRC32, 5 MiB + 16 KiB paket sınırı, 1.400 bayt blok sınırı ve canonical Base64URL kontrolü uygulayacak.

- [ ] **Step 5: Kare tur ve bozulma testini ekle**

```js
it("QRL1 karesini kayıpsız ayrıştırır ve CRC bozulmasını reddeder", async () => {
  const encoder = await createLiveFountainEncoder(seededBytes(2000), {
    transferId: "Ab12Cd34Ef56",
    blockBytes: 1400,
  });
  const text = encodeLiveFrame(encoder.metadata, encoder.symbol(0));
  expect(parseLiveFrame(text)).toMatchObject({
    protocolVersion: "QRL1",
    transferId: "Ab12Cd34Ef56",
    symbolId: 0,
  });
  expect(parseLiveFrame(`${text.slice(0, -1)}A`)).toBeNull();
});
```

- [ ] **Step 6: Task 2 testlerini çalıştır**

Run: `npm test -- src/__tests__/live-qr-fountain.test.js src/__tests__/live-qr-frame-v1.test.js`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

Kayıp oranı, yüksek sembol kimliği, bellek sınırı ve CRC sonuçlarını uygulama notuna kaydet.

---

### Task 3: QRL1 alım oturumu ve alım workerı

**Files:**
- Create: `src/live-qr/receive-session.js`
- Create: `src/live-qr/receive-client.js`
- Create: `src/workers/live-qr-receive.worker.js`
- Create: `src/__tests__/live-qr-receive-session.test.js`
- Create: `src/__tests__/live-qr-receive-worker.test.js`

**Interfaces:**
- Consumes: `parseLiveFrame`, `createLiveFountainDecoder`, `openLiveQrPackage`, `sha256Base64Url`
- Produces:

```js
createLiveQrReceiveSession({ maxBytes } = {}) => {
  accept(frame): { accepted: boolean, reason?: string },
  acceptMany(frames): { accepted: number, rejected: number },
  progress(): { solved: number, sourceCount: number, accepted: number, duplicates: number },
  assemble(): Promise<{ file: File, sha256: string } | null>,
  reset(): void,
  getState(): "idle" | "collecting" | "complete" | "failed",
}

createLiveQrReceiveClient({ workerFactory } = {}) => {
  accept(texts): void,
  reset(): number,
  subscribe(listener): () => void,
  close(): void,
  getSessionId(): number,
}
```

- [ ] **Step 1: Oturum izolasyonu, metadata eşleşmesi ve SHA testlerini yaz**

```js
it("başka aktarımın ve farklı metadata taşıyan karenin oturumu bozmamasını sağlar", async () => {
  const first = await makeTransfer("Ab12Cd34Ef56", "bir.txt", "A".repeat(4000));
  const second = await makeTransfer("Zy98Xw76Vu54", "iki.txt", "B".repeat(4000));
  const session = createLiveQrReceiveSession();
  expect(session.accept(first.frames[0])).toEqual({ accepted: true });
  expect(session.accept(second.frames[0])).toEqual({
    accepted: false,
    reason: "different-transfer",
  });
  first.frames.slice(1).forEach((frame) => session.accept(frame));
  expect((await session.assemble()).file.name).toBe("bir.txt");
});
```

- [ ] **Step 2: Testi çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-receive-session.test.js`

Expected: FAIL with module resolution error.

- [ ] **Step 3: Oturumu metadata kilidi ve iki aşamalı doğrulamayla ekle**

İlk geçerli kare şu alanları kilitleyecek: `transferId`, `sourceCount`, `blockBytes`, `originalBytes`, `sha256`. Sonraki bütün kareler aynı alanları taşımalı. `acceptMany()` bütün kareleri kabul ettikten sonra bir kez çözüm deneyecek; her tek karede ağır fountain çözümü çalıştırılmayacak.

```js
async function assemble() {
  if (!decoder?.isComplete()) return null;
  const packageBytes = decoder.bytes();
  if (!packageBytes || await sha256Base64Url(packageBytes) !== metadata.sha256) {
    state = "failed";
    throw receiveError("INTEGRITY_FAILED", "Canlı QR bütünlük kontrolü başarısız.");
  }
  const opened = await openLiveQrPackage(packageBytes);
  state = "complete";
  return { file: opened.file, sha256: opened.sha256 };
}
```

- [ ] **Step 4: Receive worker mesaj sözleşmesini test et**

```js
it("metin grubunu worker oturumuna ekler ve yalnız doğrulanınca complete döner", async () => {
  const worker = createInProcessReceiveWorker();
  worker.postMessage({ type: "start", sessionId: 7 });
  worker.postMessage({ type: "accept", sessionId: 7, texts: transfer.frameTexts });
  await expect(worker.nextMessage()).resolves.toMatchObject({
    type: "complete",
    sessionId: 7,
    result: { sha256: transfer.originalSha256 },
  });
});
```

- [ ] **Step 5: Worker ve istemciyi ekle**

Worker `start`, `accept`, `reset` mesajlarını destekleyecek. `accept` içindeki metinler `parseLiveFrame()` ile ayrıştırılacak; geçersiz metinler sessizce reddedilecek. `complete` mesajı `File` ve SHA-256 döndürecek. İstemci, sessionId değiştiğinde önceki mesajları yok sayacak; `close()` workerı sonlandıracak.

```js
export function createLiveQrReceiveClient({ workerFactory = defaultWorkerFactory } = {}) {
  let worker = workerFactory();
  let sessionId = 0;
  const listeners = new Set();
  worker.addEventListener("message", (event) => {
    if (event.data?.sessionId !== sessionId) return;
    for (const listener of listeners) listener(event.data);
  });
  function reset() {
    sessionId += 1;
    worker.postMessage({ type: "reset", sessionId });
    return sessionId;
  }
  function accept(texts) {
    worker.postMessage({ type: "accept", sessionId, texts });
  }
  function close() {
    sessionId += 1;
    listeners.clear();
    worker.terminate();
  }
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return { accept, reset, close, subscribe, getSessionId: () => sessionId };
}
```

- [ ] **Step 6: Task 3 testlerini çalıştır**

Run: `npm test -- src/__tests__/live-qr-receive-session.test.js src/__tests__/live-qr-receive-worker.test.js`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

Farklı aktarım, metadata uyuşmazlığı, SHA bozulması, reset ve stale worker sonuçlarını uygulama notuna kaydet.

---

### Task 4: 1/2/4 QR ekran düzeni ve worker tabanlı render

**Files:**
- Create: `src/live-qr/layout.js`
- Create: `src/live-qr/qr-raster.js`
- Create: `src/live-qr/render-pool.js`
- Create: `src/live-qr/frame-player.js`
- Create: `src/workers/live-qr-render.worker.js`
- Create: `src/__tests__/live-qr-layout.test.js`
- Create: `src/__tests__/live-qr-render.test.js`
- Create: `src/__tests__/live-qr-frame-player.test.js`

**Interfaces:**
- Produces: `selectLiveQrLayout({ width, height })`
- Produces: `rasterizeLiveQrText(text, { margin = 2 })`
- Produces: `createLiveQrRenderPool({ workerFactory, size })`
- Produces: `createLiveQrFramePlayer({ fps, renderGroup, presentGroup, setTimer, clearTimer })`

- [ ] **Step 1: Ekran boyutuna göre 1/2/4 QR testlerini yaz**

```js
it.each([
  [{ width: 390, height: 844 }, { count: 1, columns: 1 }],
  [{ width: 900, height: 700 }, { count: 2, columns: 2 }],
  [{ width: 1600, height: 900 }, { count: 4, columns: 2 }],
])("%o ekranında %o düzenini seçer", (viewport, expected) => {
  const layout = selectLiveQrLayout(viewport);
  expect(layout).toMatchObject(expected);
  expect(layout.qrSize).toBeGreaterThanOrEqual(280);
});
```

- [ ] **Step 2: Testi çalıştır ve modüller olmadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-layout.test.js src/__tests__/live-qr-render.test.js src/__tests__/live-qr-frame-player.test.js`

Expected: FAIL with module resolution errors.

- [ ] **Step 3: Güvenli layout seçimini ekle**

```js
const GAP = 16;
const MIN_QR_SIZE = 280;

export function selectLiveQrLayout({ width, height }) {
  assertDimension(width, height);
  const fourSize = Math.floor(Math.min((width - GAP) / 2, (height - GAP) / 2));
  if (width >= 1400 && height >= 800 && fourSize >= MIN_QR_SIZE) {
    return { count: 4, columns: 2, rows: 2, qrSize: fourSize, gap: GAP };
  }
  const twoSize = Math.floor(Math.min((width - GAP) / 2, height));
  if (width >= 720 && twoSize >= MIN_QR_SIZE) {
    return { count: 2, columns: 2, rows: 1, qrSize: twoSize, gap: GAP };
  }
  return { count: 1, columns: 1, rows: 1, qrSize: Math.floor(Math.min(width, height)), gap: 0 };
}
```

- [ ] **Step 4: Standart QR raster ve render workerını bağımsız canlı modüllere ekle**

`src/video/qr-raster.js`, `src/video/qr-render-pool.js` ve `src/workers/standard-qr-render.worker.js` davranışları yeni canlı dosyalara taşınacak. Yeni worker mesajı:

```js
{ id, slot, text }
```

Başarı yanıtı:

```js
{ id, slot, width, height, pixels, moduleCount, margin }
```

`pixels.buffer` transferable olarak gönderilecek. Havuz 2–4 worker ile sınırlı olacak; `close()` kuyruktaki ve aktif işleri `CLOSED` koduyla reddedip bütün sahip olunan workerları sonlandıracak.

- [ ] **Step 5: En az görünür süreyi koruyan frame playerı ekle**

```js
export function createLiveQrFramePlayer({
  fps = 15,
  renderGroup,
  presentGroup,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const frameMs = 1000 / fps;
  let stopped = false;
  let timerId = null;
  let resolveDelay = null;

  async function play(nextTexts) {
    while (!stopped) {
      const texts = nextTexts();
      const rendered = await renderGroup(texts);
      if (stopped) break;
      presentGroup(rendered);
      await new Promise((resolve) => {
        resolveDelay = resolve;
        timerId = setTimer(() => {
          timerId = null;
          resolveDelay = null;
          resolve();
        }, frameMs);
      });
    }
  }

  function stop() {
    stopped = true;
    if (timerId !== null) clearTimer(timerId);
    timerId = null;
    resolveDelay?.();
    resolveDelay = null;
  }

  return { play, stop, frameMs };
}
```

Test sahte zamanlayıcıyla iki `presentGroup` çağrısı arasında en az `1000 / 15` ms bulunduğunu doğrulayacak. Render gecikmesinden sonra sıfır ms catch-up çizimi yapılmayacak.

- [ ] **Step 6: Task 4 testlerini çalıştır**

Run: `npm test -- src/__tests__/live-qr-layout.test.js src/__tests__/live-qr-render.test.js src/__tests__/live-qr-frame-player.test.js`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

390×844, 900×700 ve 1600×900 düzenleri; worker sahipliği ve minimum görünür süre sonuçlarını uygulama notuna kaydet.

---

### Task 5: Tam kareden çoklu standart QR tarama hook’u

**Files:**
- Create: `src/live-qr/decode-pool.js`
- Create: `src/hooks/useMultiQrScanner.js`
- Create: `src/workers/live-qr-decode.worker.js`
- Create: `src/__tests__/multi-qr-scanner.test.jsx`
- Modify: `src/__tests__/camera-scanner.test.jsx`

**Interfaces:**
- Produces:

```js
useMultiQrScanner({ onDecodedBatch, enabled, facingMode, paused }) => {
  videoRef,
  canvasRef,
  error,
  restartCamera(),
  stopScanning(),
}
```

- [ ] **Step 1: Dört metin, meşgul kare düşürme ve cleanup testlerini yaz**

```jsx
it("tek kamera karesindeki dört QR metnini aynı batch ile yayımlar", async () => {
  const onDecodedBatch = vi.fn();
  const worker = fakeDecodeWorker();
  render(<ScannerHarness onDecodedBatch={onDecodedBatch} workerFactory={() => worker} />);
  await flushCamera();
  worker.emit({ id: 1, texts: ["QRL1|a", "QRL1|b", "QRL1|c", "QRL1|d"] });
  expect(onDecodedBatch).toHaveBeenCalledWith([
    "QRL1|a",
    "QRL1|b",
    "QRL1|c",
    "QRL1|d",
  ]);
});

it("unmount sırasında kamera ve bütün decode workerlarını kapatır", async () => {
  const workers = [fakeDecodeWorker(), fakeDecodeWorker()];
  const view = render(<ScannerHarness workerFactory={() => workers.shift()} />);
  await flushCamera();
  view.unmount();
  expect(trackStop).toHaveBeenCalledTimes(1);
  expect(allCreatedWorkers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
});
```

- [ ] **Step 2: Testi çalıştır ve hook bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/multi-qr-scanner.test.jsx`

Expected: FAIL with module resolution error.

- [ ] **Step 3: ZXing workerını en fazla dört sembol döndürecek biçimde ekle**

```js
const results = await readBarcodes(imageData, {
  formats: ["QRCode"],
  tryHarder: false,
  maxNumberOfSymbols: 4,
});
self.postMessage({
  id,
  texts: [...new Set(results.map((item) => item.text).filter(Boolean))].slice(0, 4),
});
```

WASM yüklenemezse worker hata kodu `WASM_UNAVAILABLE` döndürecek. Hook tek QR `BarcodeDetector`/`jsQR` yedeğine geçecek; bu yedek hız düşürür fakat aktarımı bozmaz.

- [ ] **Step 4: İki workerlı decode pool ve en güncel kare politikasını ekle**

Havuz boyutu `Math.min(2, Math.max(1, hardwareConcurrency - 1))` olacak. İki worker da meşgulse yeni kamera karesi kuyruğa eklenmeyecek; `decode()` `{ dropped: true, texts: [] }` döndürecek. Eski kareler birikmeyecek.

- [ ] **Step 5: Kamera hook’unu güvenli yaşam döngüsüyle ekle**

Kamera isteği `1280×720`, çevre kamerası ve desteklenirse sürekli odak isteyecek. Tarama `requestVideoFrameCallback` varsa onunla, yoksa 50 ms zamanlayıcıyla çalışacak. Canvas aynı boyutta yeniden boyutlandırılmayacak. `paused`, `enabled`, kamera yönü değişimi ve unmount eski istek neslini geçersiz kılacak.

```js
const texts = await decodePool.decode(imageData);
if (
  mountedRef.current &&
  generation === generationRef.current &&
  texts.length > 0
) {
  onDecodedBatchRef.current?.([...new Set(texts)].slice(0, 4));
}
```

- [ ] **Step 6: Yeni hook ve mevcut kamera regresyonunu çalıştır**

Run: `npm test -- src/__tests__/multi-qr-scanner.test.jsx src/__tests__/camera-scanner.test.jsx`

Expected: PASS; mevcut tek QR hook davranışı değişmemeli.

- [ ] **Step 7: Kontrol noktası oluştur**

Dört metin, worker meşgulken frame drop, WASM fallback, kamera yönü ve cleanup sonuçlarını uygulama notuna kaydet.

---

### Task 6: Canlı gönderici ve alıcı panel entegrasyonu

**Files:**
- Modify: `src/SendPanel.jsx`
- Modify: `src/ReceivePanel.jsx`
- Modify: `src/protocol/index.js:17-25`
- Modify: `src/__tests__/send-panel-quota.test.jsx`
- Modify: `src/__tests__/receive-panel.test.jsx`
- Modify: `src/__tests__/transfer-roundtrip.test.js`
- Create: `src/__tests__/live-qr-multi-ui.test.jsx`

**Interfaces:**
- Consumes: Task 1–5 canlı QR modülleri
- Produces: QRL1 gösteren çoklu QR gönderici ve worker tabanlı QRL1 alıcı UI

- [ ] **Step 1: Göndericide çoklu canvas ve güvenlik uyarısı testini yaz**

```jsx
it("geniş ekranda dört siyah-beyaz QR ve kontrollü ortam uyarısı gösterir", async () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  render(<SendPanel user={{ id: "user-1" }} createSession={fakeLiveSession} />);
  fireEvent.change(screen.getByLabelText("Canlı QR ile gönderilecek belge"), {
    target: { files: [new File(["x"], "x.txt")] },
  });
  expect(await screen.findAllByLabelText(/Canlı QR kodu/)).toHaveLength(4);
  expect(screen.getByText(/ekrana bakan başka bir kamera/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Alıcıda batch kabulü ve yalnız doğrulanmış indirme testini yaz**

```jsx
it("aynı karedeki QRL1 metinlerini tek batch kabul edip doğrulanan dosyayı sunar", async () => {
  const client = fakeReceiveClient();
  render(<ReceivePanel scannerHook={() => fakeMultiScanner()} receiveClient={client} />);
  fakeMultiScanner.emit(["QRL1|frame-1", "QRL1|frame-2"]);
  expect(client.accept).toHaveBeenCalledWith(["QRL1|frame-1", "QRL1|frame-2"]);
  client.emitComplete({ file: new File(["ok"], "rapor.txt"), sha256: "S".repeat(43) });
  expect(await screen.findByRole("link", { name: "Dosyayı indir" })).toHaveAttribute(
    "download",
    "rapor.txt",
  );
});
```

- [ ] **Step 3: Testleri çalıştır ve mevcut tek QRT2 döngüsünde kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/receive-panel.test.jsx`

Expected: FAIL; çoklu canvas ve QRL1 batch istemcisi bulunmamalı.

- [ ] **Step 4: Göndericiyi LQP1 → fountain → QRL1 hattına bağla**

Dosya seçiminde:

```js
const livePackage = await createLiveQrPackage(file);
const transferId = createTransferId();
const encoder = await createLiveFountainEncoder(livePackage.bytes, {
  transferId,
  blockBytes: LIVE_BLOCK_BYTES,
});
```

Her tam ekran grubunda layout sayısı kadar artan sembol üretilecek:

```js
function nextTexts() {
  return Array.from({ length: layout.count }, () => {
    const symbol = encoder.symbol(nextSymbolIdRef.current);
    nextSymbolIdRef.current += 1;
    return encodeLiveFrame(encoder.metadata, symbol);
  });
}
```

Player durduğunda render pool kapanacak. Worker açılamazsa layout tek QR’a düşecek ve ana iş parçacığı raster yedeği kullanılacak.

- [ ] **Step 5: Alıcıyı `useMultiQrScanner` ve receive workerına bağla**

`ReceivePanel`, `receiveClient.subscribe(listener)` ile `progress`, `complete` ve `error` mesajlarını dinleyecek; QRL1 için `receiveClient.accept(texts)` çağıracak. Progress mesajı `çözülen kaynak / toplam kaynak`, kabul edilen ve yinelenen sembol sayısını gösterecek. Complete mesajında URL oluşturulacak ve kamera duracak. Reset veya unmount aboneliği kaldıracak, URL’yi iptal edecek, receive workerı sıfırlayacak/kapatacak.

Eski QRT2 tek metinleri `parseLegacyFrame()` ve mevcut `createReceiveSession()` yolunda geçiş uyumluluğu olarak kalacak. Yeni gönderici QRT2 üretmeyecek. QRT3/QRF1 alım dalları yeni Canlı QR yoluna bağlanmayacak.

- [ ] **Step 6: `protocol/index.js` yönlendirmesine QRL1 ekle**

```js
import { parseLiveFrame } from "../live-qr/frame-v1.js";

export function parseFrame(text) {
  if (typeof text !== "string") return null;
  if (text.startsWith("QRL1|")) return parseLiveFrame(text);
  if (text.startsWith("QRT3|")) return parseFrameV3(text);
  return parseLegacyFrame(text);
}
```

QRF1 yönlendirmesi QR Video temizliği planında kaldırılacak.

- [ ] **Step 7: UI, protokol ve eski QRT2 regresyonlarını çalıştır**

Run: `npm test -- src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/send-panel-quota.test.jsx src/__tests__/receive-panel.test.jsx src/__tests__/transfer-roundtrip.test.js src/__tests__/protocol-v2.test.js src/__tests__/frame-v3.test.js`

Expected: PASS.

- [ ] **Step 8: Kontrol noktası oluştur**

1/2/4 canvas, QRL1 batch, doğrulanmış indirme, reset ve QRT2 geçiş uyumluluğunu uygulama notuna kaydet.

---

### Task 7: 5 MiB ürün sınırı ve sunucu doğrulaması

**Files:**
- Modify: `src/transfer/usage-policy.js:3-34`
- Modify: `server/validation.js:7-20,24-48`
- Modify: `src/__tests__/usage-policy.test.js`
- Modify: `src/__tests__/send-panel-quota.test.jsx`
- Modify: `server/__tests__/validation.test.js`

**Interfaces:**
- Produces: `LIVE_QR_MAX_BYTES = 5 * MIB`
- Consumes: `validateTransferSelection(files, { method: "live_qr", user })`

- [ ] **Step 1: Sınırın ağır işlemden önce uygulanması testlerini yaz**

```js
it("Canlı QR için 5 MiB + 1 baytı reddeder", () => {
  expect(() => validateTransferSelection(
    [file((5 * 1024 * 1024) + 1)],
    { method: "live_qr", user: member },
  )).toThrow("Canlı QR en fazla 5 MiB destekler. Uzak gönderim için VaultDrop kullanın.");
});

it("sunucu rezervasyonu Canlı QR 5 MiB sınırını tekrar doğrular", () => {
  const result = transferReservationSchema.safeParse({
    method: "live_qr",
    startedAt: "2026-08-13T10:00:00.000Z",
    items: [{ sizeBytes: (5 * 1024 * 1024) + 1 }],
  });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Testleri çalıştır ve mevcut 50 MiB teknik sınırında kırıldığını doğrula**

Run: `npm test -- src/__tests__/usage-policy.test.js src/__tests__/send-panel-quota.test.jsx server/__tests__/validation.test.js`

Expected: FAIL; 5 MiB + 1 bayt henüz reddedilmemeli.

- [ ] **Step 3: İstemci ve sunucu sınırlarını aynı değere getir**

```js
export const LIVE_QR_MAX_BYTES = 5 * MIB;

if (method === "live_qr" && totalBytes > LIVE_QR_MAX_BYTES) {
  throw new RangeError(
    "Canlı QR en fazla 5 MiB destekler. Uzak gönderim için VaultDrop kullanın.",
  );
}
```

Sunucu `validateMethodLimits()` aynı 5 MiB sınırını ve genel Türkçe mesajı kullanacak. `itemSchema` 50 MiB genel güvenlik sınırını koruyacak.

- [ ] **Step 4: Task 7 testlerini çalıştır**

Run: `npm test -- src/__tests__/usage-policy.test.js src/__tests__/send-panel-quota.test.jsx server/__tests__/validation.test.js`

Expected: PASS.

- [ ] **Step 5: Kontrol noktası oluştur**

5 MiB tam sınır, 5 MiB + 1 bayt ve kota rezervasyonu sonuçlarını uygulama notuna kaydet.

---

### Task 8: Gerçek render-tarama turu ve performans yayın kapısı

**Files:**
- Create: `src/__tests__/live-qr-render-scan-roundtrip.test.js`
- Create: `src/__tests__/live-qr-5mib-performance.test.js`
- Create: `docs/live-qr-manual-test.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tam QRL1 gönderici/alıcı motoru
- Produces: Otomatik performans bütçesi ve gerçek cihaz kabul formu

- [ ] **Step 1: Dört gerçek QR’ı tek 1600×900 karede çizip yeniden okuyan testi yaz**

```js
it("dört QRL1 QR’ı aynı 1600x900 kareden gerçek çözücüyle okur", async () => {
  const transfer = await createTestLiveTransfer(16 * 1024);
  const layout = selectLiveQrLayout({ width: 1600, height: 900 });
  const texts = transfer.frameTexts.slice(0, layout.count);
  const composite = renderCompositeQrFrame(texts, layout);
  const decoded = await decodeWithZxing(composite);
  expect(new Set(decoded)).toEqual(new Set(texts));
});
```

- [ ] **Step 2: 5 MiB kodlama ve %20 kayıp kurtarma bütçesini yaz**

```js
it("5 MiB paketi %20 sembol kaybıyla 120 saniyelik test bütçesinde kurar", { timeout: 120_000 }, async () => {
  const bytes = seededBytes(5 * 1024 * 1024);
  const encoder = await createLiveFountainEncoder(bytes, {
    transferId: "Qr5MiBTest01",
    blockBytes: 1400,
  });
  const decoder = createLiveFountainDecoder(encoder.metadata);
  const count = Math.ceil(encoder.metadata.sourceCount * 1.5);
  for (let id = count - 1; id >= 0; id -= 1) {
    if (id % 5 !== 0) decoder.accept(encoder.symbol(id));
  }
  expect(decoder.bytes()).toEqual(bytes);
});
```

- [ ] **Step 3: Otomatik testleri çalıştır**

Run: `npm test -- src/__tests__/live-qr-render-scan-roundtrip.test.js src/__tests__/live-qr-5mib-performance.test.js`

Expected: PASS. Gerçek QR turu 4/4 metni bulmalı; 5 MiB kurtarma 120 saniyelik test timeoutunu aşmamalı.

- [ ] **Step 4: Gerçek cihaz kabul formunu ekle**

`docs/live-qr-manual-test.md` şu zorunlu satırları içerecek:

```markdown
| Yön | Boyut | Deneme | Başarı | Süre | QR sayısı | Not |
|---|---:|---:|---|---:|---:|---|
| Masaüstü → Android | 100 KiB | 1–5 | 5/5 gerekli | | | |
| Masaüstü → iPhone Safari | 1 MiB | 1–5 | 5/5 gerekli | ortanca ≤30 sn | | |
| Android → Android | 1 MiB | 1–5 | 5/5 gerekli | ortanca ≤60 sn | | |
| iPhone → Android | 1 MiB | 1–5 | 5/5 gerekli | ortanca ≤60 sn | | |
| Masaüstü → telefon | 5 MiB | 1–5 | en az 4/5 | ≤180 sn | | |
```

Kontrollü ışık zorunlu; düşük ışık sonucu gözlem olarak kaydedilecek. 5 MiB satırı geçmezse üretim sınırı 1 MiB’a düşürülecek.

- [ ] **Step 5: README’ye ölçülmemiş hız vaadi koymadan yöntemi yaz**

README şu ifadeleri içerecek:

```markdown
Canlı QR, yakındaki cihazlar içindir ve renkli kod kullanmaz. Ekran alanına göre 1–4 standart siyah-beyaz QR gösterebilir. Fountain kurtarma, kaçırılan tek bir kare için bütün turun beklenmesini önler. Gerçek hız cihaz, ekran, kamera ve ışığa bağlıdır.
```

- [ ] **Step 6: Canlı QR odaklı testleri çalıştır**

Run: `npm test -- src/__tests__/live-qr-package-v1.test.js src/__tests__/live-qr-fountain.test.js src/__tests__/live-qr-frame-v1.test.js src/__tests__/live-qr-receive-session.test.js src/__tests__/live-qr-receive-worker.test.js src/__tests__/live-qr-layout.test.js src/__tests__/live-qr-render.test.js src/__tests__/live-qr-frame-player.test.js src/__tests__/multi-qr-scanner.test.jsx src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/live-qr-render-scan-roundtrip.test.js src/__tests__/live-qr-5mib-performance.test.js`

Expected: PASS.

- [ ] **Step 7: Tam doğrulama kapısını çalıştır**

Run: `npm test`

Expected: Bütün testler PASS; yalnız bilinçli mevcut skip kalabilir.

Run: `npm run lint`

Expected: exit code 0; yeni hata yok.

Run: `npm run build`

Expected: exit code 0; üretim paketi oluşur.

- [ ] **Step 8: Son kontrol noktası oluştur**

Tam test dosyası/test sayısı, performans test süresi, lint, build ve gerçek cihaz formunun durumunu uygulama notuna kaydet. Git başlatma veya commit yapma.
