# 1 MiB Stabil Canlı QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yakındaki cihazlar arasında ZIP dahil tek dosyayı en fazla 1 MiB olarak, siyah-beyaz QR ve hızlı parça parça kurtarma ile güvenilir aktarmak.

**Architecture:** LQP1 paketi 1 MiB kullanıcı sınırında kalacak, QRL1 kareleri 1.400 byte blokla standart QR taşıyacak. Yoğun matris çözen eski fountain yerine sistematik bloklar ve seyrek onarım denklemlerini kuyrukla çözen peeling alıcısı kullanılacak. Büyük, çoklu veya uzaktaki dosyalar VaultDrop yolunda kalacak.

**Tech Stack:** React 19, `qrcode`, `zxing-wasm`, `jsqr`, Web Workers, Web Crypto SHA-256, Vitest.

## Global Constraints

- Canlı QR tek bir dosya veya tek bir `.zip` dosyası kabul eder; kullanıcı sınırı tam **1 MiB**'dır.
- 1 MiB + 1 byte dosya okumadan, paketlemeden veya kota işlemi başlamadan “Canlı QR en fazla 1 MiB destekler. Daha büyük veya uzaktaki gönderimler için VaultDrop kullanın.” mesajıyla reddedilir.
- Canlı QR şifreli değildir; arayüz yakın ve kontrollü ortam uyarısını gösterir.
- Renkli QR ve QR Video kullanılmaz; yalnız standart siyah-beyaz QR üretilir.
- Yeni üretim `QRL1`, eski alım yalnız `QRT2` geçiş uyumluluğu kullanır.
- LQP1 veya QRL1 SHA-256 doğrulaması geçmeden dosya ya da indirme bağlantısı oluşmaz.
- QR sayısı ekranın gerçek piksel yoğunluğuna göre 1, 2 veya 4 olur; modül başına üç fiziksel piksel sağlanamıyorsa sayı düşer, gerekirse Canlı QR başlatılmaz.
- Başlangıç blok boyutu 1.400 byte, QR hata düzeltmesi `M`, sessiz alan 2 modül, en yüksek gösterim hızı 15 FPS'tir. Bir grup en az `1000 / 15` ms görünür kalır.
- 1 MiB testinde 1,5 kat adayla düzenli yüzde 20 kayıp ve iki sabit rastgele yüzde 20 kayıp deseni eksiksiz çözülür; çözüm 30 sn, test 60 sn altında kalır.
- Otomatik veya gerçek cihaz kabul kapısı geçmezse görünür sınır 512 KiB olur; VaultDrop önerilir.
- Yeni bağımlılık, Git, commit veya worktree yok; bütün metin ve kaynaklar UTF-8 olur.
- VaultDrop davranışı, eski `.bta` açma uyumluluğu ve QR Video/renkli QR temizliği bu planın dışındadır.

---

### Task 1: 1 MiB ürün ve protokol sınırı

**Files:**

- Modify: `src/live-qr/package-v1.js`
- Modify: `src/live-qr/frame-v1.js`
- Modify: `src/transfer/usage-policy.js`
- Modify: `server/validation.js`
- Modify: `src/__tests__/live-qr-package-v1.test.js`
- Modify: `src/__tests__/live-qr-frame-v1.test.js`
- Modify: `src/__tests__/usage-policy.test.js`
- Modify: `src/__tests__/send-panel-quota.test.jsx`
- Modify: `server/__tests__/validation.test.js`

**Interfaces:**

- Produces: `MAX_LIVE_QR_INPUT_BYTES = 1 * 1024 * 1024`
- Produces: `LIVE_QR_MAX_BYTES = 1 * MIB`
- Produces: `MAX_LIVE_QR_PACKAGE_BYTES = MAX_LIVE_QR_INPUT_BYTES + (16 * 1024) + 8`
- Consumes: `validateTransferSelection(files, { method: "live_qr", user })`

- [ ] **Step 1: Sınır RED testlerini ekle**

```js
it("1 MiB + 1 byte LQP1 girdisini arrayBuffer çağırmadan reddeder", async () => {
  const file = { size: (1 * 1024 * 1024) + 1, arrayBuffer: vi.fn() };
  await expect(createLiveQrPackage(file)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  expect(file.arrayBuffer).not.toHaveBeenCalled();
});

it("1 MiB + 1 byte Canlı QR seçimini VaultDrop mesajıyla reddeder", () => {
  expect(() => validateTransferSelection([file((1 * 1024 * 1024) + 1)], {
    method: "live_qr", user: member,
  })).toThrow("Canlı QR en fazla 1 MiB destekler. Daha büyük veya uzaktaki gönderimler için VaultDrop kullanın.");
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-package-v1.test.js src/__tests__/live-qr-frame-v1.test.js src/__tests__/usage-policy.test.js src/__tests__/send-panel-quota.test.jsx server/__tests__/validation.test.js`

Expected: FAIL; mevcut 5 MiB sınırı 1 MiB + 1 byte veriyi kabul eder.

- [ ] **Step 3: İstemci, LQP1 ve QRL1 üst sınırlarını eşitle**

```js
export const MAX_LIVE_QR_INPUT_BYTES = 1 * 1024 * 1024;
export const MAX_LIVE_QR_PACKAGE_BYTES = MAX_LIVE_QR_INPUT_BYTES + (16 * 1024);

if (method === "live_qr" && totalBytes > LIVE_QR_MAX_BYTES) {
  throw new RangeError(
    "Canlı QR en fazla 1 MiB destekler. Daha büyük veya uzaktaki gönderimler için VaultDrop kullanın.",
  );
}
```

LQP1 metadata'sı nedeniyle QRL1 `originalBytes` alanı `MAX_LIVE_QR_PACKAGE_BYTES` ile sınırlandırılır. Sunucu `validateMethodLimits()` aynı 1 MiB ürün sınırını tekrar uygular. `.zip` için tür yasağı ya da ikinci sıkıştırma eklenmez.

- [ ] **Step 4: GREEN'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-package-v1.test.js src/__tests__/live-qr-frame-v1.test.js src/__tests__/usage-policy.test.js src/__tests__/send-panel-quota.test.jsx server/__tests__/validation.test.js`

Expected: PASS; 1 MiB tam sınır kabul edilir, 1 MiB + 1 byte bütün katmanlarda reddedilir.

- [ ] **Step 5: Kontrol notunu yaz**

Rapor: `.superpowers/sdd/2026-08-13-canli-qr-1mib-stabil-hizlandirma/task-1-report.md`; RED/GREEN sonucu, ZIP'in tek dosya olarak kabulü ve istemci-sunucu eşitliği yazılır.

---

### Task 2: Seyrek onarım ve peeling fountain motoru

**Files:**

- Modify: `src/live-qr/fountain.js`
- Modify: `src/__tests__/live-qr-fountain.test.js`

**Interfaces:**

- Produces: `createLiveFountainEncoder(bytes, { transferId, blockBytes })`
- Produces: `createLiveFountainDecoder(metadata)`
- `LIVE_BLOCK_BYTES = 1000` kullanılır. Gerçek QRL1 metninin 141 modül kalması, 1600×900 ekranda dört QR için zorunludur. `MAX_SYMBOL_ID = 0xffffffff`, `accept()`, `isComplete()`, `bytes()`, `progress()` ve immutable `metadata` korunur.

- [ ] **Step 1: Yoğun çözümün reddedildiğini gösteren hız RED testini yaz**

```js
function lostIds(count, seed) {
  const ids = Array.from({ length: count }, (_, id) => id);
  let state = seed >>> 0;
  for (let index = ids.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return new Set(ids.slice(0, Math.floor(count / 5)));
}

const LOSS_SEEDS = ["Qr1MiBTest01", "Qr1MiBTest02", "Qr1MiBTest03"];

it("1 MiB paketi 1,5 kat adayda düzenli ve iki sabit yüzde 20 kayıpta 30 sn altında çözer", { timeout: 60_000 }, async () => {
  const bytes = seededBytes(1 * 1024 * 1024);
  for (const transferId of LOSS_SEEDS) {
    const encoder = await createLiveFountainEncoder(bytes, { transferId });
    const count = Math.ceil(encoder.metadata.sourceCount * 1.5);
    for (const lost of [
      new Set(Array.from({ length: count }, (_, id) => id).filter((id) => id % 5 === 0)),
      lostIds(count, 0x1234),
      lostIds(count, 0x5678),
    ]) {
      const decoder = createLiveFountainDecoder(encoder.metadata);
      const candidates = Array.from({ length: count }, (_, id) => encoder.symbol(id))
        .filter((_, id) => !lost.has(id)).reverse();
      candidates.forEach((symbol) => decoder.accept(symbol));
      expect(decoder.bytes()).toEqual(bytes);
    }
  }
});
```

Test ayrıca aynı `metadata` nesnesi sonradan değiştirilse dahi `transferId`, `sourceCount` ve maksimum kabul sayısının etkilenmediğini korur.

- [ ] **Step 2: RED'i doğrula**

Run: `cmd /c npx vitest run src/__tests__/live-qr-fountain.test.js -t "1 MiB paketi"`

Expected: FAIL veya 60 sn zaman aşımı; mevcut motor tam binary matris tersleme kullanır.

- [ ] **Step 3: Seyrek sembol üretimini uygula**

Sistematik karelerde `symbolId < sourceCount` doğrudan blok taşınır. Onarım kareleri için sabit transfer kimliği ve sembol kimliğinden xorshift üretilir. Her onarım sembolü kaynak sayısı daha küçük değilse tam 32 benzersiz kaynağın XOR'unu taşır:

```js
function repairIndices(metadata, symbolId) {
  const random = createRandom(seedFor(metadata.transferId, symbolId));
  const degree = Math.min(metadata.sourceCount, 32);
  const indices = new Set();
  while (indices.size < degree) indices.add(Math.floor(random() * metadata.sourceCount));
  return [...indices];
}
```

Aynı `transferId`/`symbolId` her iki uçta aynı benzersiz kaynak indekslerini üretir.

- [ ] **Step 4: Matris yerine peeling decoder'ı uygula**

Decoder şu yapıları kullanır:

```js
const known = new Map();
const equations = new Map();
const waitingBySource = new Map();
const resolveQueue = [];
```

Onarım sembolü geldiğinde bilinen blokların byte'ları XOR ile çıkarılır; kalan kaynak indeksleri `Set` içine alınır. Kalan indeks sayısı 1 ise `{ sourceIndex, bytes }` resolve kuyruğuna eklenir. `drainResolveQueue()` her bulunan bloğu `known` içine yalnız bir kez koyar, o blok için bekleyen bütün denklemlerden bloğu çıkarır ve yeni tekli denklemleri aynı kuyruğa ekler.

```js
function drainResolveQueue() {
  while (resolveQueue.length) {
    const { sourceIndex, bytes } = resolveQueue.shift();
    if (known.has(sourceIndex)) continue;
    known.set(sourceIndex, bytes);
    for (const equationId of waitingBySource.get(sourceIndex) ?? []) {
      const equation = equations.get(equationId);
      if (!equation?.indices.delete(sourceIndex)) continue;
      xorBytes(equation.bytes, bytes);
      if (equation.indices.size === 1) enqueueOnlyRemaining(equation);
    }
    waitingBySource.delete(sourceIndex);
  }
}
```

Kuyruk bittiğinde en fazla 256 bilinmeyen blok kalmışsa, yalnız bu küçük artık için bit tabanlı XOR eliminasyonu yapılır. 257 veya daha fazla eksik blokta decoder `false` döndürür; tam dosya matrisini çözmeye çalışmaz. 1.000 baytlık blokta düzenli yüzde 20 kaybın 213 parçalık gerçek artığını karşılayan bu sınır, 1 MiB ürün tavanında hızlı çözüm ile bellek/işlem güvenliğini birlikte korur.

Metadata ilk anda dondurulmuş snapshot'a kopyalanır; bütün limit, eşleşme ve çözüm hesabı yalnız bu snapshot'tan yapılır. Farklı sembol üst sınırı `Math.ceil(sourceCount * 3)` kalır; tekrar sembol belleğe yazılmaz.

- [ ] **Step 5: GREEN ve süre kapısını doğrula**

Run: `cmd /c npx vitest run src/__tests__/live-qr-fountain.test.js`

Expected: PASS; 1 MiB düzenli ve iki sabit rastgele yüzde 20 kayıp deseni 60 sn test içinde çözülür. Test çıktısındaki süre rapora yazılır.

- [ ] **Step 6: Kontrol notunu yaz**

Rapor: `.superpowers/sdd/2026-08-13-canli-qr-1mib-stabil-hizlandirma/task-2-report.md`; yoğun çözümün ölçülen sorunu, seçilen seyrek dağılım, her kayıp deseni ve süre yazılır.

---

### Task 3: Doğrulanmış QRL1 alım oturumu ve worker

**Files:**

- Create: `src/live-qr/receive-session.js`
- Create: `src/live-qr/receive-client.js`
- Create: `src/workers/live-qr-receive.worker.js`
- Create: `src/__tests__/live-qr-receive-session.test.js`
- Create: `src/__tests__/live-qr-receive-worker.test.js`

**Interfaces:**

```js
createLiveQrReceiveSession({ maxBytes } = {}) => ({
  accept(frame), acceptMany(frames), progress(), assemble(), reset(), getState(),
});

createLiveQrReceiveClient({ workerFactory } = {}) => ({
  accept(texts), reset(), subscribe(listener), close(), getSessionId(),
});
```

- [ ] **Step 1: Oturum RED testlerini ekle**

```js
it("başka aktarım ve metadata uyuşmazlığını reddeder, SHA doğrulanmadan dosya vermez", async () => {
  const first = await makeTransfer("Ab12Cd34Ef56", "bir.txt", "A".repeat(4_000));
  const second = await makeTransfer("Zy98Xw76Vu54", "iki.txt", "B".repeat(4_000));
  const session = createLiveQrReceiveSession();
  expect(session.accept(first.frames[0])).toEqual({ accepted: true });
  expect(session.accept(second.frames[0])).toEqual({ accepted: false, reason: "different-transfer" });
  expect(await session.assemble()).toBeNull();
  first.frames.slice(1).forEach((frame) => session.accept(frame));
  await expect(session.assemble()).resolves.toMatchObject({ file: expect.any(File), sha256: first.sha256 });
});

it("eski worker oturumundan gelen complete mesajını yayınlamaz", () => {
  const client = createLiveQrReceiveClient({ workerFactory: fakeWorkerFactory });
  const listener = vi.fn();
  client.subscribe(listener);
  client.reset();
  fakeWorker.emit({ type: "complete", sessionId: 0, result: { file: new File(["x"], "x.txt") } });
  expect(listener).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-receive-session.test.js src/__tests__/live-qr-receive-worker.test.js`

Expected: FAIL; alım modülleri bulunmaz.

- [ ] **Step 3: Oturumu ve worker sözleşmesini uygula**

İlk geçerli QRL1 karesi `transferId`, `sourceCount`, `blockBytes`, `originalBytes`, `sha256` alanlarını kilitler. `acceptMany()` bütün kareleri ekler, sonra en fazla bir kez `assemble()` dener. Tam çözümde önce paket SHA-256, sonra `openLiveQrPackage()` doğrulanır. Hata durumunda `failed` olur ve dosya dönmez.

Worker `start`, `accept`, `reset` mesajlarını işler; `accept` yalnız QRL1 metinlerini parse eder. Worker `progress`, `complete` veya `error` ile aynı `sessionId`yi döndürür. İstemci eski session mesajını yok sayar, `close()` worker'ı sonlandırır ve aboneleri temizler.

- [ ] **Step 4: GREEN'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-receive-session.test.js src/__tests__/live-qr-receive-worker.test.js src/__tests__/live-qr-package-v1.test.js src/__tests__/live-qr-fountain.test.js`

Expected: PASS; yalnız doğrulanmış dosya oluşur.

- [ ] **Step 5: Kontrol notunu yaz**

Rapor: `.superpowers/sdd/2026-08-13-canli-qr-1mib-stabil-hizlandirma/task-3-report.md`.

---

### Task 4: Okunabilir 1/2/4 QR üretimi ve gösterimi

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

```js
selectLiveQrLayout({ width, height, devicePixelRatio, moduleCount })
// => { supported, count, columns, rows, qrCssSize, qrPixelSize, gap }

rasterizeLiveQrText(text, { margin: 2 })
createLiveQrRenderPool({ workerFactory, size })
createLiveQrFramePlayer({ fps, renderGroup, presentGroup, setTimer, clearTimer })
```

- [ ] **Step 1: Ekran gerçek piksel RED testlerini ekle**

```js
it.each([
  [{ width: 390, height: 844, devicePixelRatio: 3, moduleCount: 141 }, { supported: true, count: 1 }],
  [{ width: 900, height: 700, devicePixelRatio: 1, moduleCount: 141 }, { supported: true, count: 2 }],
  [{ width: 1600, height: 900, devicePixelRatio: 1, moduleCount: 141 }, { supported: true, count: 4 }],
  [{ width: 280, height: 500, devicePixelRatio: 1, moduleCount: 141 }, { supported: false }],
])("%o ekranında fiziksel hücre güvenliğini korur", (viewport, expected) => {
  expect(selectLiveQrLayout(viewport)).toMatchObject(expected);
});

it("iki sunum arasında en az bir kare süresi bekler", async () => {
  vi.useFakeTimers();
  const player = createLiveQrFramePlayer({ fps: 15, renderGroup, presentGroup, setTimer, clearTimer });
  void player.play(nextTexts);
  await vi.advanceTimersByTimeAsync((1000 / 15) - 1);
  expect(presentGroup).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(presentGroup).toHaveBeenCalledTimes(2);
  player.stop();
  vi.useRealTimers();
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-layout.test.js src/__tests__/live-qr-render.test.js src/__tests__/live-qr-frame-player.test.js`

Expected: FAIL; canlı render modülleri bulunmaz.

- [ ] **Step 3: Güvenli layout, worker havuzu ve frame player'ı uygula**

Layout, 1/2/4 QR için CSS alanını hesaplar; `qrPixelSize = Math.floor(qrCssSize * devicePixelRatio)` ve `qrPixelSize / moduleCount >= 3` olmadan o düzeni seçmez. Hiçbir düzen geçmezse `{ supported: false }` döner.

Raster, mevcut `qrcode` paketini `errorCorrectionLevel: "M"`, `margin: 2` ile kullanır. Render worker `{ id, slot, text }` alır, `pixels.buffer`ı transferable gönderir. Havuz en az iki, en çok dört sahip olunan worker kullanır; `close()` bekleyen ve çalışan işleri `{ code: "CLOSED" }` ile reddeder ve her worker'ı bir kez sonlandırır. Frame player stop edildiğinde bekleyen zamanlayıcıyı temizler ve bekleyen `play()` döngüsünü çözer.

- [ ] **Step 4: GREEN'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-layout.test.js src/__tests__/live-qr-render.test.js src/__tests__/live-qr-frame-player.test.js src/__tests__/qr-raster.test.js`

Expected: PASS; minimum görünür süre ve sahiplik korunur.

- [ ] **Step 5: Kontrol notunu yaz**

Rapor: `.superpowers/sdd/2026-08-13-canli-qr-1mib-stabil-hizlandirma/task-4-report.md`.

---

### Task 5: Çoklu QR kamera taraması

**Files:**

- Create: `src/live-qr/decode-pool.js`
- Create: `src/hooks/useMultiQrScanner.js`
- Create: `src/workers/live-qr-decode.worker.js`
- Create: `src/__tests__/multi-qr-scanner.test.jsx`
- Modify: `src/__tests__/camera-scanner.test.jsx`

**Interfaces:**

```js
useMultiQrScanner({ onDecodedBatch, enabled, facingMode, paused }) => ({
  videoRef, canvasRef, error, restartCamera, stopScanning,
});
```

- [ ] **Step 1: Tarama RED testlerini ekle**

```jsx
it("tek kamera karesindeki dört QRL1 metnini aynı batch ile verir", async () => {
  render(<ScannerHarness workerFactory={() => worker} onDecodedBatch={onDecodedBatch} />);
  await flushCamera();
  worker.emit({ id: 1, texts: ["QRL1|a", "QRL1|b", "QRL1|c", "QRL1|d"] });
  expect(onDecodedBatch).toHaveBeenCalledWith(["QRL1|a", "QRL1|b", "QRL1|c", "QRL1|d"]);
});

it("iki worker meşgulse eski kareyi kuyruğa koymaz", async () => {
  expect(await pool.decode(imageData)).toMatchObject({ dropped: true, texts: [] });
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `cmd /c npm test -- src/__tests__/multi-qr-scanner.test.jsx src/__tests__/camera-scanner.test.jsx`

Expected: FAIL; hook ve decode pool bulunmaz.

- [ ] **Step 3: Decode pool, worker ve yaşam döngüsünü uygula**

Decode havuzu `Math.min(2, Math.max(1, hardwareConcurrency - 1))` worker kullanır. Her worker ZXing ile en fazla dört QR arar; sonuçlar benzersizleştirilir. WASM hazır değilse `WASM_UNAVAILABLE` döndürür; hook tek QR `BarcodeDetector`, ardından `jsQR` yedeğine geçer.

Kamera 1280×720, çevre kamera ve desteklenirse sürekli odak ister. `requestVideoFrameCallback` varsa onu, yoksa 50 ms zamanlayıcıyı kullanır. `enabled`, `paused`, kamera yönü veya unmount değişiminde nesil artırılır; eski kamera/worker sonucu `onDecodedBatch` çağırmaz. Unmount her track'i ve sahip olunan worker'ı kapatır.

- [ ] **Step 4: GREEN'i doğrula**

Run: `cmd /c npm test -- src/__tests__/multi-qr-scanner.test.jsx src/__tests__/camera-scanner.test.jsx`

Expected: PASS; tek QR kamera davranışı gerilemez.

- [ ] **Step 5: Kontrol notunu yaz**

Rapor: `.superpowers/sdd/2026-08-13-canli-qr-1mib-stabil-hizlandirma/task-5-report.md`.

---

### Task 6: Canlı QR gönderici/alıcı ekranları

**Files:**

- Modify: `src/SendPanel.jsx`
- Modify: `src/ReceivePanel.jsx`
- Modify: `src/protocol/index.js`
- Modify: `src/__tests__/send-panel-quota.test.jsx`
- Modify: `src/__tests__/receive-panel.test.jsx`
- Modify: `src/__tests__/transfer-roundtrip.test.js`
- Create: `src/__tests__/live-qr-multi-ui.test.jsx`

**Interfaces:**

- Consumes: Task 1–5 LQP1, QRL1, render/player, scanner and receive client.
- Produces: 1/2/4 siyah-beyaz QRL1 giden ekranı ve SHA-256 doğrulanmış alım ekranı.

- [ ] **Step 1: Ekran RED testlerini ekle**

```jsx
it("1 MiB altındaki ZIP için geniş ekranda dört siyah-beyaz QR ve yakın ortam uyarısı gösterir", async () => {
  setViewport({ width: 1600, height: 900, devicePixelRatio: 1 });
  render(<SendPanel user={member} createLiveSession={fakeLiveSession} />);
  fireEvent.change(screen.getByLabelText("Canlı QR ile gönderilecek belge"), {
    target: { files: [new File(["zip"], "tablolar.zip", { type: "application/zip" })] },
  });
  expect(await screen.findAllByLabelText(/Canlı QR kodu/)).toHaveLength(4);
  expect(screen.getByText(/ekrana bakan başka bir kamera/i)).toBeInTheDocument();
});

it("QRL1 batch tamamlanınca yalnız doğrulanmış dosya için indirme sunar", async () => {
  render(<ReceivePanel scannerHook={fakeMultiScanner} receiveClient={client} />);
  fakeMultiScanner.emit(["QRL1|frame-1", "QRL1|frame-2"]);
  expect(client.accept).toHaveBeenCalledWith(["QRL1|frame-1", "QRL1|frame-2"]);
  client.emit({ type: "complete", result: { file: new File(["ok"], "tablolar.zip"), sha256: "S".repeat(43) } });
  expect(await screen.findByRole("link", { name: "Dosyayı indir" })).toHaveAttribute("download", "tablolar.zip");
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/send-panel-quota.test.jsx src/__tests__/receive-panel.test.jsx`

Expected: FAIL; mevcut ekran yalnız tek eski QR döngüsünü kullanır.

- [ ] **Step 3: LQP1 → QRL1 giden hattını uygula**

Dosya seçimi önce `validateTransferSelection()` ile kontrol edilir. `createLiveQrPackage(file)` ardından `createLiveFountainEncoder(package.bytes, { transferId, blockBytes: LIVE_BLOCK_BYTES })` kullanılır. Her sunum grubunda layout sayısı kadar artan sembol üretilir, `encodeLiveFrame()` ile QRL1 metnine dönüşür, render worker'ına verilir. Desteklenmeyen küçük ekran uyarısı VaultDrop önerir; worker açılmazsa bir QR ve ana iş parçacığı raster yedeği kullanılır.

- [ ] **Step 4: QRL1 alımını uygula**

`ReceivePanel`, `useMultiQrScanner` batch'ini `receiveClient.accept(texts)` ile gönderir. `subscribe()` üzerinden `progress`, `complete`, `error` dinlenir. Complete'te URL oluşur, kamera durur; reset/unmount URL'yi iptal eder, aboneliği kaldırır ve client'ı kapatır. `protocol/index.js`, `QRL1|` için `parseLiveFrame()` çağırır; `QRT2` eski `parseLegacyFrame()` yolunda kalır.

- [ ] **Step 5: GREEN'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/send-panel-quota.test.jsx src/__tests__/receive-panel.test.jsx src/__tests__/transfer-roundtrip.test.js src/__tests__/protocol-v2.test.js src/__tests__/frame-v3.test.js`

Expected: PASS; yeni gönderici QRL1 üretir, QRT2 alımı korunur.

- [ ] **Step 6: Kontrol notunu yaz**

Rapor: `.superpowers/sdd/2026-08-13-canli-qr-1mib-stabil-hizlandirma/task-6-report.md`.

---

### Task 7: Gerçek QR turu, cihaz kabul formu ve yayın kapısı

**Files:**

- Create: `src/__tests__/live-qr-render-scan-roundtrip.test.js`
- Create: `src/__tests__/live-qr-1mib-performance.test.js`
- Create: `docs/live-qr-manual-test.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: Tam QRL1 sender/receiver motoru.
- Produces: Otomatik 1 MiB güvenilirlik-süre kapısı ve gerçek cihaz test formu.

- [ ] **Step 1: Gerçek dört QR turu RED testini yaz**

```js
it("1600×900 karedeki dört gerçek QRL1 QR'ı tarayıp aynı metinleri verir", async () => {
  const layout = selectLiveQrLayout({ width: 1600, height: 900, devicePixelRatio: 1, moduleCount: 141 });
  const texts = transfer.frameTexts.slice(0, layout.count);
  const composite = renderCompositeQrFrame(texts, layout);
  expect(new Set(await decodeWithZxing(composite))).toEqual(new Set(texts));
});
```

- [ ] **Step 2: Performans RED testini yaz**

```js
function lostIds(count, seed) {
  const ids = Array.from({ length: count }, (_, id) => id);
  let state = seed >>> 0;
  for (let index = ids.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return new Set(ids.slice(0, Math.floor(count / 5)));
}

it("1 MiB paketi üç yüzde 20 kayıp deseniyle 60 sn altında kurar", { timeout: 60_000 }, async () => {
  const sourceBytes = seededBytes(1 * 1024 * 1024);
  const candidateCount = Math.ceil(Math.ceil(sourceBytes.length / 1000) * 1.5);
  for (const lost of [
    new Set(Array.from({ length: candidateCount }, (_, id) => id).filter((id) => id % 5 === 0)),
    lostIds(candidateCount, 0x1234),
    lostIds(candidateCount, 0x5678),
  ]) {
    const decoder = await transferWith(lost, { bytes: sourceBytes, ratio: 1.5 });
    expect(decoder.bytes()).toEqual(sourceBytes);
  }
});
```

- [ ] **Step 3: RED'i doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-render-scan-roundtrip.test.js src/__tests__/live-qr-1mib-performance.test.js`

Expected: FAIL; gerçek canlı render/tarama zinciri veya 1 MiB yayın kapısı henüz yoktur.

- [ ] **Step 4: Test yardımcılarını ve gerçek cihaz formunu ekle**

`docs/live-qr-manual-test.md` şu satırları içerir:

```markdown
| Yön | Dosya | Deneme | Gerekli başarı | Süre hedefi | QR sayısı | Not |
|---|---:|---:|---|---:|---:|---|
| Masaüstü → Android | 100 KiB | 1–5 | 5/5 | | | |
| Masaüstü → iPhone Safari | 1 MiB ZIP | 1–5 | 5/5 | ortanca ≤ 60 sn | | |
| Android → Android | 1 MiB ZIP | 1–5 | 5/5 | ortanca ≤ 90 sn | | |
| iPhone → Android | 1 MiB ZIP | 1–5 | 5/5 | ortanca ≤ 90 sn | | |
```

Form kontrollü ışığı zorunlu, düşük ışığı gözlem olarak belirtir. Her zorunlu satır geçmezse kullanıcı sınırı 512 KiB'a iner; 1 MiB için pazarlama hızı yazılmaz.

README şu iki gerçeği içerir: “Canlı QR, yakındaki cihazlar için tek dosya veya ZIP'i en fazla 1 MiB taşır; renkli kod kullanmaz.” ve “Daha büyük, çoklu veya uzaktaki gönderimler için şifreli VaultDrop kullanılır.”

- [ ] **Step 5: Hedefli yayın kapısını doğrula**

Run: `cmd /c npm test -- src/__tests__/live-qr-package-v1.test.js src/__tests__/live-qr-fountain.test.js src/__tests__/live-qr-frame-v1.test.js src/__tests__/live-qr-receive-session.test.js src/__tests__/live-qr-receive-worker.test.js src/__tests__/live-qr-layout.test.js src/__tests__/live-qr-render.test.js src/__tests__/live-qr-frame-player.test.js src/__tests__/multi-qr-scanner.test.jsx src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/live-qr-render-scan-roundtrip.test.js src/__tests__/live-qr-1mib-performance.test.js`

Expected: PASS; 1 MiB otomatik kapısı ve dört QR gerçek turu geçer.

- [ ] **Step 6: Tam doğrulama ve kontrol notu**

Run: `cmd /c npm test`

Expected: PASS; yalnız bilinçli skip kabul edilir.

Run: `cmd /c npm run lint`

Expected: exit code 0; yeni hata yok.

Run: `cmd /c npm run build`

Expected: exit code 0.

Rapor: `.superpowers/sdd/2026-08-13-canli-qr-1mib-stabil-hizlandirma/task-7-report.md`; test sayıları, test süresi, lint/build sonucu ve gerçek cihaz formunun henüz manuel bekleyen satırları açıkça yazılır.
