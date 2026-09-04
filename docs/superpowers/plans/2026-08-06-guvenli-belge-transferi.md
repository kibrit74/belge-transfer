# Güvenli Belge Transferi Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut canlı QR aktarımını güvenilir hale getirmek; belgenin özgün byte'larını koruyan ve uzak paylaşımda cihaz üzerinde şifrelenen `.bta` paketi ile QR-video seçeneklerini, uygulamaya ait bir sunucu kurmadan eklemek.

**Architecture:** Uygulama statik React/Vite istemcisi olarak kalacak ve hiçbir proje sunucusuna dosya yüklemeyecek. Uzak paylaşımda belge önce tarayıcıda AES-256-GCM ile şifrelenecek; aynı şifreli paket doğrudan dosya olarak veya tekrarlı QR karelerinden oluşan video olarak taşınacak. Aynı ortamdaki canlı QR özgün byte'ları QRT3 ile taşıyacak; bütün yöntemler aktarım sonunda SHA-256 bütünlük doğrulaması yapacak.

**Tech Stack:** React 19, Vite 8, Web Crypto API, Web Workers, MediaRecorder, BarcodeDetector/jsQR, fflate, Vitest.

## Global Constraints

- Uygulamanın backend'i, dosya yükleme servisi, veritabanı veya telemetri servisi olmayacak.
- WhatsApp, Slack veya başka bir paylaşım kanalı kullanılırsa bu kanal yalnızca şifreli çıktı taşıyacak; kanalın aracı olduğu kullanıcıya açıkça söylenecek.
- Şifre anahtarı `.bta` paketinin veya QR videosunun içine gömülmeyecek ve varsayılan olarak aynı paylaşım akışına eklenmeyecek.
- Dosyanın adı, MIME türü ve içeriği şifreli bölümde tutulacak; dışarıda yalnızca rastgele aktarım kimliği ve teknik sürüm bilgisi bulunacak.
- Hukuki belge ve delil görselleri varsayılan olarak yeniden boyutlandırılmayacak, JPEG'e çevrilmeyecek veya başka biçimde değiştirilmeyecek.
- Gönderici ve alıcıda özgün dosyanın SHA-256 özeti gösterilecek; eşleşme yalnızca byte düzeyinde bütünlüğü ifade edecek, hukuki geçerlilik iddiası taşımayacak.
- Girdi için varsayılan üst sınır 50 MiB olacak. Canlı QR ve QR-video için 500 KiB üzerinde süre uyarısı, QR-video için 2 MiB sabit üst sınır uygulanacak.
- QRT1 ve QRT2 alımı geriye dönük olarak desteklenecek; yeni üretimler QRT3 kullanacak.
- Kullanıcıya gösterilen tüm metinler UTF-8 Türkçe olacak.
- Çalışma klasöründe şu anda Git deposu bulunmuyor. Her task sonundaki commit adımı, kullanıcı Git başlatılmasına ayrıca izin verirse uygulanacak; izin yoksa kod değişikliği yapılacak fakat commit adımı atlanarak raporlanacak.

---

## Dosya Yapısı

Oluşturulacak veya ayrılacak temel birimler:

- `src/protocol/base64url.js`: Base64 URL dönüşümleri.
- `src/protocol/crc32.js`: Her QR parçası için hızlı bozulma kontrolü.
- `src/protocol/hash.js`: SHA-256 üretimi ve güvenli karşılaştırma.
- `src/protocol/frame-v3.js`: QRT3 kare üretme, ayrıştırma, sınır ve parça doğrulaması.
- `src/protocol/legacy.js`: QRT1/QRT2 alım uyumluluğu.
- `src/protocol/index.js`: UI'nin kullanacağı kararlı protokol dışa aktarımları.
- `src/crypto/encrypted-container.js`: BTA1 şifreli paket üretme ve açma.
- `src/transfer/receive-session.js`: Oturum, tekrar eden kare ve tamamlanma yönetimi.
- `src/video/frame-schedule.js`: Video kare sırası ve tekrar planı.
- `src/video/create-qr-video.js`: Şifreli paketten video oluşturma.
- `src/video/decode-qr-video.js`: Yüklenen videodan QR karelerini çıkarma.
- `src/workers/qr-decode.worker.js`: jsQR çözümlemesini ana arayüz işinden ayırma.
- `src/hooks/useCameraScanner.js`: Kamera yaşam döngüsü ve tarama denetimi.
- `src/TransferMethodSelector.jsx`: Canlı QR, güvenli paket ve QR-video seçimi.
- `src/SecurePackagePanel.jsx`: Şifreli paket üretme/açma arayüzü.
- `src/VideoTransferPanel.jsx`: QR-video üretme/okuma arayüzü.
- `src/__tests__/`: Saf protokol, şifreleme ve oturum testleri.
- `src/test/setup.js`: UI testlerinin ortak DOM eşleştiricileri.
- `vitest.config.js`: Node ve jsdom test ortamları.

Mevcut `src/protocol.js`, geçiş süresince dışa aktarım uyumluluğu sağlayacak ve son aşamada küçük bir yönlendirme dosyasına dönüşecek.

---

### Task 1: Test altyapısı ve kritik kare sıralama hatası

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `src/test/setup.js`
- Modify: `src/protocol.js`
- Create: `src/__tests__/protocol-v2.test.js`

**Interfaces:**
- Consumes: Mevcut `encodeFileToFrames(file, arrayBuffer, options)`.
- Produces: `chooseCoprimeStride(total: number): number`; sonlu ve tüm indeksleri bir kez kapsayan QRT2 kare sırası.

- [ ] **Step 1: Vitest komutunu ve geliştirme bağımlılığını ekle**

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom
```

`package.json` script'leri:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    restoreMocks: true,
  },
});
```

`src/test/setup.js`:

```js
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Beşin katı kare sayılarında hatayı gösteren testi yaz**

```js
import { describe, expect, it } from "vitest";
import { encodeFileToFrames, parseFrame } from "../protocol";

describe("QRT2 kare sırası", () => {
  it.each([5, 10, 15, 20])("%i kareyi birer kez üretir", (total) => {
    const bytes = crypto.getRandomValues(new Uint8Array(total * 450));
    const file = new File([bytes], "delil.bin", { type: "application/octet-stream" });
    const result = encodeFileToFrames(file, bytes.buffer, {
      compress: false,
      chunkBytes: 450,
    });
    const indexes = result.frames.map((text) => parseFrame(text).index);
    expect(indexes).toHaveLength(total);
    expect(new Set(indexes).size).toBe(total);
  });
});
```

- [ ] **Step 3: Testi çalıştır ve mevcut uygulamanın zaman aşımına girdiğini doğrula**

Run: `cmd /c npx vitest run src/__tests__/protocol-v2.test.js --testTimeout=1000`

Expected: En az bir 5'in katı vaka zaman aşımına uğrar.

- [ ] **Step 4: Toplamla aralarında asal adım seçimini uygula**

```js
function gcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function chooseCoprimeStride(total) {
  for (const candidate of [7, 5, 3, 2]) {
    if (candidate < total && gcd(candidate, total) === 1) return candidate;
  }
  return 1;
}
```

`stride = 5` sabiti yerine `chooseCoprimeStride(total)` kullanılacak.

- [ ] **Step 5: Birim testi, lint ve build çalıştır**

Run: `cmd /c npm test`

Expected: Tüm testler PASS.

Run: `cmd /c npm run lint`

Expected: Yeni hata yok.

Run: `cmd /c npm run build`

Expected: Production build başarıyla oluşur.

- [ ] **Step 6: Değişikliği kaydet**

```bash
git add package.json package-lock.json vitest.config.js src/test/setup.js src/protocol.js src/__tests__/protocol-v2.test.js
git commit -m "fix: make QR frame ordering finite"
```

---

### Task 2: QRT3 protokolü, sınırlar ve doğrulama

**Files:**
- Create: `src/protocol/base64url.js`
- Create: `src/protocol/crc32.js`
- Create: `src/protocol/hash.js`
- Create: `src/protocol/frame-v3.js`
- Create: `src/protocol/legacy.js`
- Create: `src/protocol/index.js`
- Modify: `src/protocol.js`
- Create: `src/__tests__/frame-v3.test.js`

**Interfaces:**
- Consumes: `Uint8Array`, dosya üst bilgisi ve `crypto.subtle`.
- Produces: `encodeFramesV3(input): EncodedTransfer`; `parseFrame(text): ParsedFrame | null`; `crc32Hex(bytes): string`; `sha256Base64Url(bytes): Promise<string>`.

- [ ] **Step 1: Sınır ve bozuk kare testlerini yaz**

```js
import { describe, expect, it } from "vitest";
import { encodeFramesV3, parseFrameV3 } from "../protocol/frame-v3";

describe("QRT3", () => {
  it("tüm parçaları sıra bağımsız doğrular", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(2048));
    const encoded = await encodeFramesV3({
      bytes,
      transferId: "abc123def456",
      chunkBytes: 450,
    });
    const parsed = encoded.frames.map(parseFrameV3);
    expect(parsed.every(Boolean)).toBe(true);
    expect(new Set(parsed.map((frame) => frame.index)).size).toBe(encoded.total);
  });

  it.each([
    "QRT3|x|-1|3|0|x|x",
    "QRT3|x|3|3|0|x|x",
    "QRT3|x|0|999999999|0|x|x",
  ])("geçersiz kareyi reddeder: %s", (text) => {
    expect(parseFrameV3(text)).toBeNull();
  });
});
```

- [ ] **Step 2: Testi çalıştır ve modüller olmadığı için başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/frame-v3.test.js`

Expected: FAIL, `frame-v3` modülü bulunamaz.

- [ ] **Step 3: QRT3 biçimini uygula**

Kare biçimi:

```text
QRT3|transferId|index|total|payloadSize|chunkCrc32|dataBase64Url
```

Sabitler:

```js
export const PROTOCOL_VERSION = "QRT3";
export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_FRAME_COUNT = 150_000;
export const DEFAULT_CHUNK_BYTES = 450;
```

`parseFrameV3` şu koşullarda `null` döndürmeli: alan sayısı yanlışsa, aktarım kimliği beklenen biçimde değilse, sayılar güvenli pozitif tam sayı değilse, `index >= total` ise, sınırlar aşılmışsa veya `chunkCrc32` veriyle eşleşmiyorsa. CRC32 yalnızca bozuk QR parçasını yakalar; güvenlik ve dosyanın tamamı için SHA-256/AES-GCM doğrulaması ayrıca yapılır.

- [ ] **Step 4: QRT1/QRT2 ayrıştırmasını legacy modülüne taşı**

```js
export function parseFrame(text) {
  if (text.startsWith("QRT3|")) return parseFrameV3(text);
  return parseLegacyFrame(text);
}
```

- [ ] **Step 5: Protokol testlerini çalıştır**

Run: `cmd /c npx vitest run src/__tests__/protocol-v2.test.js src/__tests__/frame-v3.test.js`

Expected: Tüm testler PASS.

- [ ] **Step 6: Değişikliği kaydet**

```bash
git add src/protocol.js src/protocol src/__tests__/frame-v3.test.js
git commit -m "feat: add validated QRT3 protocol"
```

---

### Task 3: BTA1 şifreli belge paketi

**Files:**
- Create: `src/crypto/encrypted-container.js`
- Create: `src/__tests__/encrypted-container.test.js`

**Interfaces:**
- Consumes: `File`, AES-GCM sağlayan Web Crypto API.
- Produces: `encryptFile(file): Promise<EncryptedResult>`; `decryptContainer(buffer, keyText): Promise<DecryptedResult>`.

```ts
type EncryptedResult = {
  blob: Blob;
  keyText: string;
  transferId: string;
  sha256: string;
};

type DecryptedResult = {
  file: File;
  sha256: string;
};
```

- [ ] **Step 1: Birebir dönüş ve yanlış anahtar testlerini yaz**

```js
import { describe, expect, it } from "vitest";
import { decryptContainer, encryptFile } from "../crypto/encrypted-container";
import { toBase64Url } from "../protocol/base64url";

describe("BTA1 şifreli paket", () => {
  it("dosya adı, türü ve byte'ları değiştirmeden geri açar", async () => {
    const original = crypto.getRandomValues(new Uint8Array(4096));
    const file = new File([original], "dava-delili.jpg", { type: "image/jpeg" });
    const encrypted = await encryptFile(file);
    const decrypted = await decryptContainer(await encrypted.blob.arrayBuffer(), encrypted.keyText);
    expect(decrypted.file.name).toBe(file.name);
    expect(decrypted.file.type).toBe(file.type);
    expect(new Uint8Array(await decrypted.file.arrayBuffer())).toEqual(original);
    expect(decrypted.sha256).toBe(encrypted.sha256);
  });

  it("yanlış anahtarı reddeder", async () => {
    const encrypted = await encryptFile(new File(["gizli"], "delil.txt"));
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    await expect(
      decryptContainer(await encrypted.blob.arrayBuffer(), toBase64Url(wrongKey)),
    ).rejects.toThrow("Anahtar geçersiz veya paket bozuk");
  });
});
```

- [ ] **Step 2: Testi çalıştır ve şifreleme modülü olmadığı için başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/encrypted-container.test.js`

Expected: FAIL, `encrypted-container` modülü bulunamaz.

- [ ] **Step 3: BTA1 ikili biçimini uygula**

```text
4 byte  : ASCII "BTA1"
1 byte  : sürüm (1)
12 byte : AES-GCM IV
kalan   : AES-GCM ciphertext + authentication tag
```

Şifrelenmiş açık metin:

```text
4 byte metadata uzunluğu
UTF-8 JSON { name, type, size, sha256 }
özgün dosya byte'ları
```

Anahtar `crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])` ile üretilecek. Dış dosya adı belge adını sızdırmamak için `belgeaktar-<transferId>.bta` olacak.

- [ ] **Step 4: Boyut, başlık ve dosya özeti doğrulamasını ekle**

`decryptContainer` şu durumları kullanıcıya anlaşılır hata kodlarıyla reddetmeli: `INVALID_MAGIC`, `UNSUPPORTED_VERSION`, `INVALID_KEY`, `SIZE_LIMIT`, `HASH_MISMATCH`.

- [ ] **Step 5: Şifreleme testlerini çalıştır**

Run: `cmd /c npx vitest run src/__tests__/encrypted-container.test.js`

Expected: Tüm testler PASS.

- [ ] **Step 6: Değişikliği kaydet**

```bash
git add src/crypto/encrypted-container.js src/__tests__/encrypted-container.test.js
git commit -m "feat: add client-side encrypted document container"
```

---

### Task 4: Alım oturumu ve bellek sınırları

**Files:**
- Create: `src/transfer/receive-session.js`
- Create: `src/__tests__/receive-session.test.js`
- Modify: `src/ReceivePanel.jsx`

**Interfaces:**
- Consumes: `ParsedFrame`.
- Produces: `createReceiveSession()` nesnesi; `accept(frame)`, `progress()`, `assemble()` ve `reset()` metotları.

- [ ] **Step 1: Tekrar, karışık oturum ve eksik parça testlerini yaz**

```js
it("tekrarlanan kareyi bir kez sayar", () => {
  const session = createReceiveSession();
  expect(session.accept(frame({ index: 0, total: 2 }))).toEqual({ accepted: true });
  expect(session.accept(frame({ index: 0, total: 2 }))).toEqual({ accepted: false, reason: "duplicate" });
  expect(session.progress()).toEqual({ collected: 1, total: 2 });
});

it("aktif oturuma başka aktarımın karesini karıştırmaz", () => {
  const session = createReceiveSession();
  session.accept(frame({ transferId: "first", index: 0, total: 2 }));
  expect(session.accept(frame({ transferId: "second", index: 1, total: 2 })))
    .toEqual({ accepted: false, reason: "different-transfer" });
});
```

- [ ] **Step 2: Testi çalıştır ve modül olmadığı için başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/receive-session.test.js`

Expected: FAIL, `receive-session` bulunamaz.

- [ ] **Step 3: Oturum durum makinesini uygula**

Durumlar `idle`, `collecting`, `complete`, `failed` olacak. İlk geçerli kare oturumu başlatacak; farklı aktarım kimliği otomatik sıfırlama yapmayacak. Toplanan byte miktarı 50 MiB sınırını aşarsa oturum `failed` olacak.

- [ ] **Step 4: ReceivePanel içindeki `chunksRef` ve `metaRef` yönetimini yeni oturuma bağla**

`ReceivePanel` yalnızca UI durumu tutacak; kare kabulü ve birleştirme kararları `receive-session.js` içinde kalacak.

- [ ] **Step 5: Test, lint ve build çalıştır**

Run: `cmd /c npm test`

Expected: Tüm testler PASS.

Run: `cmd /c npm run lint`

Expected: Kullanılmayan `scanning` durumu ve boş catch uyarıları kaldırılmış olur.

- [ ] **Step 6: Değişikliği kaydet**

```bash
git add src/transfer/receive-session.js src/__tests__/receive-session.test.js src/ReceivePanel.jsx
git commit -m "refactor: isolate receive session state"
```

---

### Task 5: Güvenli paket kullanıcı akışı

**Files:**
- Create: `src/TransferMethodSelector.jsx`
- Create: `src/SecurePackagePanel.jsx`
- Modify: `src/App.jsx`
- Modify: `src/SendPanel.jsx`
- Modify: `src/App.css`
- Create: `src/__tests__/secure-package-ui.test.jsx`

**Interfaces:**
- Consumes: `encryptFile`, `decryptContainer`.
- Produces: Şifreli `.bta` indirme, ayrı anahtar kopyalama ve `.bta` açma akışları.

- [ ] **Step 1: Kullanıcı akışı testlerini yaz**

Testler şu davranışları doğrulamalı:

```js
expect(screen.getByText("Canlı QR")).toBeVisible();
expect(screen.getByText("Şifreli paket")).toBeVisible();
expect(screen.getByText("QR video")).toBeVisible();
expect(screen.getByText(/Anahtarı paketle aynı mesajda göndermeyin/)).toBeVisible();
```

Dosya seçildikten sonra özgün ad ve SHA-256; paket üretildikten sonra `.bta` indirme ve ayrı `Anahtarı kopyala` düğmesi görünmeli.

- [ ] **Step 2: UI testini çalıştır ve bileşenler olmadığı için başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/secure-package-ui.test.jsx`

Expected: FAIL, güvenli paket bileşenleri bulunamaz.

- [ ] **Step 3: Aktarım yöntemi seçicisini ekle**

Seçenek metinleri:

```js
const METHODS = [
  { id: "live", title: "Canlı QR", description: "Aynı ortamda, internet kullanmadan" },
  { id: "package", title: "Şifreli paket", description: "Uzak gönderim için en pratik seçenek" },
  { id: "video", title: "QR video", description: "Şifreli veriyi video kareleriyle taşıyan deneysel seçenek" },
];
```

- [ ] **Step 4: Güvenli paket üretme ve açma ekranını ekle**

Anahtar yalnızca kullanıcı açıkça `Anahtarı kopyala` düğmesine bastığında panoya yazılacak. Paket indirme işlemi anahtarı dosya adına, URL'ye veya indirme içeriğine eklemeyecek.

- [ ] **Step 5: Görsel optimizasyonu varsayılan aktarım yolundan çıkar**

`SendPanel.handleFile` doğrudan `file.arrayBuffer()` kullanacak. İsteğe bağlı küçültme daha sonra eklenirse “kopya oluşturur ve özgün dosyayı değiştirir” uyarısıyla ayrı seçim olmalı; bu plan kapsamında eklenmeyecek.

- [ ] **Step 6: UI testleri, lint ve build çalıştır**

Run: `cmd /c npm test`

Expected: Tüm testler PASS.

Run: `cmd /c npm run lint`

Expected: Hata yok.

Run: `cmd /c npm run build`

Expected: Production build başarıyla oluşur.

- [ ] **Step 7: Değişikliği kaydet**

```bash
git add src/App.jsx src/App.css src/SendPanel.jsx src/TransferMethodSelector.jsx src/SecurePackagePanel.jsx src/__tests__/secure-package-ui.test.jsx
git commit -m "feat: add encrypted package transfer flow"
```

---

### Task 6: QR-video kare planı ve video üretimi

**Files:**
- Create: `src/video/frame-schedule.js`
- Create: `src/video/create-qr-video.js`
- Create: `src/VideoTransferPanel.jsx`
- Create: `src/__tests__/frame-schedule.test.js`

**Interfaces:**
- Consumes: BTA1 `Uint8Array`, QRT3 kodlayıcı, canvas ve MediaRecorder.
- Produces: `buildFrameSchedule(frames, repeatCount): string[]`; `createQrVideo(input, options): Promise<Blob>`.

- [ ] **Step 1: Kare tekrarı ve serpiştirme testlerini yaz**

```js
it("her veri karesini üç farklı turda tekrarlar", () => {
  const schedule = buildFrameSchedule(["f0", "f1", "f2"], 3);
  expect(schedule.filter((item) => item === "f0")).toHaveLength(3);
  expect(schedule.filter((item) => item === "f1")).toHaveLength(3);
  expect(schedule.filter((item) => item === "f2")).toHaveLength(3);
  expect(schedule.slice(0, 3)).toEqual(["f0", "f1", "f2"]);
});
```

- [ ] **Step 2: Testi çalıştır ve modül olmadığı için başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/frame-schedule.test.js`

Expected: FAIL, `frame-schedule` bulunamaz.

- [ ] **Step 3: Saf kare planlayıcıyı uygula**

Varsayılanlar:

```js
export const VIDEO_OPTIONS = {
  width: 1280,
  height: 720,
  framesPerSecond: 5,
  repeatCount: 3,
  maxBytes: 2 * 1024 * 1024,
  warningBytes: 500 * 1024,
};
```

Her tekrar turu aynı kareleri farklı başlangıç noktasından göstermeli; art arda aynı karenin tekrarı yerine kayıp kümelerine dayanıklı serpiştirme yapılmalı.

- [ ] **Step 4: MediaRecorder ile akış halinde video üretimini uygula**

Desteklenen tür sırası:

```js
const candidates = [
  "video/mp4;codecs=avc1",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];
const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
```

Tarayıcı hiçbir türü desteklemiyorsa `VIDEO_UNSUPPORTED` hatası gösterilecek. Video yalnızca şifreli BTA1 byte'larından üretilecek; anahtar hiçbir QR karesine yazılmayacak.

- [ ] **Step 5: Süre tahmini ve kullanıcı uyarısını ekle**

```js
export function estimateVideoSeconds(frameCount, options = VIDEO_OPTIONS) {
  return Math.ceil((frameCount * options.repeatCount) / options.framesPerSecond);
}
```

500 KiB üzerindeki girdide tahmini süre onaydan önce gösterilecek. 2 MiB üzerindeki girdi reddedilerek kullanıcı şifreli `.bta` paketine yönlendirilecek.

- [ ] **Step 6: Test, lint ve build çalıştır**

Run: `cmd /c npm test`

Expected: Tüm saf planlama testleri PASS.

Run: `cmd /c npm run build`

Expected: MediaRecorder kodu build sırasında tarayıcı dışında çalıştırılmaz ve build başarıyla tamamlanır.

- [ ] **Step 7: Değişikliği kaydet**

```bash
git add src/video src/VideoTransferPanel.jsx src/__tests__/frame-schedule.test.js
git commit -m "feat: generate encrypted QR transfer videos"
```

---

### Task 7: Yüklenen QR videoyu çevrimdışı çözme

**Files:**
- Create: `src/video/decode-qr-video.js`
- Modify: `src/VideoTransferPanel.jsx`
- Create: `src/__tests__/video-decode-state.test.js`

**Interfaces:**
- Consumes: Kullanıcının seçtiği yerel video, `parseFrame`, `createReceiveSession`.
- Produces: `decodeQrVideo(file, callbacks, signal): Promise<Uint8Array>`.

- [ ] **Step 1: İptal, tekrar eden kare ve tamamlanma durum testlerini yaz**

```js
it("iptal sinyalinde çözümlemeyi durdurur", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(decodeQrVideo(file, callbacks, controller.signal))
    .rejects.toMatchObject({ code: "ABORTED" });
});
```

Durum testi aynı QRT3 karesi üç kez geldiğinde ilerlemenin yalnızca bir artmasını da doğrulamalı.

- [ ] **Step 2: Testi çalıştır ve decoder olmadığı için başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/video-decode-state.test.js`

Expected: FAIL, decoder bulunamaz.

- [ ] **Step 3: Yerel video çözümleme döngüsünü uygula**

Video dosyası `URL.createObjectURL` ile yerel olarak açılacak. `requestVideoFrameCallback` varsa kullanılacak; yoksa kontrollü `currentTime` ilerletme uygulanacak. Her kare canvas'a çizilecek ve mevcut QR çözücüye verilecek. İşlem bittiğinde object URL mutlaka `URL.revokeObjectURL` ile bırakılacak.

- [ ] **Step 4: Şifreli paketi anahtarla açma adımını bağla**

Video tamamlandığında elde edilen BTA1 paketi otomatik açılmayacak. Kullanıcıdan ayrı anahtar istenecek; başarılı açılıştan sonra dosya adı, boyut ve SHA-256 gösterilecek ve kullanıcı açıkça `Özgün dosyayı indir` diyecek.

- [ ] **Step 5: Eksik kare raporunu ekle**

Video bittiği halde aktarım tamamlanmadıysa kullanıcıya `Eksik kare: 18 / 742` gibi kesin sayı gösterilecek. Otomatik olarak bozuk dosya üretme veya kısmi indirme yapılmayacak.

- [ ] **Step 6: Test, lint ve build çalıştır**

Run: `cmd /c npm test`

Expected: Tüm testler PASS.

Run: `cmd /c npm run lint`

Expected: Hata yok.

Run: `cmd /c npm run build`

Expected: Production build başarıyla oluşur.

- [ ] **Step 7: Değişikliği kaydet**

```bash
git add src/video/decode-qr-video.js src/VideoTransferPanel.jsx src/__tests__/video-decode-state.test.js
git commit -m "feat: decode encrypted QR videos locally"
```

---

### Task 8: Kamera çözümlemesini ana arayüzden ayırma

**Files:**
- Create: `src/workers/qr-decode.worker.js`
- Create: `src/hooks/useCameraScanner.js`
- Modify: `src/ReceivePanel.jsx`
- Create: `src/__tests__/camera-scanner.test.jsx`

**Interfaces:**
- Consumes: Kamera `MediaStream`, QRT kare metni.
- Produces: `useCameraScanner({ onDecoded, enabled, facingMode })`.

- [ ] **Step 1: Kamera kapatma ve yeniden başlatma testlerini yaz**

Test; bileşen kaldırıldığında bütün `MediaStreamTrack.stop()` çağrılarının yapıldığını, kamera değişiminde eski akışın kapandığını ve aynı anda iki tarama zamanlayıcısı oluşmadığını doğrulamalı.

- [ ] **Step 2: Testi çalıştır ve hook olmadığı için başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/camera-scanner.test.jsx`

Expected: FAIL, `useCameraScanner` bulunamaz.

- [ ] **Step 3: Kamera yaşam döngüsünü hook'a taşı**

Hook kamera iznini, ön/arka kamera değişimini, iptal durumunu ve track temizliğini yönetecek. `ReceivePanel` doğrudan `setTimeout`, `getUserMedia` veya stream ref tutmayacak.

- [ ] **Step 4: jsQR fallback çözümlemesini Worker'a taşı**

Ana thread `ImageBitmap` gönderecek; worker yalnızca `{ type: "decoded", text }` veya `{ type: "empty" }` mesajı döndürecek. Aynı anda en fazla bir kare işlenecek; önceki kare çözülmeden yenisi sıraya alınmayacak.

- [ ] **Step 5: BarcodeDetector hızlı yolunu koru**

Tarayıcı `BarcodeDetector` destekliyorsa önce bu yol kullanılacak. Başarısızlık veya destek yokluğunda worker içindeki jsQR devreye girecek; hata sessizce yutulmayacak, yalnızca kullanıcıyı ilgilendiren kalıcı hata ekranda gösterilecek.

- [ ] **Step 6: Test, lint ve build çalıştır**

Run: `cmd /c npm test`

Expected: Tüm testler PASS.

Run: `cmd /c npm run lint`

Expected: React hook bağımlılığı uyarısı kalmaz.

Run: `cmd /c npm run build`

Expected: Worker ayrı asset olarak build edilir.

- [ ] **Step 7: Değişikliği kaydet**

```bash
git add src/workers/qr-decode.worker.js src/hooks/useCameraScanner.js src/ReceivePanel.jsx src/__tests__/camera-scanner.test.jsx
git commit -m "perf: move QR decoding off the UI thread"
```

---

### Task 9: Uçtan uca doğrulama, gizlilik metni ve kullanım belgesi

**Files:**
- Modify: `README.md`
- Create: `docs/SECURITY.md`
- Create: `src/__tests__/transfer-roundtrip.test.js`

**Interfaces:**
- Consumes: BTA1, QRT3 ve receive-session genel arayüzleri.
- Produces: Tam şifrele-karele-birleştir-aç testi ve kullanıcıya açık tehdit modeli.

- [ ] **Step 1: Uçtan uca byte eşitliği testini yaz**

```js
it("şifreleme ve QR aktarımı sonunda özgün byte'ları verir", async () => {
  const original = crypto.getRandomValues(new Uint8Array(32 * 1024));
  const file = new File([original], "örnek-delil.pdf", { type: "application/pdf" });
  const encrypted = await encryptFile(file);
  const encoded = await encodeFramesV3({
    bytes: new Uint8Array(await encrypted.blob.arrayBuffer()),
    transferId: encrypted.transferId,
  });
  const session = createReceiveSession();
  [...encoded.frames].reverse().forEach((text) => session.accept(parseFrame(text)));
  const decrypted = await decryptContainer(session.assemble(), encrypted.keyText);
  expect(new Uint8Array(await decrypted.file.arrayBuffer())).toEqual(original);
  expect(decrypted.sha256).toBe(encrypted.sha256);
});
```

- [ ] **Step 2: Testi çalıştır ve bütün bağlantılar tamamlanana kadar başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/transfer-roundtrip.test.js`

Expected: İlk çalıştırmada eksik dışa aktarım veya tür uyumsuzluğu nedeniyle FAIL; entegrasyon düzeltmelerinden sonra PASS.

- [ ] **Step 3: README'yi gerçek protokolle güncelle**

README; QRT3, 450 byte varsayılanı, üç aktarım yöntemi, HTTPS kamera gereksinimi, boyut sınırları ve “video yerine dosya eki” tavsiyesini anlatmalı. Bozuk görünen Türkçe karakterler UTF-8 olarak düzeltilmeli.

- [ ] **Step 4: Tehdit modelini yaz**

`docs/SECURITY.md` şu sınırları açıkça belirtmeli:

- Şifreli paket içeriği ve dosya adı anahtar olmadan okunamaz.
- Dosya/video ile anahtar aynı kanalda paylaşılırsa koruma zayıflar.
- Mesajlaşma platformu iletişimin zamanı, tarafları ve çıktı boyutu gibi üst verileri görebilir.
- Ele geçirilmiş telefon veya PC'ye karşı bu yöntem koruma sağlamaz.
- SHA-256 eşitliği dosyanın değişmediğini kontrol eder; tek başına delilin kaynağını veya hukuki kabulünü ispatlamaz.
- Uygulama başarı garantisi vermeden önce alıcıdaki SHA-256 değerini göndericideki değerle karşılaştırmalıdır.

- [ ] **Step 5: Tam doğrulama paketini çalıştır**

Run: `cmd /c npm test`

Expected: Tüm testler PASS.

Run: `cmd /c npm run lint`

Expected: Hata ve uyarı yok.

Run: `cmd /c npm run build`

Expected: Production build başarıyla oluşur.

- [ ] **Step 6: Gerçek cihaz kabul kontrollerini uygula**

Manuel matris:

| Senaryo | Beklenen sonuç |
|---|---|
| Windows Chrome → Android Chrome canlı QR | Dosya SHA-256 eşleşir |
| Android Chrome → Windows Chrome canlı QR | Dosya SHA-256 eşleşir |
| `.bta` paketi gönder/al | Yanlış anahtar reddedilir, doğru anahtar özgün dosyayı verir |
| WhatsApp/Slack üzerinden dosya eki olarak `.bta` | Paket byte'ları değişmeden açılır |
| QR video dosya eki olarak | Tüm kareler toplanır ve SHA-256 eşleşir |
| Platform tarafından sıkıştırılmış QR video | Ya başarıyla tamamlanır ya da kesin eksik kare uyarısı verir; bozuk belge üretmez |
| Kamera izni reddi | Kullanıcıya çözüm öneren Türkçe hata gösterilir |
| 2 MiB üzeri QR-video girdisi | Şifreli paket yöntemine yönlendirilir |
| 50 MiB üzeri genel girdi | İşlem başlamadan reddedilir |

- [ ] **Step 7: Son değişikliği kaydet**

```bash
git add README.md docs/SECURITY.md src/__tests__/transfer-roundtrip.test.js
git commit -m "docs: document secure transfer guarantees and limits"
```

---

## Teslim Sırası ve Karar Kapıları

1. **Güvenilir temel:** Task 1–4 tamamlanmadan yeni aktarım yöntemi yayınlanmayacak.
2. **Pratik uzak aktarım:** Task 5 tamamlandığında şifreli `.bta` paket modu kullanılabilir ilk sürüm olacak.
3. **Deneysel video:** Task 6–7 yalnızca `.bta` modu gerçek cihazlarda doğrulandıktan sonra etkinleştirilecek.
4. **Performans:** Task 8 canlı kamera akışının donma ve bellek sorunlarını azaltacak.
5. **Yayın kapısı:** Task 9'daki otomatik testler ve gerçek cihaz matrisi geçmeden “hukuki belgeler için güvenli” ifadesi kullanılmayacak.

## Kapsam Dışı

- Uygulama backend'i, TURN/STUN veya WebRTC aktarımı.
- Kullanıcı hesabı, bulut geçmişi veya dosya saklama.
- Elektronik imza ve zaman damgası.
- Delilin hukuki kabulüne dair garanti.
- Dosya/video ile anahtarı otomatik olarak aynı mesajlaşma uygulamasına gönderme.
