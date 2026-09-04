# Canlı QR 10 MiB ve Hazır Kare Kuyruğu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlı QR'ı tek dosya veya tek ZIP için 10 MiB'ye çıkarıp göndericide üç gruplu hazır kare kuyruğu ve alıcıda kayıp toleranslı, doğrulanmış indirme sağlamak.

**Architecture:** Mevcut `LQP1` paketleme korunacak, yeni gönderimler ölçeklenebilir şeritli erasure/fountain motorunu taşıyan `QRL2` kareleri üretecek ve alıcı `QRL1` geçiş okumasını koruyacak. Gönderici en fazla üç sonraki tam QR grubunu worker havuzunda hazır tutacak; alıcı en güncel kamera karesini bölgesel worker taramasına verecek ve yalnız paket SHA-256 doğrulamasından sonra dosya oluşturacak.

**Tech Stack:** React 19, Web Workers, Web Crypto SHA-256, `qrcode`, `zxing-wasm`, `jsqr`, Vitest

## Global Constraints

- İlk yayın kullanıcı sınırı tek dosya veya tek ZIP ve en fazla 10 MiB olacak.
- 25 MiB yalnız kapalı deneysel özellik olarak kalacak; bu plan kullanıcıya 25 MiB açmayacak.
- Canlı QR şifreli değildir; hassas dosyada VaultDrop önerisi görünür kalacak.
- Renkli QR ve QR Video yeniden etkinleştirilmeyecek.
- Yeni üretim `QRL2`, alıcı geçiş uyumluluğu `QRL1 + QRL2` olacak.
- Her QR sessiz alan dâhil fiziksel olarak hücre başına en az 3 piksel taşıyacak.
- Varsayılan profil Dengeli: 2 QR, 30 FPS'e kadar, güvenli kapasite ölçümüne göre en fazla 1.465 bayt payload.
- Hazır kuyruk ekrandaki grup hariç tam olarak en fazla 3 grup tutacak; dinamik büyümeyecek.
- Kare gecikmesinde sıfır milisaniyelik telafi gösterimi yapılmayacak; hazır grup yoksa son geçerli grup tekrar edilecek.
- Dosya SHA-256 doğrulanmadan Blob URL, indirme düğmesi veya başarı durumu oluşturulmayacak.
- Yeni bağımlılık ve AGPL kaynak kodu eklenmeyecek.
- Kullanıcı metinleri ve kaynaklar UTF-8 olacak.
- Çalışma dizininde Git yoksa `git init` çalıştırılmayacak; commit adımı test raporunda “Git deposu yok” olarak kaydedilecek.

---

### Task 1: Ölçeklenebilir `QRL2` şeritli fountain motoru

**Files:**
- Modify: `src/live-qr/limits.js`
- Create: `src/live-qr/stripe-fountain-v2.js`
- Create: `src/live-qr/frame-v2.js`
- Create: `src/__tests__/live-qr-stripe-fountain-v2.test.js`
- Create: `src/__tests__/live-qr-frame-v2.test.js`

**Interfaces:**
- Consumes: `sha256Base64Url(bytes)`, `toBase64Url(bytes)`, `fromBase64Url(text)`, `crc32Hex(bytes)`
- Produces:

```js
createStripeFountainEncoder(bytes, { transferId }) => Promise<{
  metadata: Readonly<{
    transferId: string,
    sourceCount: number,
    blockBytes: 1000,
    stripeDataCount: 32,
    originalBytes: number,
    sha256: string,
  }>,
  symbol(symbolId: number): { transferId: string, symbolId: number, data: Uint8Array }
}>

createStripeFountainDecoder(metadata) => {
  accept(symbol): { accepted: boolean, reason?: string },
  isComplete(): boolean,
  bytes(): Uint8Array | null,
  progress(): { solved: number, sourceCount: number, accepted: number, duplicates: number }
}

encodeLiveFrameV2(metadata, symbol) => string
parseLiveFrameV2(text) => ParsedQrl2Frame | null
```

- [ ] **Step 1: 10 MiB, kayıp, tekrar ve bozulma testlerini yaz**

```js
it("10 MiB paketi 1,5x aday içinde her beşinci kare kaybıyla çözer", async () => {
  const bytes = seededBytes(10 * 1024 * 1024, 0x51a7);
  const encoder = await createStripeFountainEncoder(bytes, { transferId: "Qr10MiBTest1" });
  const decoder = createStripeFountainDecoder(encoder.metadata);
  const candidateCount = Math.ceil(encoder.metadata.sourceCount * 1.5);
  for (let id = 0; id < candidateCount; id += 1) {
    if (id % 5 !== 0) decoder.accept(encoder.symbol(id));
  }
  expect(decoder.isComplete()).toBe(true);
  expect(decoder.bytes()).toEqual(bytes);
}, 30_000);

it("aynı sembolü ikinci kez belleğe almaz", async () => {
  const encoder = await createStripeFountainEncoder(new Uint8Array(64_000), { transferId: "Duplicate001" });
  const decoder = createStripeFountainDecoder(encoder.metadata);
  expect(decoder.accept(encoder.symbol(7))).toEqual({ accepted: true });
  expect(decoder.accept(encoder.symbol(7))).toMatchObject({ accepted: false, reason: "duplicate" });
});
```

`QRL2` testinde tam 10 alan, canonical Base64URL, CRC-32, 10 MiB paket sınırı, `symbolId <= 0xffffffff` ve fazladan/eksik alan reddi doğrulanacak.

- [ ] **Step 2: Testleri çalıştır ve yeni modüller bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-stripe-fountain-v2.test.js src/__tests__/live-qr-frame-v2.test.js`

Expected: FAIL with module resolution errors.

- [ ] **Step 3: GF(256) ve 32 kaynak bloklu şerit kodlayıcıyı ekle**

```js
// src/live-qr/limits.js
export const MIB = 1024 * 1024;
export const MAX_LIVE_QR_INPUT_BYTES = 10 * MIB;
export const MAX_EXPERIMENTAL_LIVE_QR_INPUT_BYTES = 25 * MIB;

// src/live-qr/stripe-fountain-v2.js
export const LIVE_V2_BLOCK_BYTES = 1000;
export const STRIPE_DATA_COUNT = 32;
export const MAX_PARITY_ROWS = 32;

function repairLocation(sourceCount, symbolId) {
  const stripeCount = Math.ceil(sourceCount / STRIPE_DATA_COUNT);
  const repairOrdinal = symbolId - sourceCount;
  return {
    stripeIndex: repairOrdinal % stripeCount,
    parityRow: Math.floor(repairOrdinal / stripeCount),
  };
}

function coefficient(parityRow, dataIndex) {
  return gfPow((dataIndex + 1) & 0xff, parityRow + 1);
}
```

`gfMultiply`, `gfInverse`, `gfPow` tabloları `0x11d` polinomu ile bir kez üretilecek. Her şerit 32 kaynak blok taşıyacak. Kaynak semboller `0..K-1`; sonraki semboller sırayla bütün şeritlerin parity row 0, sonra row 1 değerlerini üretecek. Son şeritte olmayan bloklar sıfır kabul edilecek.

- [ ] **Step 4: Şerit bazlı sınırlı decoderı ekle**

```js
function canRecover(stripe) {
  return stripe.knownData.size + stripe.parity.size >= stripe.dataCount;
}

function recoverStripe(stripe) {
  const missing = stripe.sourceIndexes.filter((index) => !stripe.knownData.has(index));
  const rows = [...stripe.parity.entries()].slice(0, missing.length);
  if (rows.length < missing.length) return false;
  const matrix = rows.map(([parityRow]) => missing.map((sourceIndex) => (
    coefficient(parityRow, sourceIndex - stripe.firstSourceIndex)
  )));
  const inverse = invertGf256Matrix(matrix);
  if (!inverse) return false;
  solveMissingBytes(stripe, missing, rows, inverse);
  return true;
}
```

Matris en fazla `32 × 32` olacak. Kabul edilen sembol sayısı `ceil(sourceCount * 3)`, bellek `sourceCount * 1000 + parity cache` ile sınırlanacak. Metadata oluşturulurken kopyalanıp dondurulacak; dış nesne mutasyonu decoder davranışını değiştirmeyecek.

- [ ] **Step 5: `QRL2` çerçevesini ekle**

```js
return [
  "QRL2", metadata.transferId, symbol.symbolId, metadata.sourceCount,
  metadata.blockBytes, metadata.stripeDataCount, metadata.originalBytes,
  metadata.sha256, crc32Hex(symbol.data), toBase64Url(symbol.data),
].join("|");
```

Parser tam 10 alanı, 12 karakter aktarım kimliğini, güvenli tamsayıları, `blockBytes === 1000`, `stripeDataCount === 32`, canonical SHA-256/Base64URL ve CRC-32'yi doğrulayacak.

- [ ] **Step 6: Odaklı testleri çalıştır**

Run: `npm test -- src/__tests__/live-qr-stripe-fountain-v2.test.js src/__tests__/live-qr-frame-v2.test.js`

Expected: PASS; 10 MiB testi 30 saniyelik test sınırını aşmayacak.

- [ ] **Step 7: Kontrol noktası oluştur**

```bash
git add src/live-qr/limits.js src/live-qr/stripe-fountain-v2.js src/live-qr/frame-v2.js src/__tests__/live-qr-stripe-fountain-v2.test.js src/__tests__/live-qr-frame-v2.test.js
git commit -m "feat: add scalable qrl2 stripe fountain"
```

---

### Task 2: 10 MiB paket, sınır ve protokol yönlendirmesi

**Files:**
- Modify: `src/live-qr/limits.js`
- Modify: `src/live-qr/package-v1.js`
- Create: `src/live-qr/frame.js`
- Modify: `src/live-qr/receive-session.js`
- Modify: `src/transfer/usage-policy.js`
- Modify: `src/__tests__/live-qr-package-v1.test.js`
- Create: `src/__tests__/live-qr-frame-router.test.js`
- Modify: `src/__tests__/usage-policy.test.js`

**Interfaces:**
- Consumes: Task 1 `parseLiveFrameV2`, `createStripeFountainDecoder`
- Produces: `MAX_LIVE_QR_INPUT_BYTES = 10 * MIB`, `parseLiveFrame(text)`, QRL1/QRL2 alan `createLiveQrReceiveSession()`

- [ ] **Step 1: 10 MiB sınır ve QRL1/QRL2 yönlendirme testlerini yaz**

```js
expect(() => validateTransferSelection([
  new File([new Uint8Array(10 * MIB)], "arsiv.zip")
], { method: "live_qr", user: { id: "u1" } })).not.toThrow();

expect(() => validateTransferSelection([
  new File([new Uint8Array((10 * MIB) + 1)], "buyuk.zip")
], { method: "live_qr", user: { id: "u1" } })).toThrow(/10 MiB/);

expect(parseLiveFrame(qrl1Fixture)?.protocolVersion).toBe("QRL1");
expect(parseLiveFrame(qrl2Fixture)?.protocolVersion).toBe("QRL2");
```

- [ ] **Step 2: Testleri çalıştır ve eski 1 MiB sınırında kırıldığını doğrula**

Run: `npm test -- src/__tests__/usage-policy.test.js src/__tests__/live-qr-package-v1.test.js src/__tests__/live-qr-frame-router.test.js`

Expected: FAIL on 10 MiB acceptance and missing frame router.

- [ ] **Step 3: Ortak sınırları tek kaynaktan tüket ve yinelenen 1 MiB sabitini kaldır**

```js
import { MAX_LIVE_QR_INPUT_BYTES } from "../live-qr/limits.js";
export const LIVE_QR_MAX_BYTES = MAX_LIVE_QR_INPUT_BYTES;
```

`usage-policy.js` kendi `LIVE_QR_MAX_BYTES` değerini `live-qr/limits.js` üzerinden alacak. 10 MiB + 1 bayt seçiminde dosya okunmadan ve kota rezervasyonu yapılmadan Türkçe hata dönecek.

- [ ] **Step 4: Çerçeve routerı ve decoder seçimini ekle**

```js
export function parseLiveFrame(text) {
  if (typeof text !== "string") return null;
  if (text.startsWith("QRL2|")) return parseLiveFrameV2(text);
  if (text.startsWith("QRL1|")) return parseLiveFrameV1(text);
  return null;
}
```

`receive-session.js`, ilk kabul edilen çerçevenin `protocolVersion` değerine göre decoder oluşturacak; aynı oturumda farklı sürüm veya aktarım kimliği reddedilecek. `assemble()` LQP1 SHA ve özgün dosya SHA denetimlerini koruyacak.

- [ ] **Step 5: Odaklı ve geriye uyumluluk testlerini çalıştır**

Run: `npm test -- src/__tests__/usage-policy.test.js src/__tests__/live-qr-package-v1.test.js src/__tests__/live-qr-frame-router.test.js src/__tests__/live-qr-receive-session.test.js src/__tests__/live-qr-frame-v1.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/live-qr/limits.js src/live-qr/package-v1.js src/live-qr/frame.js src/live-qr/receive-session.js src/transfer/usage-policy.js src/__tests__
git commit -m "feat: raise live qr verified limit to 10 mib"
```

---

### Task 3: Güvenli profil politikası ve ekran yerleşimi

**Files:**
- Create: `src/live-qr/profile-policy.js`
- Modify: `src/live-qr/layout.js`
- Create: `src/__tests__/live-qr-profile-policy.test.js`
- Modify: `src/__tests__/live-qr-layout.test.js`

**Interfaces:**
- Produces: `selectLiveQrProfile({ width, height, devicePixelRatio, refreshRate, moduleCount, preference })`
- Return: `{ id, count, fps, payloadBytes, layout, reason }`

- [ ] **Step 1: Uyumlu, Dengeli ve kapalı Hızlı profil testlerini yaz**

```js
expect(selectLiveQrProfile({
  width: 1280, height: 800, devicePixelRatio: 1, refreshRate: 60,
  moduleCount: 141, preference: "balanced",
})).toMatchObject({ id: "balanced", count: 2, fps: 30 });

expect(selectLiveQrProfile({
  width: 390, height: 844, devicePixelRatio: 3, refreshRate: 60,
  moduleCount: 141, preference: "balanced",
})).toMatchObject({ id: "compatible", count: 1, fps: 24 });
```

Hızlı profil yalnız `preference: "fast"`, geniş ekran, en az 120 Hz ve dört QR'ın her birinde sessiz alan dâhil 3 fiziksel piksel sağlandığında seçilecek.

- [ ] **Step 2: Testleri çalıştır ve profil modülü olmadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-profile-policy.test.js src/__tests__/live-qr-layout.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Saf profil seçiciyi ekle**

```js
const PROFILES = Object.freeze({
  compatible: { id: "compatible", count: 1, fps: 24, payloadBytes: 1000 },
  balanced: { id: "balanced", count: 2, fps: 30, payloadBytes: 1465 },
  fast: { id: "fast", count: 4, fps: 60, payloadBytes: 2933 },
});
```

Profil büyükten küçüğe denenmeyecek; kullanıcı tercihi önce güvenlik koşullarından geçirilecek. Koşul geçmezse `balanced`, o da geçmezse `compatible` dönecek. Mevcut QRL2 blok boyutu 1000 olduğundan `payloadBytes` bu yayında kapasite bilgisi olacak; protokol blok boyutunu sessizce değiştirmeyecek.

- [ ] **Step 4: Yerleşim sınırını sessiz alanla doğrula**

```js
const totalModuleCount = moduleCount + (QUIET_ZONE_MODULES * 2);
const physicalModulePixels = qrPixelSize / totalModuleCount;
if (physicalModulePixels < MIN_MODULE_PIXELS) continue;
```

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test -- src/__tests__/live-qr-profile-policy.test.js src/__tests__/live-qr-layout.test.js src/__tests__/live-qr-render-scan-roundtrip.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/live-qr/profile-policy.js src/live-qr/layout.js src/__tests__/live-qr-profile-policy.test.js src/__tests__/live-qr-layout.test.js
git commit -m "feat: add safe live qr profile policy"
```

---

### Task 4: Üç gruplu hazır kare kuyruğu

**Files:**
- Create: `src/live-qr/prefetch-player.js`
- Create: `src/__tests__/live-qr-prefetch-player.test.js`
- Keep: `src/live-qr/frame-player.js` for QRL1 regression only

**Interfaces:**
- Produces:

```js
createLiveQrPrefetchPlayer({
  fps,
  depth: 3,
  createTexts,
  renderGroup,
  presentGroup,
  onQueueDepth,
  setTimer,
  clearTimer,
}) => { start(): Promise<void>, pause(): void, resume(): void, stop(): void, getState(): object }
```

- [ ] **Step 1: Sıra, tekrar, ritim, iptal ve bellek testlerini yaz**

```js
it("ekrandaki grup dışında en fazla üç tam grup hazır tutar", async () => {
  const player = createHarness({ depth: 3, fps: 30 });
  await player.fill();
  expect(player.getState().readyGroups).toBe(3);
  expect(player.renderedGroups - player.presentedGroups).toBeLessThanOrEqual(3);
});

it("kuyruk boşsa beyaz kare yerine son geçerli grubu tekrarlar", async () => {
  const player = createHarness({ renderDelayMs: 200, fps: 30 });
  await player.tick(4);
  expect(player.presented.at(-1)).toEqual(player.presented.at(-2));
});
```

Test zamanlayıcısı her sunum arasının en az `1000 / fps` olduğunu, `stop()` sonrası geç render sonucunun sunulmadığını ve pause/reset sırasında hazır raster referanslarının bırakıldığını doğrulayacak.

- [ ] **Step 2: Testleri çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-prefetch-player.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Sonlu halka kuyruğu ve nesil korumasını ekle**

```js
const ready = [];
let generation = 0;
let currentGroup = null;

async function fill(currentGeneration) {
  while (running && currentGeneration === generation && ready.length < depth) {
    const texts = createTexts();
    const rasters = await renderGroup(texts);
    if (!running || currentGeneration !== generation) return;
    ready.push(Object.freeze({ texts, rasters }));
    onQueueDepth?.(ready.length);
  }
}
```

Sunum saati mutlak başlangıç zamanına yetişmeye çalışmayacak. Her tick bir hazır grup alacak; yoksa `currentGroup` tekrar gösterilecek. `presentGroup` hiçbir zaman kısmi raster dizisi almayacak.

- [ ] **Step 4: Yaşam döngüsünü tamamla**

`pause()` sunum saatini durdurup hazır grupları koruyacak. `stop()` nesli artıracak, timerı iptal edecek, `ready.length = 0` yapacak ve `currentGroup = null` bırakacak. `resume()` aynı nesilde değil yeni nesilde kuyruğu tekrar dolduracak.

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test -- src/__tests__/live-qr-prefetch-player.test.js src/__tests__/live-qr-frame-player.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/live-qr/prefetch-player.js src/__tests__/live-qr-prefetch-player.test.js
git commit -m "feat: prefetch three live qr groups"
```

---

### Task 5: Gönderici entegrasyonu, tam ekran ve kaynak temizliği

**Files:**
- Modify: `src/SendPanel.jsx`
- Modify: `src/App.css`
- Modify: `src/__tests__/live-qr-multi-ui.test.jsx`
- Modify: `src/__tests__/send-panel-quota.test.jsx`

**Interfaces:**
- Consumes: Task 1 encoder/frame, Task 3 profile, Task 4 player
- Produces: Canlı QR dosya seçimi → QRL2 hazırlama → hazır kuyruk → canvas sunumu

- [ ] **Step 1: 10 MiB metni, varsayılan Dengeli profil ve yaşam döngüsü testlerini yaz**

```jsx
expect(screen.getByText("Tek dosya veya ZIP, en fazla 10 MiB")).toBeInTheDocument();
expect(screen.getByRole("status", { name: /hazır kare/i })).toHaveTextContent(/3/);
await user.click(screen.getByRole("button", { name: "Tam ekran göster" }));
expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
```

Yeni dosya, duraklatma, unmount ve render worker hatasında timer, wake lock, owned worker ve kuyruk temizliği; enjekte edilen worker'ın kapatılmaması test edilecek.

- [ ] **Step 2: Testleri çalıştır ve eski 1 MiB/15 FPS akışında kırıldığını doğrula**

Run: `npm test -- src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/send-panel-quota.test.jsx`

Expected: FAIL on limit copy, profile and queue status.

- [ ] **Step 3: SendPanel motorunu QRL2 ve hazır kuyruğa bağla**

```js
const player = createLiveQrPrefetchPlayer({
  fps: profile.fps,
  depth: 3,
  createTexts: nextQrl2Texts,
  renderGroup,
  presentGroup,
  onQueueDepth: setReadyGroupCount,
});
```

Kota `completed` durumu dosya seçildiğinde değil, ilk tam QR grubu başarıyla sunulduğunda yazılacak. İlk sunumdan önce hata/iptal olursa rezervasyon `failed` olacak. `createGenerationRef` geç sonuçların yeni dosya oturumuna yazmasını engelleyecek.

- [ ] **Step 4: Tam ekran ve uyanık tutma kontrollerini ekle**

Tam ekran butonu `requestFullscreen()` desteklenmiyorsa gizlenecek. `navigator.wakeLock.request("screen")` yalnız kullanıcı başlattığında çağrılacak; görünürlük geri geldiğinde oturum sürüyorsa yeniden alınacak; reset/unmount'ta `release()` çağrılacak. Parlaklığın otomatik değiştirilemediği sade bir metinle açıklanacak.

- [ ] **Step 5: Gönderici testlerini çalıştır**

Run: `npm test -- src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/send-panel-quota.test.jsx src/__tests__/live-qr-prefetch-player.test.js src/__tests__/live-qr-frame-v2.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/SendPanel.jsx src/App.css src/__tests__/live-qr-multi-ui.test.jsx src/__tests__/send-panel-quota.test.jsx
git commit -m "feat: integrate qrl2 live sender queue"
```

---

### Task 6: Alıcı kamera hattı ve doğrulanmış indirme

**Files:**
- Modify: `src/hooks/useMultiQrScanner.js`
- Modify: `src/workers/live-qr-decode.worker.js`
- Modify: `src/workers/live-qr-receive.worker.js`
- Modify: `src/live-qr/receive-client.js`
- Modify: `src/ReceivePanel.jsx`
- Modify: `src/__tests__/multi-qr-scanner.test.jsx`
- Modify: `src/__tests__/live-qr-receive-worker.test.js`
- Modify: `src/__tests__/receive-panel.test.jsx`

**Interfaces:**
- Consumes: `parseLiveFrame(text)` and QRL2 receive session
- Produces: kamera batch → worker decode → paket SHA → güvenli indirme

- [ ] **Step 1: 60→30 FPS düşüş, dolu worker ve indirme güvenliği testlerini yaz**

```js
expect(getUserMedia).toHaveBeenNthCalledWith(1, expect.objectContaining({
  video: expect.objectContaining({ frameRate: { exact: 60 } }),
}));
expect(getUserMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({
  video: expect.objectContaining({ frameRate: { ideal: 30 } }),
}));

expect(URL.createObjectURL).not.toHaveBeenCalled();
receiveWorker.emit({ type: "complete", file: verifiedFile, sha256: expectedSha });
expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
```

Testler `getSettings().frameRate`, sürekli odak desteği, fenerin açılmaması, workerlar doluyken eski kare kuyruğu oluşmaması, QRL1/QRL2 karışım reddi ve unmount sonrası sonuç bastırmayı kapsayacak.

- [ ] **Step 2: Testleri çalıştır ve kamera kısıtlarında kırıldığını doğrula**

Run: `npm test -- src/__tests__/multi-qr-scanner.test.jsx src/__tests__/live-qr-receive-worker.test.js src/__tests__/receive-panel.test.jsx`

Expected: FAIL on frame-rate fallback and QRL2 completion.

- [ ] **Step 3: Kamera açılışını kesin 60, sonra ideal 30 olarak uygula**

```js
const attempts = [
  { width: { ideal: 1280 }, frameRate: { exact: 60 }, facingMode: { ideal: facingMode } },
  { width: { ideal: 1280 }, frameRate: { ideal: 30 }, facingMode: { ideal: facingMode } },
];
```

İlk `OverconstrainedError` sonrası ikinci deneme yapılacak. Başarılı track'in `getSettings()` sonucu UI durumuna aktarılacak. `getCapabilities().focusMode` içinde `continuous` varsa `applyConstraints({ advanced: [{ focusMode: "continuous" }] })` çağrılacak; başarısızlığı taramayı bozmayacak.

- [ ] **Step 4: Bölge takibi ve güncel kare tercihini koru**

İlk üç kamera karesi tam görüntüde taranacak. QR bölgeleri bulunduğunda her bölge yüzde 12 payla büyütülüp decode workerlarına ayrı iş verilecek. Her 30 karede bir tam görüntü kontrolü yapılacak. Havuz doluysa `ImageBitmap.close()` çağrılıp kare atılacak; bekleyen kamera kareleri dizisi oluşturulmayacak.

- [ ] **Step 5: QRL2 doğrulama ve indirme kapısını bağla**

Receive worker yalnız `openLiveQrPackage()` başarıyla döndükten sonra `{ type: "complete", file, sha256 }` yayınlayacak. UI eski URL'yi revoke edecek ve yalnız güncel oturum neslinde yeni URL oluşturacak. Hata durumunda yarım dosya veya indirme bağlantısı kalmayacak.

- [ ] **Step 6: Alıcı testlerini çalıştır**

Run: `npm test -- src/__tests__/multi-qr-scanner.test.jsx src/__tests__/live-qr-receive-worker.test.js src/__tests__/live-qr-receive-session.test.js src/__tests__/receive-panel.test.jsx`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

```bash
git add src/hooks/useMultiQrScanner.js src/workers/live-qr-decode.worker.js src/workers/live-qr-receive.worker.js src/live-qr/receive-client.js src/ReceivePanel.jsx src/__tests__
git commit -m "feat: harden live qr camera receiver"
```

---

### Task 7: Otomatik performans kapısı ve gerçek cihaz kabul formu

**Files:**
- Create: `src/__tests__/live-qr-10mib-performance.test.js`
- Create: `src/__tests__/live-qr-qrl2-render-scan-roundtrip.test.js`
- Create: `scripts/live-qr-benchmark.mjs`
- Create: `docs/live-qr-10mib-manual-test.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: tamamlanmış QRL2 gönderici/alıcı hattı
- Produces: makine kapısı, JSON benchmark ve cihaz kabul kaydı

- [ ] **Step 1: Performans ve gerçek render/tarama kapılarını yaz**

```js
it("10 MiB her beşinci kayıpla 1,5x aday içinde tamamlanır", async () => {
  const result = await runQrl2LossBenchmark({ bytes: 10 * MIB, candidateRatio: 1.5, dropModulo: 5 });
  expect(result.complete).toBe(true);
  expect(result.shaMatches).toBe(true);
  expect(result.elapsedMs).toBeLessThan(30_000);
}, 40_000);
```

Render testi 1600×900 bileşik 1/2/4 QR görüntüsünü gerçek `qrcode` ile oluşturacak, 1280×720 kamera ölçeğine indirecek, `zxing-wasm` ile tarayıp aynı QRL2 oturumunu tamamlayacak.

- [ ] **Step 2: Testleri çalıştır ve kapı geçmeden belgeyi başarılı sayma**

Run: `npm test -- src/__tests__/live-qr-10mib-performance.test.js src/__tests__/live-qr-qrl2-render-scan-roundtrip.test.js`

Expected: PASS before the feature flag is enabled.

- [ ] **Step 3: Tekrarlanabilir benchmark betiğini ekle**

```js
const cases = [
  { bytes: 1 * MIB, loss: 0.20 },
  { bytes: 5 * MIB, loss: 0.20 },
  { bytes: 10 * MIB, loss: 0.20 },
];
```

Betiğin JSON çıktısı boyut, K, üretilen/kabul edilen/yinelenen sembol, çözme süresi, tepe heap ve SHA sonucunu yazacak. Sabit xorshift seed kullanılacak.

- [ ] **Step 4: Manuel cihaz formunu ekle**

Form Windows Chrome→Android 5/5 ≤90 sn; Windows Chrome→iPhone ≥4/5 ≤120 sn; macOS Safari→iPhone ≥4/5 ≤120 sn; telefon→telefon ≥4/5 ≤150 sn satırlarını içerecek. Her satır dosya adı, MIME, byte, SHA, süre, gerçek FPS, profil ve deneme sonucunu zorunlu tutacak.

- [ ] **Step 5: Tam doğrulamayı çalıştır**

Run: `npm test`

Expected: all existing and new tests PASS, with only explicitly documented skips.

Run: `npm run lint`

Expected: exit 0; existing warnings may remain, new errors/warnings must be 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/__tests__/live-qr-10mib-performance.test.js src/__tests__/live-qr-qrl2-render-scan-roundtrip.test.js scripts/live-qr-benchmark.mjs docs/live-qr-10mib-manual-test.md README.md
git commit -m "test: gate live qr 10 mib release"
```
