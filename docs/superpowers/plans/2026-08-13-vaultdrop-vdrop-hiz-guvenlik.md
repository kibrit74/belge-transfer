# VaultDrop `.vdrop` Hız ve Güvenlik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yeni paketleri `.vdrop` uzantısıyla, tek hazırlık geçişinde, arayüzü dondurmadan ve mevcut BTA1/BTA2 güvenlik kontrollerini koruyarak üretmek.

**Architecture:** Kullanıcı arayüzü yalnız dosya seçimi ve durum gösteriminden sorumlu olacak. ZIP, SHA-256, akıllı sıkıştırma ve AES-256-GCM hazırlığı `buildVaultDropPackage()` sınırında toplanacak; üretimde bu sınır özel worker üzerinden çağrılacak. Yeni `.vdrop` dosyaları içeride BTA2 biçimini kullanacak, eski `.bta` BTA1/BTA2 paketleri aynı çözücüyle açılacak.

**Tech Stack:** React 19, Web Crypto API, Web Workers, `fflate`, Vitest, Testing Library

## Global Constraints

- Yeni çıktı adı tam olarak `vaultdrop-<12 karakter aktarım kimliği>.vdrop` biçiminde olmalı.
- Alıcı `.vdrop` ve `.bta` dosyalarını süresiz açmalı.
- Yeni üretim BTA2 kullanmalı; BTA1 yalnız okuma uyumluluğu olarak kalmalı.
- Şifreleme AES-256-GCM, anahtar 256 bit ve IV 96 bit olmalı.
- Paket, anahtar, dosya adı ve içerik VaultDrop sunucusuna gönderilmemeli.
- Üye sınırı en fazla 15 dosya ve toplam 50 MiB; misafir sınırı tek dosya ve toplam 10 MiB olarak korunmalı.
- Anahtar URL’ye, dosya adına, etkinlik kaydına veya ağ isteğine eklenmemeli.
- Açılan dosya doğrulanmadan indirme bağlantısı üretilmemeli ve otomatik çalıştırılmamalı.
- Yeni bağımlılık eklenmemeli.
- Kullanıcı metinleri ve kaynak dosyaları UTF-8 olmalı.
- Çalışma dizini Git deposu değildir. `git init` çalıştırılmayacak; görev sonlarında commit yerine test çıktısı kontrol noktası olarak kaydedilecek.

---

### Task 1: `.vdrop` kullanıcı sözleşmesi ve `.bta` geriye uyumluluğu

**Files:**
- Modify: `src/SecurePackagePanel.jsx:198-213,235-264,286-303,418-482`
- Modify: `src/pages/SecureLinkReceivePage.jsx:10-15`
- Modify: `src/crypto/encrypted-container.js:33-40,134-139`
- Modify: `src/__tests__/secure-package-ui.test.jsx`
- Modify: `src/__tests__/encrypted-container.test.js`
- Modify: `src/__tests__/secure-link-receive-page.test.jsx`

**Interfaces:**
- Consumes: `encryptFile(file)` ve `decryptContainer(buffer, keyText)` mevcut davranışları
- Produces: Kullanıcıya görünen `.vdrop` adlandırması; `.vdrop,.bta` dosya seçimi; değişmeyen BTA1/BTA2 iç okuma sözleşmesi

- [ ] **Step 1: Yeni uzantı ve eski paket kabulü için başarısız UI testlerini yaz**

```jsx
it("yeni paketi .vdrop adıyla indirir ve iki uzantıyı da kabul eder", async () => {
  render(<SecurePackagePanel view="both" />);
  const openInput = screen.getByLabelText("VaultDrop paket dosyası");
  expect(openInput).toHaveAttribute(
    "accept",
    ".vdrop,.bta,application/vnd.vaultdrop.package,application/x-belgeaktar",
  );

  fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
    target: { files: [new File(["örnek"], "örnek.txt", { type: "text/plain" })] },
  });
  await screen.findByText(/Hazır!/);
  fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

  const link = await screen.findByRole("link", { name: "VaultDrop paketini indir" });
  expect(link.getAttribute("download")).toMatch(/^vaultdrop-[A-Za-z0-9]{12}\.vdrop$/);
});
```

- [ ] **Step 2: Hedefli testi çalıştır ve eski `.bta` metin beklentileri nedeniyle kırıldığını doğrula**

Run: `npm test -- src/__tests__/secure-package-ui.test.jsx src/__tests__/secure-link-receive-page.test.jsx`

Expected: FAIL; “VaultDrop paket dosyası” alanı ve `.vdrop` indirme adı henüz bulunmamalı.

- [ ] **Step 3: Yalnız kullanıcıya görünen adlandırmayı değiştir**

```js
const VAULTDROP_MIME = "application/vnd.vaultdrop.package";

function createVaultDropDownloadName(transferId) {
  return `vaultdrop-${transferId}.vdrop`;
}
```

`SecurePackagePanel` içinde şu tam metinler kullanılacak:

```jsx
<h2 id="create-package-title">VaultDrop paketi hazırla</h2>
<button type="button" className="btn-solid">
  {isCreating ? "Hazırlanıyor..." : "VaultDrop paketi oluştur"}
</button>
<li>1. `.vdrop` paketini gönder</li>
<li>2. Anahtarı farklı bir kanaldan gönder</li>
<a className="btn-solid" href={packageUrl} download={packageResult.downloadName}>
  VaultDrop paketini indir
</a>
```

Dosya seçicisi:

```jsx
<input
  aria-label="VaultDrop paket dosyası"
  type="file"
  accept=".vdrop,.bta,application/vnd.vaultdrop.package,application/x-belgeaktar"
  onChange={handleContainerFile}
/>
```

`encryptBytes()` tarafından oluşturulan Blob türü `application/vnd.vaultdrop.package` olacak. BTA sihirli başlığı ve sürüm baytları değişmeyecek.

- [ ] **Step 4: Dondurulmuş `.bta` örneğini hem `.bta` hem `.vdrop` adıyla açma testini ekle**

```js
const frozenBta1Base64Url =
  "QlRBMQEgISIjJCUmJygpKivSOqYCF7p0b3cZYPTjdJGesSqVseHpG5oZhAk8PfIqK1mskX3-QBfgNokL6iwmb6SDQ4Ksth5eCLQHXSd9iyb_q06sOaOhx6ypOtBCiDhXI5PVUVTBv7ZxnyqzE1Qs1LJlG3EUvwXosvD-8TPpoKF0Pdf_LbOj7VkRwydjkODjS0XEG_dDmnbDABtkfdQQ73yBhENvXsYuGtk";
const frozenBta1Key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

it.each(["gecmis-paket.bta", "gecmis-paket.vdrop"])(
  "%s adı BTA1 fixture içeriğini değiştirmeden açar",
  async (name) => {
    const bytes = fromBase64Url(frozenBta1Base64Url);
    const file = new File([bytes], name, { type: "application/octet-stream" });
    const opened = await decryptContainer(await file.arrayBuffer(), frozenBta1Key);
    expect(opened.file.name).toBe("legacy-fixture.txt");
    expect(await opened.file.text()).toBe("BTA1 legacy fixture");
  },
);
```

- [ ] **Step 5: Task 1 testlerini çalıştır**

Run: `npm test -- src/__tests__/secure-package-ui.test.jsx src/__tests__/encrypted-container.test.js src/__tests__/secure-link-receive-page.test.jsx`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

Değişen dosyaları ve geçen test sayılarını uygulama notuna kaydet. Git başlatma veya commit yapma.

---

### Task 2: Genel amaçlı akıllı sıkıştırma ve BTA2 üretimi

**Files:**
- Modify: `src/transfer/payload-compression.js`
- Modify: `src/crypto/encrypted-container.js:82-100,218-253,267-290`
- Modify: `src/__tests__/payload-compression.test.js`
- Modify: `src/__tests__/encrypted-container.test.js`

**Interfaces:**
- Consumes: `sha256Base64Url(bytes)`
- Produces: `prepareTransferPayload(bytes, options)` ve `restoreTransferPayload(storedBytes, metadata)`

`prepareTransferPayload` kesin dönüş biçimi:

```js
{
  storedBytes: Uint8Array,
  compression: "none" | "zlib",
  originalSize: number,
  storedSize: number,
  originalSha256: string,
  storedSha256: string,
  savedBytes: number,
  savedPercent: number,
}
```

- [ ] **Step 1: Boyut, MIME atlama ve tasarruf eşiği testlerini yaz**

```js
it.each([
  ["image/jpeg", "foto.jpg"],
  ["image/png", "foto.png"],
  ["video/mp4", "video.mp4"],
  ["application/zip", "arsiv.zip"],
])("%s içeriğinde zlib denemesini atlar", async (mimeType, fileName) => {
  const bytes = new Uint8Array(1024).fill(65);
  const result = await prepareTransferPayload(bytes, { mimeType, fileName });
  expect(result.compression).toBe("none");
  expect(result.storedBytes).toEqual(bytes);
});

it("50 MiB + 64 KiB kapsayıcı sınırını kabul eder", async () => {
  const bytes = new Uint8Array(50 * 1024 * 1024 + 64 * 1024);
  await expect(
    prepareTransferPayload(bytes, { mimeType: "application/octet-stream", skipCompression: true }),
  ).resolves.toMatchObject({ originalSize: bytes.length });
});
```

- [ ] **Step 2: Testi çalıştır ve mevcut 15 MiB renkli sınırında kırıldığını doğrula**

Run: `npm test -- src/__tests__/payload-compression.test.js`

Expected: FAIL; mevcut `MAX_COLOR_INPUT_BYTES` ve seçenek almayan imza yeni sözleşmeyi karşılamamalı.

- [ ] **Step 3: Sınırı genelleştir ve sıkıştırma adayını açıkça seç**

```js
export const MAX_TRANSFER_PAYLOAD_BYTES = (50 * 1024 * 1024) + (64 * 1024);

const ALREADY_COMPRESSED_MIME_PREFIXES = ["image/jpeg", "image/png", "video/"];
const ALREADY_COMPRESSED_MIME_TYPES = new Set([
  "application/zip",
  "application/gzip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
]);
const ALREADY_COMPRESSED_EXTENSIONS = /\.(?:jpe?g|png|gif|webp|heic|mp4|m4v|mov|webm|mkv|zip|gz|7z|rar)$/i;

export function shouldAttemptCompression({ mimeType = "", fileName = "" } = {}) {
  const normalizedMime = String(mimeType).toLowerCase();
  if (ALREADY_COMPRESSED_MIME_TYPES.has(normalizedMime)) return false;
  if (ALREADY_COMPRESSED_MIME_PREFIXES.some((value) => normalizedMime.startsWith(value))) return false;
  return !ALREADY_COMPRESSED_EXTENSIONS.test(String(fileName));
}

export async function prepareTransferPayload(bytes, options = {}) {
  assertPayload(bytes);
  const originalSha256 = await sha256Base64Url(bytes);
  const attemptCompression = !options.skipCompression && shouldAttemptCompression(options);
  let compressed = null;
  if (attemptCompression) {
    try {
      compressed = zlibSync(bytes, { level: 6 });
    } catch {
      compressed = null;
    }
  }
  const savedBytes = compressed ? bytes.length - compressed.length : 0;
  const useCompressed = Boolean(
    compressed && savedBytes >= 32 && savedBytes / Math.max(1, bytes.length) >= 0.05,
  );
  const storedBytes = useCompressed ? compressed : new Uint8Array(bytes);
  return {
    storedBytes,
    compression: useCompressed ? "zlib" : "none",
    originalSize: bytes.length,
    storedSize: storedBytes.length,
    originalSha256,
    storedSha256: await sha256Base64Url(storedBytes),
    savedBytes: useCompressed ? savedBytes : 0,
    savedPercent: useCompressed
      ? Math.round((savedBytes / Math.max(1, bytes.length)) * 100)
      : 0,
  };
}
```

- [ ] **Step 4: `encryptPreparedFile()` ile üretilen paketin gerçekten BTA2 olduğunu test et**

```js
it("hazırlanmış payload yeni üretimde BTA2 sürümünü kullanır", async () => {
  const file = new File(["tekrarlı ".repeat(500)], "not.txt", { type: "text/plain" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const prepared = await prepareTransferPayload(bytes, {
    fileName: file.name,
    mimeType: file.type,
  });
  const encrypted = await encryptPreparedFile(file, prepared);
  const container = new Uint8Array(await encrypted.blob.arrayBuffer());
  expect(container[4]).toBe(2);
  const opened = await decryptContainer(container, encrypted.keyText);
  expect(await opened.file.text()).toBe(await file.text());
});
```

- [ ] **Step 5: Sıkıştırma ve kapsayıcı testlerini çalıştır**

Run: `npm test -- src/__tests__/payload-compression.test.js src/__tests__/encrypted-container.test.js`

Expected: PASS; BTA1 fixture testi de geçmeye devam etmeli.

- [ ] **Step 6: Kontrol noktası oluştur**

Sınır, atlanan MIME türleri ve BTA2 test sonucunu uygulama notuna kaydet.

---

### Task 3: Tek geçişli VaultDrop paket kurucusu

**Files:**
- Create: `src/transfer/build-vaultdrop-package.js`
- Modify: `src/transfer/batch-files.js:36-53`
- Create: `src/__tests__/build-vaultdrop-package.test.js`
- Modify: `src/__tests__/batch-files.test.js`

**Interfaces:**
- Consumes: `prepareTransferFile(files)`, `prepareTransferPayload(bytes, options)`, `encryptPreparedFile(file, prepared)`
- Produces:

```js
buildVaultDropPackage(files, { onProgress } = {}) => Promise<{
  blob: Blob,
  keyText: string,
  transferId: string,
  sha256: string,
  compression: "none" | "zlib",
  originalSize: number,
  storedSize: number,
  savedPercent: number,
}>
```

- [ ] **Step 1: Tek dosyanın bir kez okunduğunu ve aşamaların sıralı geldiğini test et**

```js
it("tek dosyayı bir kez okuyup BTA2 üretir", async () => {
  let reads = 0;
  const file = new File(["A".repeat(8192)], "rapor.txt", { type: "text/plain" });
  const originalArrayBuffer = file.arrayBuffer.bind(file);
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => {
      reads += 1;
      return originalArrayBuffer();
    },
  });
  const stages = [];

  const result = await buildVaultDropPackage([file], {
    onProgress: (event) => stages.push(event.stage),
  });

  expect(reads).toBe(1);
  expect(stages).toEqual(["archive", "read", "compress", "encrypt", "complete"]);
  expect(result.blob).toBeInstanceOf(Blob);
  expect(result.keyText).toMatch(/^[A-Za-z0-9_-]{43}$/);
});
```

- [ ] **Step 2: Testi çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/build-vaultdrop-package.test.js`

Expected: FAIL with module resolution error for `build-vaultdrop-package.js`.

- [ ] **Step 3: Paket kurucusunu tek sorumluluklu işlev olarak ekle**

```js
import { encryptPreparedFile } from "../crypto/encrypted-container.js";
import { readFileAsArrayBuffer } from "../protocol/hash.js";
import { prepareTransferFile, validateBatchFiles } from "./batch-files.js";
import { prepareTransferPayload } from "./payload-compression.js";

export async function buildVaultDropPackage(files, { onProgress = () => {} } = {}) {
  const normalized = validateBatchFiles(files);
  onProgress({ stage: "archive", percent: 5 });
  const sourceFile = await prepareTransferFile(normalized);
  onProgress({ stage: "read", percent: 20 });
  const bytes = new Uint8Array(await readFileAsArrayBuffer(sourceFile));
  onProgress({ stage: "compress", percent: 35 });
  const prepared = await prepareTransferPayload(bytes, {
    fileName: sourceFile.name,
    mimeType: sourceFile.type,
  });
  onProgress({ stage: "encrypt", percent: 70 });
  const encrypted = await encryptPreparedFile(sourceFile, prepared);
  onProgress({ stage: "complete", percent: 100 });
  return {
    ...encrypted,
    compression: prepared.compression,
    originalSize: prepared.originalSize,
    storedSize: prepared.storedSize,
    savedPercent: prepared.savedPercent,
  };
}
```

- [ ] **Step 4: Çoklu dosyanın güvenli ZIP adlarını koruduğunu test et**

```js
it("çoklu dosyayı güvenli ZIP olarak tek kez paketler", async () => {
  const result = await buildVaultDropPackage([
    new File(["a"], "../a.txt", { type: "text/plain" }),
    new File(["b"], "..\\a.txt", { type: "text/plain" }),
  ]);
  const opened = await decryptContainer(await result.blob.arrayBuffer(), result.keyText);
  expect(opened.file.type).toBe("application/zip");
  expect(opened.file.name).toMatch(/^toplu-aktarim-\d{8}-\d{4}\.zip$/);
});
```

- [ ] **Step 5: Task 3 testlerini çalıştır**

Run: `npm test -- src/__tests__/build-vaultdrop-package.test.js src/__tests__/batch-files.test.js src/__tests__/encrypted-container.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

Tek okuma sayacı, aşama sırası ve çoklu ZIP sonucunu uygulama notuna kaydet.

---

### Task 4: İptal edilebilir VaultDrop worker istemcisi

**Files:**
- Create: `src/workers/vaultdrop-package.worker.js`
- Create: `src/workers/vaultdrop-package-client.js`
- Create: `src/__tests__/vaultdrop-package-worker.test.js`

**Interfaces:**
- Consumes: `buildVaultDropPackage(files, { onProgress })`
- Produces:

```js
createVaultDropPackageClient({ workerFactory } = {}) => {
  create(files, { signal, onProgress } = {}): Promise<VaultDropPackageResult>,
  close(): void,
}
```

Worker mesajları:

```js
{ type: "create", id: number, files: File[] }
{ type: "progress", id: number, progress: { stage: string, percent: number } }
{ type: "complete", id: number, result: VaultDropPackageResult }
{ type: "error", id: number, error: { code: string, message: string } }
```

- [ ] **Step 1: İlerleme, başarı, abort ve geç cevap testlerini yaz**

```js
it("abort sırasında workerı sonlandırır ve geç sonucu yayımlamaz", async () => {
  const worker = fakeWorker();
  const client = createVaultDropPackageClient({ workerFactory: () => worker });
  const controller = new AbortController();
  const progress = [];
  const promise = client.create([new File(["x"], "x.txt")], {
    signal: controller.signal,
    onProgress: (value) => progress.push(value),
  });

  controller.abort();
  worker.emit({ type: "complete", id: 1, result: { blob: new Blob() } });

  await expect(promise).rejects.toMatchObject({ code: "ABORTED" });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(progress).toEqual([]);
});
```

- [ ] **Step 2: Testi çalıştır ve istemci bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/vaultdrop-package-worker.test.js`

Expected: FAIL with module resolution error.

- [ ] **Step 3: Worker girişini ekle**

```js
import { buildVaultDropPackage } from "../transfer/build-vaultdrop-package.js";

self.onmessage = async (event) => {
  const { type, id, files } = event.data ?? {};
  if (type !== "create" || !Number.isSafeInteger(id) || !Array.isArray(files)) return;
  try {
    const result = await buildVaultDropPackage(files, {
      onProgress: (progress) => self.postMessage({ type: "progress", id, progress }),
    });
    self.postMessage({ type: "complete", id, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      error: {
        code: error?.code ?? "PACKAGE_FAILED",
        message: error instanceof Error ? error.message : "VaultDrop paketi oluşturulamadı.",
      },
    });
  }
};
```

- [ ] **Step 4: İstemciyi sahiplik ve nesil kontrolüyle ekle**

İstemci her `create()` için yeni worker oluşturacak. Abort veya `close()` aktif workerı sonlandıracak, isteği `ABORTED`/`CLOSED` koduyla reddedecek ve aynı `id` için sonradan gelen mesajı yok sayacak. İstemci tarafından oluşturulan worker sonlandırılacak; testte dışarıdan verilen canlı worker örneği değil, `workerFactory` tarafından her iş için döndürülen örnek o işe ait kabul edilecek.

```js
function createClientError(code, message) {
  const error = new Error(message);
  error.name = "VaultDropPackageClientError";
  error.code = code;
  return error;
}

function defaultWorkerFactory() {
  if (typeof Worker !== "function") {
    throw createClientError("WORKER_UNSUPPORTED", "Bu tarayıcı arka plan paket hazırlığını desteklemiyor.");
  }
  return new Worker(new URL("./vaultdrop-package.worker.js", import.meta.url), { type: "module" });
}
```

- [ ] **Step 5: Task 4 testlerini çalıştır**

Run: `npm test -- src/__tests__/vaultdrop-package-worker.test.js src/__tests__/build-vaultdrop-package.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

Abort, close, stale response ve worker terminate çağrı sayılarını uygulama notuna kaydet.

---

### Task 5: `SecurePackagePanel` worker entegrasyonu ve tek hazırlık akışı

**Files:**
- Modify: `src/SecurePackagePanel.jsx:40-233,328-458`
- Modify: `src/__tests__/secure-package-ui.test.jsx`

**Interfaces:**
- Consumes: `createVaultDropPackageClient().create(files, { signal, onProgress })`
- Produces: Dosya seçiminde ağır iş yapmayan, oluştur düğmesinde worker kullanan ve gerçek aşama gösteren UI

- [ ] **Step 1: Seçimde dosya okunmaması ve oluştururken aşama gösterilmesi testlerini yaz**

```jsx
it("dosya seçiminde içeriği okumaz; oluştururken worker sonucunu kullanır", async () => {
  let finishCreate;
  const create = vi.fn().mockImplementation((_files, { onProgress }) => {
    onProgress({ stage: "archive", percent: 5 });
    onProgress({ stage: "encrypt", percent: 70 });
    return new Promise((resolve) => {
      finishCreate = () => resolve({
        blob: new Blob(["BTA2"]),
        keyText: "A".repeat(43),
        transferId: "Ab12Cd34Ef56",
        sha256: "B".repeat(43),
        compression: "zlib",
        originalSize: 8192,
        storedSize: 256,
        savedPercent: 97,
      });
    });
  });
  const client = { create, close: vi.fn() };
  const file = new File(["A".repeat(8192)], "rapor.txt", { type: "text/plain" });
  const readSpy = vi.spyOn(file, "arrayBuffer");

  render(<SecurePackagePanel view="create" packageClient={client} />);
  fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
    target: { files: [file] },
  });
  expect(readSpy).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
  expect(await screen.findByText("Şifreleniyor")).toBeInTheDocument();
  finishCreate();
  expect(await screen.findByText(/%97 daha küçük/)).toBeInTheDocument();
  expect(create).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Testi çalıştır ve mevcut seçim sırasında ZIP/SHA hazırlanması nedeniyle kırıldığını doğrula**

Run: `npm test -- src/__tests__/secure-package-ui.test.jsx`

Expected: FAIL; `packageClient` kullanılmamalı ve seçim sırasında dosya okunmalı.

- [ ] **Step 3: Seçim akışını yalnız doğrulama ve metadata gösterimine indir**

`sourceFile`, `sourceSha` ve `isShaCalculating` seçim durumu kaldırılacak. `selectSourceFiles()` yalnız `validateTransferSelection()` ve `validateBatchFiles()` çağıracak, seçimi saklayacak ve eski işi abort edecek.

```js
const STAGE_LABELS = {
  archive: "Dosyalar hazırlanıyor",
  read: "Dosya okunuyor",
  compress: "Akıllı sıkıştırma uygulanıyor",
  encrypt: "Şifreleniyor",
  complete: "Paket hazır",
};
```

- [ ] **Step 4: Oluşturma akışını worker istemcisine bağla**

```js
const controller = new AbortController();
createAbortRef.current = controller;
const encrypted = await packageClientRef.current.create(sourceFiles, {
  signal: controller.signal,
  onProgress: ({ stage, percent }) => {
    if (!mountedRef.current || createVersionRef.current !== version) return;
    setCreateProgress({ stage, percent, label: STAGE_LABELS[stage] });
  },
});
const downloadName = `vaultdrop-${encrypted.transferId}.vdrop`;
```

Dosya değişimi, yeni oluşturma, panel kapanışı ve açık iptal düğmesi `createAbortRef.current?.abort()` çağıracak. `finally` yalnız güncel nesil için `isCreating=false` yapacak.

- [ ] **Step 5: Kota kesinleştirme sırasını koru**

Rezervasyon worker başlamadan alınacak. Başarı yalnız worker sonucu elde edilip güncel nesil doğrulandıktan sonra kesinleştirilecek. Abort veya hata `status: "failed"` ile rezervasyonu bırakacak. Paket URL’si ve otomatik indirme, başarılı kesinleştirme güvenceye alındıktan sonra oluşturulacak.

- [ ] **Step 6: UI ve kota regresyonlarını çalıştır**

Run: `npm test -- src/__tests__/secure-package-ui.test.jsx src/__tests__/activity-client.test.js src/__tests__/finalization-outbox.test.js src/__tests__/usage-policy.test.js`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

Dosya seçimindeki okuma sayısını, görünen aşamaları, abort ve kota bırakma sonuçlarını uygulama notuna kaydet.

---

### Task 6: Güvenli indirme adı ve paket açma sertleştirmesi

**Files:**
- Create: `src/transfer/safe-download-name.js`
- Modify: `src/crypto/encrypted-container.js:196-253,355-405`
- Modify: `src/SecurePackagePanel.jsx:276-310,521-535`
- Create: `src/__tests__/safe-download-name.test.js`
- Modify: `src/__tests__/encrypted-container.test.js`

**Interfaces:**
- Produces: `sanitizeDownloadName(name, fallback = "dosya") => string`
- Consumes: BTA1/BTA2 metadata içindeki `name`

- [ ] **Step 1: Yol, kontrol karakteri ve Windows ayrılmış ad testlerini yaz**

```js
it.each([
  ["../gizli.txt", "gizli.txt"],
  ["..\\gizli.txt", "gizli.txt"],
  ["CON", "dosya"],
  ["aux.pdf", "dosya.pdf"],
  ["rapor. ", "rapor"],
  ["a\u0000b.txt", "ab.txt"],
])("%s adını %s olarak güvenli hale getirir", (input, expected) => {
  expect(sanitizeDownloadName(input)).toBe(expected);
});
```

- [ ] **Step 2: Testi çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/safe-download-name.test.js`

Expected: FAIL with module resolution error.

- [ ] **Step 3: Güvenli ad işlevini ekle**

```js
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizeDownloadName(name, fallback = "dosya") {
  const source = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .at(-1) ?? "";
  const cleaned = source.replace(/[. ]+$/g, "").trim();
  if (!cleaned) return fallback;
  if (!WINDOWS_RESERVED.test(cleaned)) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  return dot > 0 ? `${fallback}${cleaned.slice(dot)}` : fallback;
}
```

- [ ] **Step 4: BTA1 ve BTA2 açma sonuçlarında güvenli adı kullan**

`openVersion1()` ve `openVersion2()` içindeki `new File()` çağrıları metadata adını doğrudan kullanmayacak:

```js
const safeName = sanitizeDownloadName(metadata.name);
return {
  file: new File([originalBytes], safeName, { type: metadata.type }),
  sha256: metadata.originalSha256,
  compression: metadata.compression,
};
```

- [ ] **Step 5: Bozuk paketlerin hiçbir indirme bağlantısı üretmediğini test et**

```jsx
it("yanlış anahtar ve değiştirilmiş pakette indirme bağlantısı oluşturmaz", async () => {
  render(<SecurePackagePanel view="open" />);
  fireEvent.change(screen.getByLabelText("VaultDrop paket dosyası"), {
    target: { files: [new File(["bozuk"], "bozuk.vdrop")] },
  });
  fireEvent.change(screen.getByLabelText("Paket anahtarı"), {
    target: { value: "A".repeat(43) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Paketi çöz" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/geçersiz|bozuk/i);
  expect(screen.queryByRole("link", { name: "Özgün dosyayı indir" })).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Task 6 testlerini çalıştır**

Run: `npm test -- src/__tests__/safe-download-name.test.js src/__tests__/encrypted-container.test.js src/__tests__/secure-package-ui.test.jsx`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

Dosya adı örneklerini ve yanlış anahtar/değiştirilmiş paket sonuçlarını uygulama notuna kaydet.

---

### Task 7: Ağ izolasyonu, belge güncellemesi ve VaultDrop kabul kapısı

**Files:**
- Create: `src/__tests__/vaultdrop-network-isolation.test.jsx`
- Modify: `src/__tests__/docs-security-contract.test.js`
- Modify: `src/__tests__/readme-limits.test.js`
- Modify: `src/__tests__/readme-threat-model.test.js`
- Modify: `README.md`
- Modify: `docs/SECURITY.md`

**Interfaces:**
- Consumes: Tamamlanmış `.vdrop` oluşturma/açma UI’si
- Produces: İçerik için sıfır ağ isteğini ve kullanıcı belgelerini doğrulayan yayın kapısı

- [ ] **Step 1: Paket içeriğinin hiçbir ağ isteğine girmediğini test et**

```jsx
it("oluşturma ve açma sırasında fetch gövdesine dosya, paket veya anahtar koymaz", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "550e8400-e29b-41d4-a716-446655440000" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const secretText = "DOSYA-ICERIGI-GIZLI";
  const secretKey = "K".repeat(43);

  render(<SecurePackagePanel view="create" user={{ id: "user-1" }} packageClient={fakePackageClient({ keyText: secretKey })} />);
  fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
    target: { files: [new File([secretText], "gizli.txt")] },
  });
  fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
  await screen.findByRole("link", { name: "VaultDrop paketini indir" });

  for (const call of fetchSpy.mock.calls) {
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain(secretText);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain("gizli.txt");
  }
});
```

- [ ] **Step 2: Belge sözleşmesi testlerine `.vdrop`, `.bta` uyumluluğu ve ayrı anahtar metnini ekle**

```js
expect(readme).toContain(".vdrop");
expect(readme).toContain("Eski `.bta` paketleri açılmaya devam eder");
expect(readme).toContain("anahtarı farklı bir kanaldan");
expect(securityDocument).toContain("AES-256-GCM");
expect(securityDocument).toContain("96 bit IV");
```

- [ ] **Step 3: Hedefli ağ ve belge testlerini çalıştır**

Run: `npm test -- src/__tests__/vaultdrop-network-isolation.test.jsx src/__tests__/docs-security-contract.test.js src/__tests__/readme-limits.test.js src/__tests__/readme-threat-model.test.js`

Expected: İlk çalıştırmada README ve güvenlik metinleri eski `.bta` merkezli olduğu için FAIL.

- [ ] **Step 4: README ve güvenlik belgesini gerçek davranışla eşleştir**

README’de şu gerçekler açıkça yer alacak:

```markdown
- Yeni şifreli paketler `.vdrop` uzantısıyla oluşturulur.
- Eski `.bta` paketleri açılmaya devam eder.
- Paket ve anahtar VaultDrop sunucusuna yüklenmez.
- Anahtar kaybolursa paket kurtarılamaz.
- Üyeler en fazla 15 dosya ve toplam 50 MiB; misafirler tek dosya ve toplam 10 MiB kullanabilir.
```

`docs/SECURITY.md` AES-GCM, rastgele anahtar/IV, ayrı anahtar kanalı, BTA1/BTA2 geriye uyumluluğu, güvenli indirme adı ve içerik ağ izolasyonunu anlatacak.

- [ ] **Step 5: VaultDrop odaklı bütün testleri çalıştır**

Run: `npm test -- src/__tests__/payload-compression.test.js src/__tests__/encrypted-container.test.js src/__tests__/batch-files.test.js src/__tests__/build-vaultdrop-package.test.js src/__tests__/vaultdrop-package-worker.test.js src/__tests__/safe-download-name.test.js src/__tests__/secure-package-ui.test.jsx src/__tests__/vaultdrop-network-isolation.test.jsx src/__tests__/docs-security-contract.test.js src/__tests__/readme-limits.test.js src/__tests__/readme-threat-model.test.js`

Expected: PASS.

- [ ] **Step 6: Tam doğrulama kapısını çalıştır**

Run: `npm test`

Expected: Bütün testler PASS; yalnız bilinçli olarak işaretlenmiş mevcut skip kalabilir.

Run: `npm run lint`

Expected: exit code 0; yeni hata yok.

Run: `npm run build`

Expected: exit code 0; üretim paketi oluşur.

- [ ] **Step 7: Son kontrol noktası oluştur**

Tam test dosyası/test sayısı, lint sonucu, build sonucu ve varsa mevcut uyarıları uygulama notuna kaydet. Git başlatma veya commit yapma.
