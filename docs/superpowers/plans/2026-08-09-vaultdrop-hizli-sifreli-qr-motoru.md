# VaultDrop Hızlı Şifreli QR Motoru Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 MiB şifreli veriyi telefon ve bilgisayarlar arasında, kayıp karelere dayanıklı en fazla 120 saniyelik QR taşıyıcı videoyla aktarabilen cihazdan bağımsız bir motor oluşturmak.

**Architecture:** Mevcut BTA1/AES-256-GCM üretimi korunur; yalnız şifreli BTA baytları yeni `QRF1` optik protokolüne ve sistematik fountain sembollerine dönüştürülür. Dengeli profil iki QR/24 FPS, Uyumlu profil tek QR/15 FPS kullanır; alıcı video karelerini yerel WASM okuyucusu ve sınırlı işçi havuzuyla çözer, geçici kurtarma verisini yalnız cihazdaki IndexedDB'de tutar.

**Tech Stack:** React 19, Vite 8, Vitest 4, Web Crypto, IndexedDB, Canvas, MediaRecorder, Web Workers, `qrcode`, `zxing-wasm/reader` 3.1.2, mevcut BTA1 kodu.

## Global Constraints

- Kaynak dosya, BTA verisi, QR videosu, anahtar veya QR yükü içerik sunucusuna gönderilmeyecek.
- BTA1 biçimi ve AES-256-GCM şifreleme sözleşmesi değiştirilmeyecek.
- `QRT3` video ve canlı QR alma uyumluluğu korunacak; yeni protokol sürümü `QRF1` olacak.
- Dengeli başlangıç profili: 1920×1080, iki QR, 24 FPS, QR başına 1.400 bayt, yüzde 50 toplam aktarım ek yükü.
- Uyumlu başlangıç profili: 1280×720, tek QR, 15 FPS, QR başına 700 bayt, yüzde 50 toplam aktarım ek yükü.
- 5 MiB, yalnız performans kabul girdisidir; aylık veya hesap kotası değildir.
- En az yüzde 20 kayıp, tekrar ve sıra değişikliğinde doğru BTA yeniden oluşturulacak.
- Kurtarma deposu anahtar, açık dosya adı veya açık MIME türü tutmayacak; kayıtlar 24 saatte sona erecek.
- WASM ikilisi CDN'den yüklenmeyecek; uygulamanın kendi statik dosyası olarak sunulacak.
- Uygulama sırasında yeni bir Git deposu başlatılmayacak. Bu çalışma alanında `.git` bulunmadığından commit adımları yerine her görev raporunda değişen dosyalar ve taze test çıktısı kaydedilecek.

---

## Dosya yapısı

Yeni dosyalar tek sorumlulukla oluşturulacak:

- `src/optical/profiles.js`: profil sabitleri ve süre hesabı.
- `src/optical/fountain.js`: kaynak bloklama, belirli onarım sembolleri ve kademeli çözme.
- `src/optical/frame-v4.js`: `QRF1` metin çerçevesi, sınırlar ve CRC doğrulaması.
- `src/optical/receive-session-v4.js`: tek oturuma ait QRF1 sembollerini toplama ve birleştirme.
- `src/optical/frame-layout.js`: tek/çift QR bölge geometrisi.
- `src/video/video-frame-reader.js`: hızlı video kare kaynağı ve HTML video uyumlu yolu.
- `src/video/qr-worker-pool.js`: sınırlı paralel QR çözme işleri.
- `src/workers/qr-wasm-decode.worker.js`: yalnız yerel `zxing-wasm/reader` ile QR çözme.
- `src/video/qr-video-recovery-store.js`: 24 saatlik IndexedDB kurtarma kayıtları.
- `scripts/prepare-zxing-wasm.mjs`: sürümle eşleşen WASM dosyasını `public/vendor/` altına kopyalama ve özetini doğrulama.

Mevcut `src/video/create-qr-video.js`, `src/video/decode-qr-video.js`, `src/VideoTransferPanel.jsx` ve protokol yönlendiricileri yeni birimler üzerinden çalışacak; büyük algoritmalar bu UI dosyalarına gömülmeyecek.

---

### Task 1: Optik profiller ve süre sözleşmesi

**Files:**
- Create: `src/optical/profiles.js`
- Create: `src/__tests__/optical-profiles.test.js`
- Modify: `src/video/frame-schedule.js`

**Interfaces:**
- Produces: `OPTICAL_PROFILES`, `getOpticalProfile(id)`, `estimateOpticalVideo({ byteLength, profileId })`.
- `estimateOpticalVideo` returns `{ sourceSymbols, emittedSymbols, videoFrames, durationSeconds }`.

- [ ] **Step 1: Write the failing profile tests**

```js
import { describe, expect, it } from "vitest";
import { estimateOpticalVideo, getOpticalProfile } from "../optical/profiles.js";

describe("optical profiles", () => {
  it("Dengeli profili kesin değerlerle verir", () => {
    expect(getOpticalProfile("balanced")).toMatchObject({
      width: 1920, height: 1080, fps: 24, qrCount: 2,
      symbolBytes: 1400, emissionRatio: 1.5,
    });
  });

  it("5 MiB için 120 saniyeyi aşmaz", () => {
    expect(estimateOpticalVideo({
      byteLength: 5 * 1024 * 1024,
      profileId: "balanced",
    }).durationSeconds).toBeLessThanOrEqual(120);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/__tests__/optical-profiles.test.js`

Expected: FAIL because `src/optical/profiles.js` does not exist.

- [ ] **Step 3: Implement exact profile and integer ceiling calculations**

```js
export const OPTICAL_PROFILES = Object.freeze({
  balanced: Object.freeze({
    id: "balanced", width: 1920, height: 1080, fps: 24,
    qrCount: 2, symbolBytes: 1400, emissionRatio: 1.5,
  }),
  compatible: Object.freeze({
    id: "compatible", width: 1280, height: 720, fps: 15,
    qrCount: 1, symbolBytes: 700, emissionRatio: 1.5,
  }),
});

export function estimateOpticalVideo({ byteLength, profileId = "balanced" }) {
  const profile = getOpticalProfile(profileId);
  const sourceSymbols = Math.max(1, Math.ceil(byteLength / profile.symbolBytes));
  const emittedSymbols = Math.ceil(sourceSymbols * profile.emissionRatio);
  const videoFrames = Math.ceil(emittedSymbols / profile.qrCount);
  return { sourceSymbols, emittedSymbols, videoFrames,
    durationSeconds: Math.ceil(videoFrames / profile.fps) };
}
```

- [ ] **Step 4: Run GREEN and legacy schedule tests**

Run: `npm test -- src/__tests__/optical-profiles.test.js src/__tests__/create-qr-video.test.js`

Expected: both files PASS; old `VIDEO_OPTIONS` remains available only for QRT3 compatibility.

---

### Task 2: Sistematik fountain kodlayıcı ve kademeli çözücü

**Files:**
- Create: `src/optical/fountain.js`
- Create: `src/__tests__/optical-fountain.test.js`

**Interfaces:**
- Produces: `createFountainEncoder(bytes, options)`.
- Encoder returns `{ metadata, symbol(symbolId), symbols() }`.
- Produces: `createFountainDecoder(metadata)` returning `{ accept(symbol), progress(), isComplete(), bytes() }`.
- A symbol has `{ symbolId, data: Uint8Array }`; its source indices are deterministically derived from `transferId`, `symbolId`, and `sourceCount`.

- [ ] **Step 1: Write failing loss, duplicate and ordering tests**

```js
it("yüzde 20 kayıp ve karışık sırada özgün baytları kurar", async () => {
  const bytes = seededBytes(5 * 1024 * 1024);
  const encoder = await createFountainEncoder(bytes, {
    transferId: "Ab12Cd34Ef56", blockBytes: 1400, emissionRatio: 1.5,
  });
  const received = encoder.symbols()
    .filter((_, index) => index % 5 !== 0)
    .reverse();
  const decoder = createFountainDecoder(encoder.metadata);
  for (const symbol of [...received, received[0]]) decoder.accept(symbol);
  expect(decoder.isComplete()).toBe(true);
  expect(decoder.bytes()).toEqual(bytes);
});
```

Also assert malformed lengths, symbol IDs beyond the configured maximum, cross-session metadata, empty input, and deterministic repair symbols.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/__tests__/optical-fountain.test.js`

Expected: FAIL because fountain interfaces do not exist.

- [ ] **Step 3: Implement source symbols and deterministic repair equations**

Use systematic source symbols for IDs `0..K-1`. For IDs `K..ceil(K*1.5)-1`, derive a bounded degree and distinct source indices from a small seeded PRNG. XOR only those blocks. Store equations as `Set<number> + Uint8Array`; whenever an equation reaches degree one, solve that block and peel it from remaining equations.

```js
function xorInto(target, source) {
  for (let index = 0; index < target.length; index += 1) target[index] ^= source[index];
}

function seedFor(transferId, symbolId) {
  let seed = symbolId ^ 0x9e3779b9;
  for (const byte of new TextEncoder().encode(transferId)) {
    seed = Math.imul(seed ^ byte, 16777619) >>> 0;
  }
  return seed || 1;
}
```

Degree selection must strongly favor degrees 1–4 while permitting larger equations; cap degree at `Math.min(32, sourceCount)`. Decoder progress is `{ solved, sourceCount, accepted, duplicates }`. `bytes()` trims padding using `originalBytes`.

- [ ] **Step 4: Run GREEN and a 20-iteration deterministic erasure matrix**

Run: `npm test -- src/__tests__/optical-fountain.test.js`

Expected: all iterations PASS in under 30 seconds on the development machine. If the deterministic matrix exposes an unsolved graph, adjust only the degree distribution/repair schedule; do not weaken the 20% loss assertion.

---

### Task 3: Sürümlü ve sınırlandırılmış QRF1 çerçevesi

**Files:**
- Create: `src/optical/frame-v4.js`
- Create: `src/__tests__/optical-frame-v4.test.js`
- Modify: `src/protocol/index.js`
- Modify: `src/protocol.js`

**Interfaces:**
- Produces: `OPTICAL_PROTOCOL_VERSION = "QRF1"`.
- Produces: `encodeFrameV4(metadata, symbol)` and `parseFrameV4(text)`.
- `parseFrame(text)` returns QRF1 frames when text starts with `QRF1|`, otherwise preserves QRT3/legacy routing.

- [ ] **Step 1: Write failing round-trip and hostile-input tests**

```js
const metadata = {
  transferId: "Ab12Cd34Ef56", sourceCount: 4, blockBytes: 1400,
  originalBytes: 5000, sha256: "validBase64UrlSha256Value000000000000000",
};
const text = encodeFrameV4(metadata, { symbolId: 7, data: new Uint8Array([1, 2, 3]) });
expect(parseFrameV4(text)).toMatchObject({
  protocolVersion: "QRF1", transferId: metadata.transferId, symbolId: 7,
});
expect(parseFrameV4(text.replace("AQID", "AQIE"))).toBeNull();
```

Add cases for excessive text length, `originalBytes > 50 MiB`, invalid transfer ID, impossible block size, invalid hash, invalid base64url and CRC mismatch.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/__tests__/optical-frame-v4.test.js`

- [ ] **Step 3: Implement a ten-field frame**

Exact wire order:

```text
QRF1|transferId|symbolId|sourceCount|blockBytes|originalBytes|sha256|payloadBytes|crc32|base64urlPayload
```

Reuse `toBase64Url`, `fromBase64Url`, `crc32Hex`, and existing safe integer patterns. Parser output must allocate payload only after encoded-length limits pass.

- [ ] **Step 4: Run GREEN plus all protocol tests**

Run: `npm test -- src/__tests__/optical-frame-v4.test.js src/__tests__/protocol-v2.test.js src/__tests__/video-decode-state.test.js`

Expected: QRF1 and all old protocols PASS.

---

### Task 4: QRF1 alma oturumu ve bütünlük doğrulaması

**Files:**
- Create: `src/optical/receive-session-v4.js`
- Create: `src/__tests__/optical-receive-session-v4.test.js`
- Modify: `src/video/decode-qr-video.js`

**Interfaces:**
- Produces: `createOpticalReceiveSession({ maxBytes })`.
- Session returns `{ accept(frame), progress(), getState(), assemble(), exportRecovery() }`.
- `assemble()` resolves to `{ bytes, metadata }` only after fountain completion and SHA-256 equality.

- [ ] **Step 1: Write failing session tests**

Cover duplicate symbols, different transfer IDs, metadata mismatch, size limit, 20% symbol loss, SHA mismatch, recovery import/export and no plaintext metadata.

```js
expect(session.progress()).toEqual({
  solved: expect.any(Number), sourceCount: encoder.metadata.sourceCount,
  accepted: expect.any(Number), duplicates: expect.any(Number),
});
await expect(session.assemble()).resolves.toEqual({
  bytes, metadata: expect.objectContaining({ protocolVersion: "QRF1" }),
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/__tests__/optical-receive-session-v4.test.js`

- [ ] **Step 3: Implement session isolation and SHA verification**

The first valid frame locks metadata. Later frames must match every immutable field. Use `sha256Base64Url(bytes)` before returning. A hash mismatch moves state to `failed` and returns error code `INTEGRITY_FAILED`; it never returns bytes.

- [ ] **Step 4: Route decoded frame text by version**

In `decodeQrVideo`, preserve the current QRT3 receive session and add a QRF1 session selected by the first valid frame. Do not change the public call signature:

```js
decodeQrVideo(file, callbacks = {}, signal, options = {})
```

- [ ] **Step 5: Run GREEN and compatibility tests**

Run: `npm test -- src/__tests__/optical-receive-session-v4.test.js src/__tests__/video-decode-state.test.js`

---

### Task 5: Çift QR düzeni ve QRF1 video üretimi

**Files:**
- Create: `src/optical/frame-layout.js`
- Create: `src/__tests__/optical-frame-layout.test.js`
- Create: `src/__tests__/create-qr-video-v4.test.js`
- Modify: `src/video/create-qr-video.js`
- Modify: `src/video/frame-schedule.js`

**Interfaces:**
- Produces: `getQrRegions(profile)` returning `{ x, y, size }[]`.
- `createQrVideo(file, options, onProgress)` remains public, with `options.profileId` defaulting to `balanced`.
- Result adds `{ protocolVersion: "QRF1", profileId, durationSeconds, stages }` without removing existing fields.

- [ ] **Step 1: Write failing geometry and generation tests**

```js
expect(getQrRegions(getOpticalProfile("balanced"))).toEqual([
  { x: 60, y: 90, size: 900 },
  { x: 960, y: 90, size: 900 },
]);
```

Generation tests must mock BTA encryption, fountain encoder, QR canvas and MediaRecorder; assert two different QRF1 texts are rendered into each video frame, no key appears in any QR text, the canvas stays 1920×1080, and a 5 MiB schedule is at most 120 seconds.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/__tests__/optical-frame-layout.test.js src/__tests__/create-qr-video-v4.test.js`

- [ ] **Step 3: Implement profile-driven schedule and rendering**

Pre-render only the next bounded batch of QR canvases; do not hold thousands of full-resolution canvases. Each scheduled video frame consumes up to `profile.qrCount` consecutive symbols. Use existing absolute-time scheduling so QR render latency does not accumulate.

Progress stages must be emitted as:

```js
onProgress?.({ stage: "encrypting" | "encoding" | "recording", percent });
```

For compatibility with the current UI during this task, also accept a callback that reads `value.percent`.

- [ ] **Step 4: Run GREEN plus old creator tests**

Run: `npm test -- src/__tests__/optical-frame-layout.test.js src/__tests__/create-qr-video-v4.test.js src/__tests__/create-qr-video.test.js`

---

### Task 6: Yerel ZXing-WASM, işçi havuzu ve hızlı video çözme

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/prepare-zxing-wasm.mjs`
- Create: `src/workers/qr-wasm-decode.worker.js`
- Create: `src/video/qr-worker-pool.js`
- Create: `src/video/video-frame-reader.js`
- Create: `src/__tests__/qr-worker-pool.test.js`
- Create: `src/__tests__/decode-qr-video-v4.test.js`
- Modify: `scripts/build-production.mjs`
- Modify: `src/video/decode-qr-video.js`

**Interfaces:**
- Produces: `createQrWorkerPool({ workerFactory, size })` with `decode(regions, signal)` and `close()`.
- Produces: `readVideoFrames(file, { fps, onFrame, signal })`.
- Worker message input `{ id, imageData }`; output `{ id, texts: string[] }` or `{ id, error }`.

- [ ] **Step 1: Install the pinned reader**

Run: `npm install --save-exact zxing-wasm@3.1.2`

Expected: package and lock file contain exactly `3.1.2`. The package-specific code is MIT; ZXing-C++ is Apache-2.0. No Decimen code is added.

- [ ] **Step 2: Write failing worker-pool tests**

Assert bounded worker count `Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))`, job/result pairing, abort, worker error, region ordering and `close()` termination.

- [ ] **Step 3: Add local WASM preparation**

`prepare-zxing-wasm.mjs` must copy `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` to `public/vendor/zxing_reader.wasm` and verify its SHA-256 against `ZXING_WASM_SHA256`. `build-production.mjs` awaits this preparation before starting Vite. The worker calls `prepareZXingModule` with `locateFile` returning `/vendor/zxing_reader.wasm`; it must never use the package's CDN default.

- [ ] **Step 4: Implement worker decoding**

```js
const results = await readBarcodes(imageData, {
  formats: ["QRCode"], tryHarder: false, maxNumberOfSymbols: 1,
});
self.postMessage({ id, texts: results.map((item) => item.text) });
```

Each main-thread frame is cropped to the known one/two QR regions before transfer to workers. Transfer `ImageData.data.buffer` ownership where possible to avoid copies.

- [ ] **Step 5: Implement frame reader and QRF1 decode path**

Use sequential frame timestamps at the profile FPS. Prefer `requestVideoFrameCallback` when it can deliver every stored frame; retain controlled seek as the universal fallback. The reader reports `{ frameIndex, currentTime, duration, imageData }` and stops as soon as the receive session completes.

- [ ] **Step 6: Run focused GREEN and real build**

Run: `npm test -- src/__tests__/qr-worker-pool.test.js src/__tests__/decode-qr-video-v4.test.js src/__tests__/video-decode-state.test.js`

Run: `npm run build`

Expected: tests PASS; `dist/vendor/zxing_reader.wasm` exists; built JS contains no `jsdelivr`, `unpkg` or `fastly.jsdelivr` URL.

---

### Task 7: 24 saatlik yerel kurtarma deposu

**Files:**
- Create: `src/video/qr-video-recovery-store.js`
- Create: `src/__tests__/qr-video-recovery-store.test.js`
- Modify: `src/video/create-qr-video.js`
- Modify: `src/video/decode-qr-video.js`

**Interfaces:**
- Produces: `createQrVideoRecoveryStore(indexedDb = globalThis.indexedDB)`.
- Store methods: `saveOutgoing(record)`, `saveIncoming(record)`, `get(id)`, `delete(id)`, `deleteExpired(now)`, `list()`.
- Records use `{ id, direction, protocolVersion, transferId, createdAt, expiresAt, encryptedBytes?, symbols? }`.

- [ ] **Step 1: Write failing privacy, expiry and resume tests**

```js
expect(JSON.stringify(savedRecord)).not.toContain("keyText");
expect(JSON.stringify(savedRecord)).not.toContain("belge.pdf");
expect(await store.get("expired-id")).toBeNull();
```

Test outgoing encrypted BTA recovery, incoming deduplicated symbols, successful deletion, manual deletion, quota error and unavailable IndexedDB.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/__tests__/qr-video-recovery-store.test.js`

- [ ] **Step 3: Implement IndexedDB v1 store**

Use database `vaultdrop-qr-video-recovery`, object store `sessions`, key path `id`, and index `expiresAt`. Clone byte arrays before saving/returning. Do not add a localStorage fallback because 5 MiB records exceed safe localStorage size; when IndexedDB is unavailable return typed error `RECOVERY_UNAVAILABLE` and let transfer continue.

- [ ] **Step 4: Wire recovery checkpoints**

Outgoing: save only after BTA encryption succeeds and before video recording starts. Incoming: batch writes at most once per second and on abort; do not write every QR symbol individually. On successful video creation or successful BTA extraction, delete the matching recovery record.

- [ ] **Step 5: Run GREEN and no-sensitive-field scan**

Run: `npm test -- src/__tests__/qr-video-recovery-store.test.js src/__tests__/create-qr-video-v4.test.js src/__tests__/decode-qr-video-v4.test.js`

Run: `rg -n "keyText|fileName|mime" src/video/qr-video-recovery-store.js`

Expected: tests PASS; scan has no stored-record field carrying these values.

---

### Task 8: Telefon/PC arayüzü, profil önerisi ve devam etme

**Files:**
- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/styles.css`
- Modify: `src/__tests__/video-transfer-ui.test.jsx`
- Modify: `src/__tests__/secure-package-ui.test.jsx` only if its broad text queries conflict with the new visible copy.

**Interfaces:**
- Consumes: `estimateOpticalVideo`, `createQrVideo`, `decodeQrVideo`, recovery store.
- Preserves: existing activity reservation/finalization ordering and local-only receive behavior.

- [ ] **Step 1: Write failing UI tests**

Assert:

- “Dengeli” selected by default and “Uyumlu” available.
- 5 MiB estimate says at most 120 seconds and never calls it a quota.
- Stage labels are “Şifreleme”, “Kurtarma parçaları”, “QR videosu”, “Tamamlandı”.
- Receive UI shows scan percentage separately from recovered-data percentage.
- Desktop drop event accepts MP4/WebM.
- Result explains “WhatsApp/Telegram'da dosya-belge olarak gönder”.
- Existing recovery record shows “Devam et” and “Yarım kalan işlemi sil”.
- `RECOVERY_UNAVAILABLE` shows a warning but does not cancel transfer.
- Receive and decrypt path makes no `fetch` call.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/__tests__/video-transfer-ui.test.jsx`

- [ ] **Step 3: Split focused presentation helpers before expanding JSX**

Keep `VideoTransferPanel` orchestration but extract small components in the same file only if each stays under roughly 80 lines: `ProfileChoice`, `TransferStages`, `RecoveryNotice`, `VideoDropzone`. Do not move activity quota logic or decrypt logic into presentation components.

- [ ] **Step 4: Implement platform-neutral copy and controls**

Use “gönderen cihaz” and “alıcı cihaz”; do not say the video only forms on a phone. On mobile show native share plus save; on desktop show download plus drag/drop. Before creation, require an explicit checkbox confirming the key was copied or safely saved; the key is never persisted for recovery.

- [ ] **Step 5: Run GREEN and relevant UI suite**

Run: `npm test -- src/__tests__/video-transfer-ui.test.jsx src/__tests__/secure-package-ui.test.jsx src/__tests__/receive-encrypted-video.test.jsx`

Run: `npm run lint`

Expected: tests PASS; lint has no new errors or warnings.

---

### Task 9: Performans, güvenlik, belge ve gerçek cihaz kapısı

**Files:**
- Create: `src/__tests__/optical-5mib-performance.test.js`
- Create: `src/__tests__/optical-network-isolation.test.jsx`
- Modify: `docs/mobile-video-manual-test.md`
- Modify: `README.md`
- Create: `.superpowers/sdd/2026-08-09-vaultdrop-hizli-sifreli-qr-motoru/final-report.md`

**Interfaces:**
- Consumes all prior tasks; produces no new runtime API.

- [ ] **Step 1: Add deterministic 5 MiB acceptance test**

The test builds 5 MiB seeded bytes, encodes at Balanced values, drops exactly every fifth symbol, reverses each 100-symbol window, inserts duplicates, decodes and checks byte equality plus calculated duration `<= 120`.

- [ ] **Step 2: Add network isolation test**

Spy on `fetch`, `XMLHttpRequest.prototype.open`, `navigator.sendBeacon` and `WebSocket`. Allow the explicitly local WASM static asset initialization only in the worker unit test; during file encryption, video generation, video decoding and BTA opening, assert zero content-bearing network calls.

- [ ] **Step 3: Expand the manual matrix**

For each Android Chrome, iOS Safari, Windows Chrome and Windows Edge run, record device, OS, browser, source size, carrier type, profile, creation time, video duration, decode time, recovered/lost symbols and SHA result. Include all four transfer directions and WhatsApp/Telegram “dosya-belge” delivery.

- [ ] **Step 4: Run the complete automated verification once, serially**

Run: `npm test -- --no-file-parallelism`

Run: `npm run lint`

Run: `npm run build`

Run: `rg -n "jsdelivr|unpkg|fastly\.jsdelivr" dist src public`

Expected: all tests PASS except explicitly documented environment-only skips; lint exit 0; build exit 0; CDN scan empty; `dist/vendor/zxing_reader.wasm` exists.

- [ ] **Step 5: Perform the real-device release gate**

The feature is not described as meeting the 120-second product claim until the Android and iPhone rows are actually filled and both pass. If a device fails Balanced, record the evidence, verify Compatible succeeds, and keep the UI recommendation conservative for that device class.

- [ ] **Step 6: Write the final report**

Record changed files, dependency version/licenses, RED→GREEN commands, full verification output, measured device results, residual risks and the fact that no DB migration/deployment/Git initialization occurred.

---

## Uygulama sonrası bağımsız inceleme ölçütleri

Reviewer şu beş noktayı ayrıca izlemelidir:

1. `QRF1` içinde anahtar veya açık dosya üst bilgisinin bulunmaması.
2. WASM dosyasının CDN yerine aynı kaynaktan yüklenmesi.
3. Yüzde 20 kayıp testinin gerçekten sembol kaybetmesi; yalnız tekrar/sıra değişikliği yapmaması.
4. Eski QRT3 videolarının açılmaya devam etmesi.
5. Arayüzdeki 120 saniye ifadesinin aylık kota gibi sunulmaması ve gerçek cihaz kanıtı olmadan kesin hız vaadine dönüşmemesi.
