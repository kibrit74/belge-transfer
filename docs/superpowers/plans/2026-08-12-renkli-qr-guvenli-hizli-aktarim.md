# Renkli QR Güvenli ve Hızlı Aktarım Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renkli QR laboratuvarını ve ana QR Video içindeki `Renkli Dengeli` profili; akıllı sıkıştırma, aktarım izolasyonu, bütünlük doğrulaması ve worker tabanlı tarama kullanan gerçek bir renkli optik aktarım yoluna dönüştürmek.

**Architecture:** Ham veri önce ortak sıkıştırma katmanında hazırlanacak; laboratuvarda CQF2, şifreli videoda BTA sürüm 2 kapsayıcısına konacaktır. Kapsayıcılar fountain sembollerine ayrılıp ikili CRF2 başlığıyla gerçek dört renkli matrislere çizilecek; alıcı yalnızca CRC32, oturum metadatası ve SHA-256 doğrulamaları tamamlandıktan sonra dosya üretecektir. Ağır sıkıştırma ve görüntü çözme işleri tek uçuşlu bir worker istemcisi üzerinden yürütülecektir.

**Tech Stack:** React 19, JavaScript ES modules, Vitest 4, Testing Library, Canvas API, Web Workers, MediaRecorder, Web Crypto, `fflate`, mevcut fountain/CRC32/base64url yardımcıları.

## Global Constraints

- Yeni bağımlılık eklenmeyecek; projedeki `fflate`, Web Crypto ve mevcut optik kurtarma modülleri kullanılacak.
- Standart `Dengeli`, `Uyumlu`, QRT3/QRF4 ve BTA sürüm 1 davranışları korunacak.
- Renkli profil gerçek telefon testleri tamamlanana kadar deneysel olarak gösterilecek ve varsayılan profil `Dengeli` kalacak.
- Ham dosya veya toplu arşiv sınırı tam olarak 15 MiB, metadata sınırı tam olarak 16 KiB olacak.
- İlk renkli optik blok boyutu tam olarak 380 bayt, emission ratio tam olarak `1.30` olacak; 520 ve 700 bayt bu planın kapsamı dışında kalacak.
- Sıkıştırma zlib seviye 6 ile yapılacak ve yalnızca en az 32 bayt ile en az yüzde 5 birlikte tasarruf edildiğinde kullanılacak.
- Kamera analiz hızı saniyede en fazla 6 olacak; worker meşgulken ikinci çözme işi başlatılmayacak.
- Bütünlük doğrulanmadan başarı gösterilmeyecek ve otomatik indirme yapılmayacak.
- Çok kareli, yani `sourceCount > 1` aktarım tek PNG olarak indirilemeyecek, paylaşılamayacak veya panoya kopyalanamayacak.
- Bütün kullanıcı metinleri ve dosyalar UTF-8 kalacak.
- Mevcut çalışma klasöründe `.git` bulunmuyor. Uygulama sırasında `git init` çalıştırılmayacak; her commit adımı yalnızca gerçek bir Git çalışma alanında yürütülecek.

**Design source:** `docs/superpowers/specs/2026-08-12-renkli-qr-guvenli-hizli-aktarim-design.md`

---

## File Map

### Yeni çekirdek modüller

- `src/protocol/transfer-id.js`: 12 karakterlik güvenli aktarım kimliği üretme ve doğrulama.
- `src/transfer/payload-compression.js`: Akıllı zlib sıkıştırma, geri açma, boyut ve SHA-256 doğrulaması.
- `src/optical/color-package-v2.js`: CQF2 kapsayıcısını oluşturma ve doğrulayarak açma.
- `src/optical/color-frame-v2.js`: Sabit 67 bayt başlıklı CRF2 karelerini kodlama ve ayrıştırma.
- `src/optical/color-receive-session.js`: CRF2 oturum izolasyonu, fountain çözme ve kapsayıcı SHA-256 doğrulaması.
- `src/optical/color-matrix-v2.js`: Saf hücre düzeni, yön işaretleri, kalibrasyon ve bayt/hücre dönüşümü.
- `src/optical/color-matrix-canvas.js`: Canvas çizimi, görüntü sınırı bulma, dönüş ve renk örnekleme.
- `src/workers/color-qr.worker.js`: Sıkıştırma, optik oturum hazırlama, kare üretme ve görüntü çözme.
- `src/workers/color-qr-client.js`: Request/session kimlikli worker istemcisi ve kaynak temizliği.
- `src/hooks/useColorQrScanner.js`: Kamera yaşam döngüsü, 6 analiz/saniye sınırı ve tek uçuşlu çözme.
- `src/video/create-color-qr-video.js`: CRF2 renk matrislerini MediaRecorder ile videoya dönüştürme.
- `src/video/decode-color-qr-video.js`: Renkli videoyu örnekleme, CRF2 oturumuna aktarma ve erken bitirme.

### Değiştirilecek entegrasyon dosyaları

- `src/crypto/encrypted-container.js`: BTA sürüm 2 hazırlanmış/sıkıştırılmış veri desteği; sürüm 1 okuma ve üretim yolu korunur.
- `src/optical/profiles.js`: `color_balanced` profilini gerçek renk matrisi için güvenli değerlere çekme.
- `src/video/create-qr-video.js`: `profile.isColor` olduğunda renkli üreticiye yönlendirme.
- `src/video/decode-qr-video.js`: İlk örneklerden renkli/standart ayrımı ve doğru çözücüye yönlendirme.
- `src/ColorQrLabPage.jsx`: Paketleme, parite, kamera ve video mantığını yeni modüllere devrederek incelme.
- `src/VideoTransferPanel.jsx`: Deneysel profil açıklaması, sıkıştırma istatistikleri ve mevcut anahtar akışını koruma.
- `src/App.css`: Renkli QR durum ve devre dışı paylaşım açıklamaları.

### Yeni ve güncellenecek testler

- `src/__tests__/payload-compression.test.js`
- `src/__tests__/color-package-v2.test.js`
- `src/__tests__/color-frame-v2.test.js`
- `src/__tests__/color-receive-session.test.js`
- `src/__tests__/color-matrix-v2.test.js`
- `src/__tests__/color-qr-worker.test.js`
- `src/__tests__/color-qr-scanner.test.jsx`
- `src/__tests__/color-qr-lab-ui.test.jsx`
- `src/__tests__/encrypted-container.test.js`
- `src/__tests__/create-color-qr-video.test.js`
- `src/__tests__/decode-color-qr-video.test.js`
- `src/__tests__/create-qr-video-v4.test.js`
- `src/__tests__/decode-qr-video-v4.test.js`
- `src/__tests__/video-transfer-ui.test.jsx`
- `scripts/benchmark-color-qr.mjs`
- `docs/color-qr-manual-test.md`

---

### Task 1: Akıllı sıkıştırma ve yük doğrulama

**Files:**
- Create: `src/transfer/payload-compression.js`
- Create: `src/__tests__/payload-compression.test.js`

**Interfaces:**
- Consumes: `sha256Base64Url(bytes: Uint8Array): Promise<string>` from `src/protocol/hash.js`; `zlibSync` and `unzlibSync` from `fflate`.
- Produces: `prepareTransferPayload(bytes: Uint8Array): Promise<PreparedPayload>` and `restoreTransferPayload(storedBytes: Uint8Array, metadata: PayloadMetadata): Promise<Uint8Array>`.
- `PreparedPayload`: `{ storedBytes, compression, originalSize, storedSize, originalSha256, storedSha256, savedBytes, savedPercent }`.
- `PayloadMetadata`: `{ compression: 'none'|'zlib', originalSize, storedSize, originalSha256, storedSha256? }`.

- [ ] **Step 1: Sıkıştırma kararını ve bozulma reddini gösteren başarısız testleri yaz**

```js
import { describe, expect, it } from 'vitest';
import {
  prepareTransferPayload,
  restoreTransferPayload,
} from '../transfer/payload-compression.js';

function noisyBytes(length) {
  let state = 0x12345678;
  return Uint8Array.from({ length }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  });
}

describe('akıllı aktarım sıkıştırması', () => {
  it('100 KB tekrarlı veriyi en az yüzde 90 küçültür', async () => {
    const input = new Uint8Array(100 * 1024).fill(65);
    const prepared = await prepareTransferPayload(input);
    expect(prepared.compression).toBe('zlib');
    expect(prepared.storedSize).toBeLessThanOrEqual(input.length * 0.10);
    await expect(restoreTransferPayload(prepared.storedBytes, prepared))
      .resolves.toEqual(input);
  });

  it('sıkıştırılamayan veriyi büyütmeden none seçer', async () => {
    const input = noisyBytes(100 * 1024);
    const prepared = await prepareTransferPayload(input);
    expect(prepared.compression).toBe('none');
    expect(prepared.storedSize).toBe(input.length);
  });

  it('bozulan saklanmış veriyi dosya olarak döndürmez', async () => {
    const prepared = await prepareTransferPayload(new Uint8Array(4096).fill(7));
    const damaged = new Uint8Array(prepared.storedBytes);
    damaged[damaged.length - 1] ^= 1;
    await expect(restoreTransferPayload(damaged, prepared))
      .rejects.toMatchObject({ code: 'FILE_HASH_MISMATCH' });
  });
});
```

- [ ] **Step 2: Testlerin modül bulunamadığı için başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/payload-compression.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; `../transfer/payload-compression.js` çözümlenemez.

- [ ] **Step 3: Akıllı sıkıştırmayı ve iki aşamalı hash doğrulamasını uygula**

```js
import { unzlibSync, zlibSync } from 'fflate';
import { sha256Base64Url } from '../protocol/hash.js';

export const MAX_COLOR_INPUT_BYTES = 15 * 1024 * 1024;
const MIN_SAVED_BYTES = 32;
const MIN_SAVED_RATIO = 0.05;

export class PayloadCompressionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayloadCompressionError';
    this.code = code;
  }
}

export async function prepareTransferPayload(bytes) {
  assertPayload(bytes);
  const originalSha256 = await sha256Base64Url(bytes);
  let compressed;
  try {
    compressed = zlibSync(bytes, { level: 6 });
  } catch {
    compressed = null;
  }
  const savedBytes = compressed ? bytes.length - compressed.length : 0;
  const useCompressed = Boolean(
    compressed && savedBytes >= MIN_SAVED_BYTES && savedBytes / Math.max(1, bytes.length) >= MIN_SAVED_RATIO,
  );
  const storedBytes = useCompressed ? compressed : new Uint8Array(bytes);
  return {
    storedBytes,
    compression: useCompressed ? 'zlib' : 'none',
    originalSize: bytes.length,
    storedSize: storedBytes.length,
    originalSha256,
    storedSha256: await sha256Base64Url(storedBytes),
    savedBytes: useCompressed ? savedBytes : 0,
    savedPercent: useCompressed ? Math.round((savedBytes / Math.max(1, bytes.length)) * 100) : 0,
  };
}

export async function restoreTransferPayload(storedBytes, metadata) {
  assertPayload(storedBytes, metadata.storedSize);
  if (metadata.storedSha256 && await sha256Base64Url(storedBytes) !== metadata.storedSha256) {
    throw new PayloadCompressionError('FILE_HASH_MISMATCH', 'Saklanan veri bütünlük kontrolünü geçemedi.');
  }
  let original;
  try {
    original = metadata.compression === 'zlib'
      ? unzlibSync(storedBytes, { out: new Uint8Array(metadata.originalSize) })
      : new Uint8Array(storedBytes);
  } catch {
    throw new PayloadCompressionError('DECOMPRESSION_FAILED', 'Sıkıştırılmış veri açılamadı.');
  }
  if (original.length !== metadata.originalSize || await sha256Base64Url(original) !== metadata.originalSha256) {
    throw new PayloadCompressionError('FILE_HASH_MISMATCH', 'Dosya bütünlük doğrulaması başarısız.');
  }
  return original;
}
```

`assertPayload` yalnızca `Uint8Array`, güvenli tam sayı uzunluk, 15 MiB ham sınırı ve beklenen uzunluk eşleşmesini kabul etsin. `metadata.compression` yalnızca `none` veya `zlib` olsun.

- [ ] **Step 4: Odaklı testi çalıştır ve geçtiğini doğrula**

Run: `cmd /c npx vitest run src/__tests__/payload-compression.test.js --pool=threads --maxWorkers=1`

Expected: PASS; 3 test geçer.

- [ ] **Step 5: Git varsa görevi tek commit olarak kaydet**

```powershell
git rev-parse --is-inside-work-tree
git add src/transfer/payload-compression.js src/__tests__/payload-compression.test.js
git commit -m 'feat: add smart color QR compression'
```

Expected: Git çalışma alanında commit oluşur. Git yoksa adım `git init` çalıştırılmadan atlanır.

---

### Task 2: Ortak aktarım kimliği ve CQF2 kapsayıcısı

**Files:**
- Create: `src/protocol/transfer-id.js`
- Create: `src/optical/color-package-v2.js`
- Create: `src/__tests__/color-package-v2.test.js`

**Interfaces:**
- Consumes: `prepareTransferPayload` and `restoreTransferPayload` from Task 1.
- Produces: `createTransferId(): string`, `isTransferId(value): boolean`, `createColorPackageV2(input): Promise<ColorPackageResult>`, `openColorPackageV2(containerBytes, options?): Promise<OpenedColorPackage>`.
- `createColorPackageV2({ payload, name, type, transferId })` returns `{ containerBytes, metadata, stats }`.
- `openColorPackageV2(bytes, { expectedTransferId })` returns `{ payload, name, type, metadata }`.

- [ ] **Step 1: UTF-8, transfer kimliği ve bozuk metadata testlerini yaz**

```js
import { describe, expect, it } from 'vitest';
import {
  createColorPackageV2,
  openColorPackageV2,
} from '../optical/color-package-v2.js';

describe('CQF2 kapsayıcısı', () => {
  it('UTF-8 dosya adı, tür ve içeriği kayıpsız açar', async () => {
    const payload = new TextEncoder().encode('İstanbul çözüm belgesi');
    const created = await createColorPackageV2({
      payload,
      name: 'İstanbul-çözüm-📄.txt',
      type: 'text/plain;charset=utf-8',
      transferId: 'Ab12Cd34Ef56',
    });
    const opened = await openColorPackageV2(created.containerBytes, {
      expectedTransferId: 'Ab12Cd34Ef56',
    });
    expect(opened.payload).toEqual(payload);
    expect(opened.name).toBe('İstanbul-çözüm-📄.txt');
  });

  it('başka optik aktarım kimliğiyle açılmaz', async () => {
    const created = await createColorPackageV2({
      payload: new Uint8Array([1, 2, 3]),
      name: 'kanıt.bin',
      type: 'application/octet-stream',
      transferId: 'Ab12Cd34Ef56',
    });
    await expect(openColorPackageV2(created.containerBytes, {
      expectedTransferId: 'Zy98Xw76Vu54',
    })).rejects.toMatchObject({ code: 'TRANSFER_MISMATCH' });
  });

  it('metadata uzunluğu 16 KiB üstündeyse veri ayırmaz', async () => {
    const invalid = new Uint8Array(9);
    invalid.set(new TextEncoder().encode('CQF2'));
    invalid[4] = 0x20;
    new DataView(invalid.buffer).setUint32(5, 16 * 1024 + 1, false);
    await expect(openColorPackageV2(invalid)).rejects.toMatchObject({ code: 'INVALID_COLOR_PACKAGE' });
  });
});
```

- [ ] **Step 2: CQF2 modülü olmadığı için testin kırmızı olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/color-package-v2.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; CQF2 modülü bulunamaz.

- [ ] **Step 3: Güvenli transfer kimliği yardımcısını oluştur**

```js
const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function isTransferId(value) {
  return typeof value === 'string' && TRANSFER_ID_PATTERN.test(value);
}

export function createTransferId() {
  const result = [];
  const random = new Uint8Array(24);
  while (result.length < 12) {
    globalThis.crypto.getRandomValues(random);
    for (const value of random) {
      if (value < 248) result.push(ALPHABET[value % ALPHABET.length]);
      if (result.length === 12) break;
    }
  }
  return result.join('');
}
```

- [ ] **Step 4: CQF2 ikili zarfını ve şema doğrulamasını uygula**

```js
const MAGIC = new TextEncoder().encode('CQF2');
const FORMAT_BYTE = 0x20;
const PREFIX_BYTES = 9;
const MAX_METADATA_BYTES = 16 * 1024;

export async function createColorPackageV2({ payload, name = '', type = '', transferId }) {
  if (!isTransferId(transferId)) throw packageError('INVALID_COLOR_PACKAGE');
  const prepared = await prepareTransferPayload(payload);
  const metadata = {
    v: 'CQF2', transferId, name, type,
    originalSize: prepared.originalSize,
    storedSize: prepared.storedSize,
    compression: prepared.compression,
    sha256: prepared.originalSha256,
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  if (metadataBytes.length > MAX_METADATA_BYTES) throw packageError('FILE_TOO_LARGE');
  const containerBytes = new Uint8Array(PREFIX_BYTES + metadataBytes.length + prepared.storedSize);
  containerBytes.set(MAGIC, 0);
  containerBytes[4] = FORMAT_BYTE | (prepared.compression === 'zlib' ? 1 : 0);
  new DataView(containerBytes.buffer).setUint32(5, metadataBytes.length, false);
  containerBytes.set(metadataBytes, PREFIX_BYTES);
  containerBytes.set(prepared.storedBytes, PREFIX_BYTES + metadataBytes.length);
  return { containerBytes, metadata, stats: prepared };
}
```

`openColorPackageV2` sihirli başlığı, yüksek nibble sürümünü, flag/metadata sıkıştırma eşleşmesini, metadata alan türlerini, 15 MiB boyutlarını ve `expectedTransferId` değerini doğrulasın. Saklanan veriyi `restoreTransferPayload` fonksiyonuna `{ compression, originalSize, storedSize, originalSha256: sha256 }` alanlarıyla versin.

- [ ] **Step 5: CQF2 testini ve Task 1 regresyonunu çalıştır**

Run: `cmd /c npx vitest run src/__tests__/color-package-v2.test.js src/__tests__/payload-compression.test.js --pool=threads --maxWorkers=1`

Expected: PASS; 6 test geçer.

- [ ] **Step 6: Git varsa CQF2 görevini commit et**

```powershell
git add src/protocol/transfer-id.js src/optical/color-package-v2.js src/__tests__/color-package-v2.test.js
git commit -m 'feat: add CQF2 color package format'
```

---

### Task 3: CRF2 ikili optik kare biçimi

**Files:**
- Create: `src/optical/color-frame-v2.js`
- Create: `src/__tests__/color-frame-v2.test.js`

**Interfaces:**
- Consumes: fountain metadata `{ transferId, sourceCount, blockBytes, originalBytes, sha256 }`, fountain symbol `{ transferId, symbolId, data }`, `crc32Hex`, `toBase64Url`, `fromBase64Url`, `isTransferId`.
- Produces: `encodeColorFrameV2(metadata, symbol): Uint8Array`, `parseColorFrameV2(bytes): ColorFrameV2`, `ColorFrameError`.
- `ColorFrameV2`: `{ protocolVersion: 'CRF2', transferId, symbolId, sourceCount, blockBytes, originalBytes, sha256, data }`.

- [ ] **Step 1: Round-trip, CRC ve alan sınırı testlerini yaz**

```js
import { describe, expect, it } from 'vitest';
import { encodeColorFrameV2, parseColorFrameV2 } from '../optical/color-frame-v2.js';

const metadata = {
  transferId: 'Ab12Cd34Ef56', sourceCount: 3, blockBytes: 380,
  originalBytes: 900, sha256: 'A'.repeat(43),
};

describe('CRF2 kare biçimi', () => {
  it('fountain sembolünü sabit ikili başlıkla kayıpsız taşır', () => {
    const symbol = { transferId: metadata.transferId, symbolId: 1, data: new Uint8Array(380).fill(7) };
    const parsed = parseColorFrameV2(encodeColorFrameV2(metadata, symbol));
    expect(parsed).toEqual({ protocolVersion: 'CRF2', ...metadata, symbolId: 1, data: symbol.data });
  });

  it('bir baytı bozulan kareyi CRC hatasıyla reddeder', () => {
    const encoded = encodeColorFrameV2(metadata, {
      transferId: metadata.transferId, symbolId: 0, data: new Uint8Array(380).fill(3),
    });
    encoded[encoded.length - 1] ^= 1;
    expect(() => parseColorFrameV2(encoded)).toThrow(expect.objectContaining({ code: 'FRAME_CRC_MISMATCH' }));
  });

  it('sembol numarası sourceCount çarpı 4 sınırını aşarsa reddeder', () => {
    expect(() => encodeColorFrameV2(metadata, {
      transferId: metadata.transferId, symbolId: 12, data: new Uint8Array(380),
    })).toThrow(expect.objectContaining({ code: 'INVALID_COLOR_FRAME' }));
  });
});
```

- [ ] **Step 2: CRF2 modülü bulunamadığı için testi kırmızı çalıştır**

Run: `cmd /c npx vitest run src/__tests__/color-frame-v2.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; CRF2 modülü çözümlenemez.

- [ ] **Step 3: Tam 67 baytlık başlığı big-endian olarak uygula**

```js
const MAGIC = new TextEncoder().encode('CRF2');
export const COLOR_FRAME_HEADER_BYTES = 67;
const FLAG_REPAIR = 1;

export function encodeColorFrameV2(metadata, symbol) {
  validateMetadataAndSymbol(metadata, symbol);
  const output = new Uint8Array(COLOR_FRAME_HEADER_BYTES + metadata.blockBytes);
  const view = new DataView(output.buffer);
  output.set(MAGIC, 0);
  output[4] = symbol.symbolId >= metadata.sourceCount ? FLAG_REPAIR : 0;
  output.set(new TextEncoder().encode(metadata.transferId), 5);
  view.setUint32(17, symbol.symbolId, false);
  view.setUint32(21, metadata.sourceCount, false);
  view.setUint16(25, metadata.blockBytes, false);
  view.setUint32(27, metadata.originalBytes, false);
  output.set(fromBase64Url(metadata.sha256), 31);
  view.setUint32(63, Number.parseInt(crc32Hex(symbol.data), 16), false);
  output.set(symbol.data, COLOR_FRAME_HEADER_BYTES);
  return output;
}
```

`parseColorFrameV2` aynı offsetleri okusun; `MAGIC`, flag, 12 bayt ASCII transfer kimliği, `sourceCount <= 100000`, `blockBytes <= 4096`, `symbolId < sourceCount * 4`, tam kare uzunluğu ve CRC32 değerini doğrulasın. 32 hash baytını `toBase64Url` ile 43 karaktere çevirsin. Geçersiz alanlar `INVALID_COLOR_FRAME`, veri değişimi `FRAME_CRC_MISMATCH` kodlu `ColorFrameError` üretsin.

- [ ] **Step 4: CRF2 testini çalıştır ve geçir**

Run: `cmd /c npx vitest run src/__tests__/color-frame-v2.test.js --pool=threads --maxWorkers=1`

Expected: PASS; 3 test geçer.

- [ ] **Step 5: Git varsa CRF2 görevini commit et**

```powershell
git add src/optical/color-frame-v2.js src/__tests__/color-frame-v2.test.js
git commit -m 'feat: add CRF2 binary optical frames'
```

---

### Task 4: İzole ve doğrulanmış renkli alım oturumu

**Files:**
- Create: `src/optical/color-receive-session.js`
- Create: `src/__tests__/color-receive-session.test.js`

**Interfaces:**
- Consumes: parsed `ColorFrameV2`, `createFountainDecoder(metadata)`, `sha256Base64Url`.
- Produces: `createColorReceiveSession(options?): ColorReceiveSession`.
- Session methods: `accept(frame)`, `assemble()`, `progress()`, `reset()`, `getState()`, `getMetadata()`.
- `assemble()` returns `{ bytes, metadata }` only after fountain completion and container SHA-256 match.

- [ ] **Step 1: Kurtarma, farklı aktarım ve bozuk hash testlerini yaz**

```js
import { describe, expect, it } from 'vitest';
import { createFountainEncoder } from '../optical/fountain.js';
import { createColorReceiveSession } from '../optical/color-receive-session.js';

function asFrame(metadata, symbol) {
  return { protocolVersion: 'CRF2', ...metadata, symbolId: symbol.symbolId, data: symbol.data };
}

describe('renkli QR alım oturumu', () => {
  it('eksik ilk ana sembolü kurtarma sembolünden tamamlar', async () => {
    const input = Uint8Array.from({ length: 8 * 380 }, (_, index) => index & 0xff);
    const encoder = await createFountainEncoder(input, {
      transferId: 'Ab12Cd34Ef56', blockBytes: 380, emissionRatio: 1.30,
    });
    const session = createColorReceiveSession();
    for (const symbol of encoder.symbols().filter((item) => item.symbolId !== 0)) {
      session.accept(asFrame(encoder.metadata, symbol));
    }
    await expect(session.assemble()).resolves.toEqual({
      bytes: input,
      metadata: expect.objectContaining({ transferId: 'Ab12Cd34Ef56' }),
    });
  });

  it('başka aktarımın karesini mevcut oturuma eklemez', async () => {
    const encoder = await createFountainEncoder(new Uint8Array(760), {
      transferId: 'Ab12Cd34Ef56', blockBytes: 380,
    });
    const session = createColorReceiveSession();
    const first = asFrame(encoder.metadata, encoder.symbol(0));
    expect(session.accept(first)).toMatchObject({ accepted: true });
    expect(session.accept({ ...first, transferId: 'Zy98Xw76Vu54', symbolId: 1 }))
      .toEqual({ accepted: false, reason: 'different-transfer' });
  });

  it('yanlış kapsayıcı hashinde bayt sunmaz', async () => {
    const encoder = await createFountainEncoder(new Uint8Array(380).fill(9), {
      transferId: 'Ab12Cd34Ef56', blockBytes: 380,
    });
    const session = createColorReceiveSession();
    session.accept(asFrame({ ...encoder.metadata, sha256: 'A'.repeat(43) }, encoder.symbol(0)));
    await expect(session.assemble()).rejects.toMatchObject({ code: 'CONTAINER_HASH_MISMATCH' });
    expect(session.getState()).toBe('failed');
  });
});
```

- [ ] **Step 2: Alım oturumu modülü olmadığı için testin başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/color-receive-session.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; alım oturumu modülü bulunamaz.

- [ ] **Step 3: Oturum metadata kilidini ve fountain köprüsünü uygula**

```js
const METADATA_FIELDS = ['transferId', 'sourceCount', 'blockBytes', 'originalBytes', 'sha256'];

export function createColorReceiveSession({ maxBytes = 15 * 1024 * 1024 + 16 * 1024 + 9 } = {}) {
  let state = 'idle';
  let metadata = null;
  let decoder = null;

  function accept(frame) {
    if (state === 'failed') return { accepted: false, reason: 'session-failed' };
    if (!isValidColorFrame(frame)) return { accepted: false, reason: 'invalid-frame' };
    if (frame.originalBytes > maxBytes) return failAccept('size-limit');
    if (metadata && frame.transferId !== metadata.transferId) {
      return { accepted: false, reason: 'different-transfer' };
    }
    if (metadata && !METADATA_FIELDS.every((field) => frame[field] === metadata[field])) {
      return { accepted: false, reason: 'metadata-mismatch' };
    }
    if (!metadata) {
      metadata = Object.fromEntries(METADATA_FIELDS.map((field) => [field, frame[field]]));
      metadata.protocolVersion = 'CRF2';
      decoder = createFountainDecoder(metadata);
      state = 'collecting';
    }
    const result = decoder.accept({ transferId: frame.transferId, symbolId: frame.symbolId, data: frame.data });
    if (decoder.isComplete()) state = 'complete';
    return result;
  }

  async function assemble() {
    if (!decoder?.isComplete()) return null;
    const bytes = decoder.bytes();
    if (!bytes || await sha256Base64Url(bytes) !== metadata.sha256) {
      state = 'failed';
      throw new ColorReceiveError('CONTAINER_HASH_MISMATCH', 'Renkli QR kapsayıcısı bütünlük kontrolünü geçemedi.');
    }
    return { bytes, metadata: { ...metadata } };
  }

  return { accept, assemble, progress: () => decoder?.progress() ?? EMPTY_PROGRESS, reset, getState: () => state, getMetadata: () => metadata ? { ...metadata } : null };
}
```

`reset` bütün oturum değişkenlerini `idle/null` durumuna çeksin. `isValidColorFrame` protokol sürümü, alan türleri, sembol sınırı ve veri uzunluğunu doğrulasın. `failAccept` durumu `failed` yapıp `{ accepted: false, reason }` döndürsün.

- [ ] **Step 4: Oturum ve mevcut fountain testlerini birlikte çalıştır**

Run: `cmd /c npx vitest run src/__tests__/color-receive-session.test.js src/__tests__/optical-fountain.test.js --pool=threads --maxWorkers=1`

Expected: PASS; yeni 3 test ve mevcut fountain testleri geçer.

- [ ] **Step 5: Git varsa alım oturumunu commit et**

```powershell
git add src/optical/color-receive-session.js src/__tests__/color-receive-session.test.js
git commit -m 'feat: isolate and verify color QR receive sessions'
```

---

### Task 5: Yön işaretli renk matrisi V2

**Files:**
- Create: `src/optical/color-matrix-v2.js`
- Create: `src/optical/color-matrix-canvas.js`
- Create: `src/__tests__/color-matrix-v2.test.js`

**Interfaces:**
- Consumes: CRF2 kare baytları from Task 3.
- Produces: `buildColorMatrixV2(frameBytes): ColorMatrix`, `readColorMatrixV2(matrix): Uint8Array`, `renderColorMatrixV2(canvas, frameBytes, options): RenderResult`, `scanColorMatrixV2(imageData): ScanResult|null`.
- `ColorMatrix`: `{ dimension, quietZone: 4, cells: Uint8Array, frameByteLength }`; cell values `0=black, 1=red, 2=green, 3=blue, 4=white`.
- `ScanResult`: `{ frameBytes, dimension, rotation, confidence }`.

- [ ] **Step 1: Saf hücre düzeni, dönüş ve kalibrasyon testlerini yaz**

```js
import { describe, expect, it } from 'vitest';
import { buildColorMatrixV2, readColorMatrixV2 } from '../optical/color-matrix-v2.js';
import { rasterizeColorMatrixForTest, scanColorMatrixV2 } from '../optical/color-matrix-canvas.js';

describe('renk matrisi V2', () => {
  it('CRF2 baytlarını yön ve kalibrasyon hücreleriyle kayıpsız taşır', () => {
    const frameBytes = Uint8Array.from({ length: 447 }, (_, index) => index & 0xff);
    const matrix = buildColorMatrixV2(frameBytes);
    expect(matrix.quietZone).toBe(4);
    expect(readColorMatrixV2(matrix)).toEqual(frameBytes);
  });

  it.each([0, 90, 180, 270])('%i derece döndürülmüş sentetik görüntüyü çözer', (rotation) => {
    const frameBytes = new Uint8Array(447).fill(7);
    const matrix = buildColorMatrixV2(frameBytes);
    const imageData = rasterizeColorMatrixForTest(matrix, { cellSize: 10, rotation });
    expect(scanColorMatrixV2(imageData)).toMatchObject({ frameBytes, rotation });
  });

  it('parlaklık kaydırılmış RGB örneklerini kalibrasyon hücreleriyle çözer', () => {
    const frameBytes = new Uint8Array(447).fill(0b01101100);
    const imageData = rasterizeColorMatrixForTest(buildColorMatrixV2(frameBytes), {
      cellSize: 10,
      transformRgb: ([r, g, b]) => [Math.min(255, r * 0.72 + 30), Math.min(255, g * 0.72 + 30), Math.min(255, b * 0.72 + 30)],
    });
    expect(scanColorMatrixV2(imageData)?.frameBytes).toEqual(frameBytes);
  });
});
```

- [ ] **Step 2: V2 matris modülleri olmadığı için testin kırmızı olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/color-matrix-v2.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; matris modülleri bulunamaz.

- [ ] **Step 3: Saf hücre yerleşimini sabit işaretlerle uygula**

```js
export const COLOR_CELL = Object.freeze({ BLACK: 0, RED: 1, GREEN: 2, BLUE: 3, WHITE: 4 });
const QUIET_ZONE = 4;
const FINDER_SIZE = 5;

export function buildColorMatrixV2(frameBytes) {
  if (!(frameBytes instanceof Uint8Array) || frameBytes.length === 0) throw new TypeError('Renk matrisi için kare baytları gerekir.');
  const dataSymbols = frameBytes.length * 4;
  const innerDimension = chooseOddDimension(dataSymbols + reservedCellCount());
  const dimension = innerDimension + QUIET_ZONE * 2;
  const cells = new Uint8Array(dimension * dimension).fill(COLOR_CELL.WHITE);
  drawFinder(cells, dimension, QUIET_ZONE, QUIET_ZONE, 'top-left');
  drawFinder(cells, dimension, dimension - QUIET_ZONE - FINDER_SIZE, QUIET_ZONE, 'top-right');
  drawFinder(cells, dimension, QUIET_ZONE, dimension - QUIET_ZONE - FINDER_SIZE, 'bottom-left');
  drawOrientationMark(cells, dimension);
  drawCalibrationStrip(cells, dimension, [COLOR_CELL.BLACK, COLOR_CELL.RED, COLOR_CELL.GREEN, COLOR_CELL.BLUE]);
  writePayloadCells(cells, dimension, bytesToTwoBitSymbols(frameBytes));
  return { dimension, quietZone: QUIET_ZONE, cells, frameByteLength: frameBytes.length };
}
```

`reservedCellCount`, `drawFinder`, `drawOrientationMark`, `drawCalibrationStrip`, `writePayloadCells` ve `readPayloadCells` aynı `isReservedCell(row, column, dimension)` kuralını kullansın. Finder deseni dıştan içe siyah-beyaz-siyah 5×5 halka olsun; sağ alt yön işareti kırmızı-mavi-yeşil sırasıyla üç hücre kullansın. Padding veri hücreleri siyah olsun. `readColorMatrixV2` ilk 67 bayttan CRF2 `blockBytes` alanını okuyup çıktıyı `67 + blockBytes` uzunluğunda kessin.

- [ ] **Step 4: Canvas çizimi ve sentetik tarama algoritmasını uygula**

```js
const RGB = Object.freeze([
  [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255],
]);

export function renderColorMatrixV2(canvas, frameBytes, { cellSize = 8, maxCanvasSize = 1080 } = {}) {
  const matrix = buildColorMatrixV2(frameBytes);
  const maxCellSize = Math.floor(maxCanvasSize / matrix.dimension);
  if (maxCellSize < 8) {
    throw colorMatrixError('COLOR_UNSUPPORTED', 'Renkli matris güvenli hücre boyutuna sığmıyor.');
  }
  const safeCellSize = Math.max(8, Math.min(cellSize, maxCellSize));
  const size = matrix.dimension * safeCellSize;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw colorMatrixError('COLOR_UNSUPPORTED', 'Renkli QR tuvali hazırlanamadı.');
  context.imageSmoothingEnabled = false;
  for (let row = 0; row < matrix.dimension; row += 1) {
    for (let column = 0; column < matrix.dimension; column += 1) {
      context.fillStyle = rgbToCss(RGB[matrix.cells[row * matrix.dimension + column]]);
      context.fillRect(column * safeCellSize, row * safeCellSize, safeCellSize, safeCellSize);
    }
  }
  return { ...matrix, cellSize: safeCellSize, size };
}
```

`scanColorMatrixV2` şu özel yardımcıları aynı dosyada tanımlasın:

- `locateMatrixBounds(imageData)`: Beyaz sessiz alanın içindeki üç 5×5 finder adayını satır/sütun run-length taramasıyla bulur ve kare bounding box döndürür.
- `inferGrid(bounds, finderCandidates)`: Finder merkezleri arasındaki mesafeden tam sayı hücre boyutunu ve tek sayı iç ölçüyü üretir; hücre boyutu 3 pikselin altındaysa `null` döndürür.
- `detectRotation(sampledCells)`: Üç finder ve sağ alt renk sırasını kullanarak yalnızca `0|90|180|270` döndürür.
- `readCalibration(imageData, geometry)`: Dört kalibrasyon hücresinin ortalama RGB değerini çıkarır.
- `classifyWithCalibration(rgb, palette)`: Ölçülen pikseli kalibrasyon renklerine karesel Öklid uzaklığıyla sınıflandırır.
- `sampleGrid(imageData, geometry, palette)`: Her hücrenin merkez ve dört çapraz noktasını oylayarak hücre dizisi üretir.

Tarama sonucu `readColorMatrixV2` ile bayta döndürülsün; ilk dört bayt `CRF2` değilse `null` dönsün. `confidence`, kazanan renk oylarının toplam örnek sayısına oranı olsun ve `0.70` altı sonuç kabul edilmesin.

- [ ] **Step 5: Matris testini ve eski renk yardımcı testlerini çalıştır**

Run: `cmd /c npx vitest run src/__tests__/color-matrix-v2.test.js src/__tests__/color-matrix.test.js --pool=threads --maxWorkers=1`

Expected: PASS; yeni V2 testleri ve eski CQF1 testleri geçer.

- [ ] **Step 6: Git varsa matris görevini commit et**

```powershell
git add src/optical/color-matrix-v2.js src/optical/color-matrix-canvas.js src/__tests__/color-matrix-v2.test.js
git commit -m 'feat: add calibrated color matrix V2'
```

---

### Task 6: Renkli QR worker protokolü ve istemcisi

**Files:**
- Create: `src/workers/color-qr.worker.js`
- Create: `src/workers/color-qr-client.js`
- Create: `src/__tests__/color-qr-worker.test.js`

**Interfaces:**
- Consumes: Tasks 1–5 modules and `createFountainEncoder`.
- Produces: `createColorQrWorkerClient(options?): ColorQrWorkerClient`.
- Client methods: `preparePayload`, `preparePackage`, `prepareOptical`, `getFrame`, `decodeImage`, `disposeSession`, `terminate`.
- `preparePayload(sessionId, bytes)` returns the full `PreparedPayload`; `preparePackage(sessionId, input)` returns `{ transferId, sourceCount, emittedSymbols, blockBytes, originalBytes, compressionStats }`; `prepareOptical(sessionId, bytes, options)` returns the same optical fields with `compressionStats: null`.
- `compressionStats` contains only `{ compression, originalSize, storedSize, savedBytes, savedPercent }`; it never includes `storedBytes`.
- Every request carries `{ requestId, sessionId, type }`; stale session responses are rejected with `{ code: 'STALE_SESSION' }`.

- [ ] **Step 1: İstek eşleme, eski yanıt ve kaynak temizleme testlerini yaz**

```js
import { describe, expect, it, vi } from 'vitest';
import { createColorQrWorkerClient } from '../workers/color-qr-client.js';

class FakeWorker {
  postMessage = vi.fn();
  terminate = vi.fn();
  onmessage = null;
  onerror = null;
  reply(data) { this.onmessage?.({ data }); }
}

describe('renkli QR worker istemcisi', () => {
  it('requestId ile eşleşen yanıtı doğru Promise sonucuna verir', async () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });
    const pending = client.preparePayload('session-1', new Uint8Array([1, 2, 3]));
    const request = worker.postMessage.mock.calls[0][0];
    worker.reply({ type: 'prepared-payload', sessionId: 'session-1', requestId: request.requestId, result: { storedSize: 3 } });
    await expect(pending).resolves.toEqual({ storedSize: 3 });
  });

  it('dispose edilen oturumun geç yanıtını kullanmaz', async () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });
    const pending = client.decodeImage('session-old', { data: new Uint8ClampedArray(4), width: 1, height: 1 });
    const request = worker.postMessage.mock.calls[0][0];
    client.disposeSession('session-old');
    worker.reply({ type: 'decoded-frame', sessionId: 'session-old', requestId: request.requestId, result: {} });
    await expect(pending).rejects.toMatchObject({ code: 'STALE_SESSION' });
  });

  it('terminate bekleyen işleri reddeder ve workerı kapatır', async () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });
    const pending = client.getFrame('session-1', 0);
    client.terminate();
    await expect(pending).rejects.toMatchObject({ code: 'WORKER_TERMINATED' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('Worker desteklenmiyorsa tanımlı COLOR_UNSUPPORTED hatası verir', () => {
    expect(() => createColorQrWorkerClient({ worker: null }))
      .toThrow(expect.objectContaining({ code: 'COLOR_UNSUPPORTED' }));
  });
});
```

- [ ] **Step 2: Worker istemcisi bulunmadığı için testin kırmızı olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/color-qr-worker.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; worker istemcisi modülü bulunamaz.

- [ ] **Step 3: Request/session eşlemeli istemciyi uygula**

```js
export function createColorQrWorkerClient({ worker = createWorker() } = {}) {
  if (!worker) {
    throw clientError('COLOR_UNSUPPORTED', 'Bu tarayıcı renkli QR işlemlerini desteklemiyor.');
  }
  let sequence = 0;
  let terminated = false;
  const pending = new Map();
  const disposedSessions = new Set();

  worker.onmessage = ({ data }) => {
    const entry = pending.get(data?.requestId);
    if (!entry) return;
    pending.delete(data.requestId);
    if (disposedSessions.has(data.sessionId)) {
      entry.reject(clientError('STALE_SESSION'));
    } else if (data.type === 'error') {
      entry.reject(clientError(data.code, data.message));
    } else {
      entry.resolve(data.result);
    }
  };

  function request(type, sessionId, payload, transfer = []) {
    if (terminated) return Promise.reject(clientError('WORKER_TERMINATED'));
    const requestId = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, sessionId });
      worker.postMessage({ type, sessionId, requestId, ...payload }, transfer);
    });
  }

  return {
    preparePayload(sessionId, bytes) {
      const owned = new Uint8Array(bytes);
      return request('prepare-payload', sessionId, { bytes: owned }, [owned.buffer]);
    },
    preparePackage: (sessionId, input) => request('prepare-package', sessionId, { input }),
    prepareOptical(sessionId, bytes, options) {
      const owned = new Uint8Array(bytes);
      return request('prepare-optical', sessionId, { bytes: owned, options }, [owned.buffer]);
    },
    getFrame: (sessionId, symbolId) => request('get-frame', sessionId, { symbolId }),
    decodeImage(sessionId, imageData) {
      const owned = {
        ...imageData,
        data: new Uint8ClampedArray(imageData.data),
      };
      return request('decode-image', sessionId, { imageData: owned }, [owned.data.buffer]);
    },
    disposeSession,
    terminate,
  };
}
```

`createWorker` önce `globalThis.Worker` desteğini kontrol etsin; destek yoksa veya açıkça `null` verilirse `COLOR_UNSUPPORTED` üretilsin. `disposeSession` oturumu sete eklesin, o oturumun pending isteklerini `STALE_SESSION` ile reddetsin ve worker'a `dispose-session` göndersin. `terminate` bütün pending istekleri `WORKER_TERMINATED` ile reddedip worker'ı kapatsın. Transfer listesine verilmeden önce sadece worker'a ait kopyalar kullanılacak; React state içindeki özgün buffer detach edilmeyecek.

- [ ] **Step 4: Worker tarafında durumlu optik oturumları uygula**

```js
const opticalSessions = new Map();

self.onmessage = async ({ data: message }) => {
  const { type, sessionId, requestId } = message ?? {};
  try {
    if (type === 'prepare-payload') {
      const prepared = await prepareTransferPayload(new Uint8Array(message.bytes));
      return reply('prepared-payload', sessionId, requestId, prepared, [prepared.storedBytes.buffer]);
    }
    if (type === 'prepare-package') {
      const created = await createColorPackageV2(message.input);
      return prepareEncoderAndReply(sessionId, requestId, created.containerBytes, created.metadata.transferId, created.stats);
    }
    if (type === 'prepare-optical') {
      return prepareEncoderAndReply(sessionId, requestId, new Uint8Array(message.bytes), message.options.transferId, null);
    }
    if (type === 'get-frame') {
      const entry = requireSession(sessionId);
      const frameBytes = encodeColorFrameV2(entry.encoder.metadata, entry.encoder.symbol(message.symbolId));
      return reply('color-frame', sessionId, requestId, { frameBytes }, [frameBytes.buffer]);
    }
    if (type === 'decode-image') {
      const scan = scanColorMatrixV2(message.imageData);
      const frame = scan ? parseColorFrameV2(scan.frameBytes) : null;
      return reply('decoded-frame', sessionId, requestId, { scan, frame }, frame ? [frame.data.buffer] : []);
    }
    if (type === 'dispose-session') opticalSessions.delete(sessionId);
  } catch (error) {
    replyError(sessionId, requestId, error);
  }
};
```

`prepareEncoderAndReply` `createFountainEncoder(bytes, { transferId, blockBytes: 380, emissionRatio: 1.30 })` kullansın, encoder'ı `opticalSessions` içinde tutsun ve `{ transferId, sourceCount, emittedSymbols, blockBytes, originalBytes, compressionStats }` döndürsün. `compressionStats`, yukarıdaki beş sayısal/metinsel alandan `pickCompressionStats` ile oluşturulsun; `storedBytes` yanıta eklenmesin. Böylece binlerce kare ana iş parçacığında aynı anda tutulmasın.

- [ ] **Step 5: Worker istemci testini ve protokol modülü testlerini çalıştır**

Run: `cmd /c npx vitest run src/__tests__/color-qr-worker.test.js src/__tests__/color-frame-v2.test.js src/__tests__/color-package-v2.test.js --pool=threads --maxWorkers=1`

Expected: PASS; tüm odaklı testler geçer.

- [ ] **Step 6: Git varsa worker görevini commit et**

```powershell
git add src/workers/color-qr.worker.js src/workers/color-qr-client.js src/__tests__/color-qr-worker.test.js
git commit -m 'feat: move color QR work off the main thread'
```

---

### Task 7: Tek uçuşlu renkli kamera tarama hook'u

**Files:**
- Create: `src/hooks/useColorQrScanner.js`
- Create: `src/__tests__/color-qr-scanner.test.jsx`

**Interfaces:**
- Consumes: `ColorQrWorkerClient.decodeImage(sessionId, imageData)` from Task 6.
- Produces: `useColorQrScanner({ enabled, paused, facingMode, sessionId, workerClient, onFrame, scanIntervalMs=167 })`.
- Returns: `{ videoRef, error, isScanning, restartCamera, scanSnapshot, stopCamera }`.

- [ ] **Step 1: Eşzamanlı çözmeme, eski sonuç ve kamera temizliği testlerini yaz**

```jsx
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useColorQrScanner } from '../hooks/useColorQrScanner.js';

function Harness(props) {
  const scanner = useColorQrScanner(props);
  useEffect(() => props.onReady(scanner), [props, scanner]);
  return <video ref={scanner.videoRef} muted playsInline />;
}

it('ilk çözme bitmeden ikinci worker çözmesini başlatmaz', async () => {
  vi.useFakeTimers();
  let finish;
  const workerClient = { decodeImage: vi.fn(() => new Promise((resolve) => { finish = resolve; })) };
  render(<Harness enabled sessionId='s1' workerClient={workerClient} onFrame={vi.fn()} onReady={() => {}} />);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(workerClient.decodeImage).toHaveBeenCalledTimes(1);
  finish(null);
  await act(() => vi.advanceTimersByTimeAsync(167));
  expect(workerClient.decodeImage).toHaveBeenCalledTimes(2);
});

it('oturum değiştikten sonra eski çözüm sonucunu onFramee vermez', async () => {
  const deferred = createDeferred();
  const onFrame = vi.fn();
  const workerClient = { decodeImage: vi.fn(() => deferred.promise) };
  const view = render(<Harness enabled sessionId='old' workerClient={workerClient} onFrame={onFrame} onReady={() => {}} />);
  view.rerender(<Harness enabled sessionId='new' workerClient={workerClient} onFrame={onFrame} onReady={() => {}} />);
  deferred.resolve({ frame: { protocolVersion: 'CRF2' } });
  await act(async () => {});
  expect(onFrame).not.toHaveBeenCalled();
});

it('kamera izni reddedildikten sonra tekrar deneyebilir', async () => {
  getUserMediaMock
    .mockRejectedValueOnce(new DOMException('İzin reddedildi', 'NotAllowedError'))
    .mockResolvedValueOnce(createMockStream());
  let latest;
  render(<Harness enabled sessionId='s1' workerClient={fakeWorker()} onFrame={vi.fn()}
    onReady={(scanner) => { latest = scanner; }} />);
  await waitFor(() => expect(latest.error).toBeTruthy());
  await act(async () => latest.restartCamera());
  expect(getUserMediaMock).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(latest.error).toBeNull());
});
```

Test kurulumunda `navigator.mediaDevices.getUserMedia`, video `play`, `readyState`, `videoWidth/videoHeight`, canvas `drawImage/getImageData` ve track `stop` mevcut `camera-scanner.test.jsx` desenine göre açıkça mocklansın. Unmount testinde bütün track'lerin bir kez kapandığı ve timer kalmadığı doğrulansın.

- [ ] **Step 2: Hook bulunmadığı için testi kırmızı çalıştır**

Run: `cmd /c npx vitest run src/__tests__/color-qr-scanner.test.jsx --pool=threads --maxWorkers=1`

Expected: FAIL; hook modülü bulunamaz.

- [ ] **Step 3: Kamera ve tek uçuşlu tarama döngüsünü uygula**

```js
export const COLOR_SCAN_INTERVAL_MS = 167;

export function useColorQrScanner({
  enabled, paused = false, facingMode = 'environment', sessionId,
  workerClient, onFrame, scanIntervalMs = COLOR_SCAN_INTERVAL_MS,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const scanOnce = useCallback(async () => {
    if (!mountedRef.current || busyRef.current || !enabled || paused) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return scheduleNext();
    busyRef.current = true;
    const generation = generationRef.current;
    try {
      const imageData = captureAtMost720p(video);
      const result = await workerClient.decodeImage(sessionId, imageData);
      if (mountedRef.current && generation === generationRef.current && result?.frame) {
        onFrameRef.current?.(result);
      }
    } catch (error) {
      if (error?.code !== 'STALE_SESSION') setError('Renkli QR karesi çözülemedi.');
    } finally {
      busyRef.current = false;
      scheduleNext();
    }
  }, [enabled, paused, sessionId, scanIntervalMs, workerClient]);
```

`captureAtMost720p` görüntü oranını koruyup uzun kenarı en fazla 1280, kısa kenarı en fazla 720 yapacak; `imageSmoothingEnabled=false` kullanacak. `scheduleNext` yalnızca aktif ve duraklatılmamış durumda `setTimeout(scanOnce, scanIntervalMs)` kuracak. Facing mode veya session değişiminde `generationRef` artırılacak. Unmount ve disable sırasında timer, stream track'leri ve video `srcObject` temizlenecek. `scanSnapshot` aynı tek uçuş kilidiyle o anki yüksek çözünürlüklü kareyi bir kez çözecek.

- [ ] **Step 4: Hook testini ve standart kamera regresyonunu çalıştır**

Run: `cmd /c npx vitest run src/__tests__/color-qr-scanner.test.jsx src/__tests__/camera-scanner.test.jsx --pool=threads --maxWorkers=1`

Expected: PASS; renkli ve standart kamera testleri geçer.

- [ ] **Step 5: Git varsa kamera hook'unu commit et**

```powershell
git add src/hooks/useColorQrScanner.js src/__tests__/color-qr-scanner.test.jsx
git commit -m 'feat: add single-flight color QR camera scanning'
```

---

### Task 8: Laboratuvar sayfasını yeni motora taşı ve paylaşımı güvenli hale getir

**Files:**
- Modify: `src/ColorQrLabPage.jsx`
- Modify: `src/App.css`
- Modify: `src/__tests__/color-qr-lab-ui.test.jsx`

**Interfaces:**
- Consumes: worker client from Task 6, scanner hook from Task 7, `createColorReceiveSession`, `openColorPackageV2`, `renderColorMatrixV2`.
- Produces: `ColorQrLabPage({ workerClient? })`; route davranışı değişmez.
- Page state uses `sendSessionId`, `receiveSessionId`, `opticalMetadata`, `compressionStats`, `currentSymbolId`, `receiveProgress`, `verifiedResult`.

- [ ] **Step 1: Sıkıştırma bilgisi, PNG kuralı ve doğrulanmış başarı UI testlerini yaz**

```jsx
it('hazırlanan aktarımda sıkıştırma ve sembol sayılarını gösterir', async () => {
  const workerClient = fakeColorWorker({ sourceCount: 1, emittedSymbols: 2, savedPercent: 96 });
  render(<ColorQrLabPage workerClient={workerClient} />);
  fireEvent.change(screen.getByLabelText('Renkli QR ile gönderilecek belge'), {
    target: { files: [new File([new Uint8Array(100 * 1024).fill(65)], 'metin.txt')] },
  });
  expect(await screen.findByText('%96 daha küçük')).toBeInTheDocument();
  expect(screen.getByText('1 ana sembol · 1 kurtarma sembolü')).toBeInTheDocument();
});

it('çok kareli aktarımda tek PNG işlemlerini kapatır', async () => {
  const workerClient = fakeColorWorker({ sourceCount: 2, emittedSymbols: 3, savedPercent: 0 });
  render(<ColorQrLabPage workerClient={workerClient} />);
  fireEvent.change(screen.getByLabelText('Renkli QR ile gönderilecek belge'), {
    target: { files: [new File([new Uint8Array(1000)], 'kanıt.bin')] },
  });
  expect(await screen.findByRole('button', { name: 'Görsel indir (PNG)' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Panoya kopyala' })).toBeDisabled();
  expect(screen.getByText('Bu belge birden fazla renkli kare gerektiriyor; video veya canlı akış kullanın.')).toBeInTheDocument();
});

it('hash doğrulanmadan belge tamamlandı mesajı veya indirme üretmez', async () => {
  const workerClient = fakeColorWorker({ assembleError: { code: 'CONTAINER_HASH_MISMATCH' } });
  render(<ColorQrLabPage workerClient={workerClient} />);
  fireEvent.click(screen.getByRole('button', { name: 'Al' }));
  await emitDecodedFrame(workerClient);
  expect(screen.queryByText('Belge tamamlandı.')).not.toBeInTheDocument();
  expect(anchorClickMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Yeni beklentilerin mevcut sayfada başarısız olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/color-qr-lab-ui.test.jsx --pool=threads --maxWorkers=1`

Expected: FAIL; yeni erişilebilir adlar, sıkıştırma bilgisi ve PNG kuralı bulunmaz.

- [ ] **Step 3: Gönderim tarafındaki inline paket/parite mantığını worker oturumuna taşı**

```js
const [sendSessionId, setSendSessionId] = useState(() => crypto.randomUUID());
const [sendInfo, setSendInfo] = useState(null);

async function prepareSelectedFile(file) {
  const nextSessionId = crypto.randomUUID();
  setSendSessionId(nextSessionId);
  const payload = new Uint8Array(await file.arrayBuffer());
  const info = await colorWorker.preparePackage(nextSessionId, {
    payload,
    name: file.name,
    type: file.type,
    transferId: createTransferId(),
  });
  setSendInfo(info);
  setCurrentSymbolId(0);
}

async function renderSymbol(symbolId) {
  const { frameBytes } = await colorWorker.getFrame(sendSessionId, symbolId);
  renderColorMatrixV2(canvasRef.current, frameBytes, { cellSize: Math.max(8, cellSize) });
}
```

Animasyon sayacı `emittedSymbols` üzerinde dönsün ve 140 ms aralık korunsun. Dosya değişiminde eski worker oturumu dispose edilsin. `sourceCount === 1` ise PNG, paylaş ve pano açık; aksi halde üçü disabled olsun. PNG daima `symbolId=0` karesini yeniden çizip sonra export etsin; animasyondaki rastgele kareyi export etmesin.

- [ ] **Step 4: Alım tarafını güvenli oturum ve yeni kamera hook'una bağla**

```js
const receiveSessionRef = useRef(createColorReceiveSession());
const verifiedUrlRef = useRef(null);

const handleColorFrame = useCallback(async ({ frame }) => {
  const accepted = receiveSessionRef.current.accept(frame);
  setReceiveProgress(receiveSessionRef.current.progress());
  if (!accepted.accepted || receiveSessionRef.current.getState() !== 'complete') return;
  setReceiveStatus('verifying');
  try {
    const assembled = await receiveSessionRef.current.assemble();
    const opened = await openColorPackageV2(assembled.bytes, {
      expectedTransferId: assembled.metadata.transferId,
    });
    if (verifiedUrlRef.current) URL.revokeObjectURL(verifiedUrlRef.current);
    verifiedUrlRef.current = URL.createObjectURL(new Blob([opened.payload], { type: opened.type }));
    setVerifiedResult(createDownloadResult(opened, verifiedUrlRef.current));
  } catch (error) {
    setReceiveError(colorErrorMessage(error));
  }
}, []);

useEffect(() => () => {
  colorWorker.disposeSession(sendSessionId);
  if (verifiedUrlRef.current) URL.revokeObjectURL(verifiedUrlRef.current);
}, [colorWorker, sendSessionId]);
```

`useColorQrScanner` yalnızca Al/Kamera sekmesi açıkken ve doğrulanmış sonuç yokken enabled olsun. Dosyadan görsel çözme aynı worker `decodeImage` yolunu kullansın. Eski CQF1 tek kare okuyucu ayrı legacy dalında kalsın ve otomatik indirmek yerine `Eski biçim doğrulanamadı; dosyayı elle indir` düğmesi sunsun. Eski çok kareli CQF1 otomatik birleştirilmesin.

- [ ] **Step 5: Inline renkli tarama ve video çözme kodunu sayfadan kaldır**

`ColorQrLabPage.jsx` içinden aşağıdaki sorumlulukları kaldır:

- 120 ms `setInterval` ile altı crop taraması
- Inline 380 bayt parçalama ve yüzde 100 XOR parite üretimi
- `collectedChunksRef` ile kimliksiz birleştirme
- Sayfa içindeki MediaRecorder renkli video uygulaması; Task 10 tamamlanana kadar video düğmesi `Renkli video motoru hazırlanıyor` açıklamasıyla kapalı kalsın
- Sayfa içindeki seek tabanlı renkli video çözme; Task 11 tamamlanana kadar renkli video dosyası seçildiğinde deneysel motorun hazır olmadığı mesajı gösterilsin

Refaktör sonrasında sayfada kalan çekirdek bağlantılar şu modüllerden gelsin; eski `color-frame-v1`, inline XOR/parçalama ve sayfa içi MediaRecorder importları kalmasın:

```js
import { openColorPackageV2 } from './optical/color-package-v2.js';
import { createColorReceiveSession } from './optical/color-receive-session.js';
import { renderColorMatrixV2 } from './optical/color-matrix-canvas.js';
import { useColorQrScanner } from './hooks/useColorQrScanner.js';
import { createColorQrWorkerClient } from './workers/color-qr-client.js';
```

- [ ] **Step 6: Laboratuvar, CQF2, CRF2 ve kamera testlerini birlikte çalıştır**

Run: `cmd /c npx vitest run src/__tests__/color-qr-lab-ui.test.jsx src/__tests__/color-package-v2.test.js src/__tests__/color-frame-v2.test.js src/__tests__/color-qr-scanner.test.jsx --pool=threads --maxWorkers=1`

Expected: PASS; yeni laboratuvar akışı ve çekirdek testleri geçer.

- [ ] **Step 7: Git varsa laboratuvar geçişini commit et**

```powershell
git add src/ColorQrLabPage.jsx src/App.css src/__tests__/color-qr-lab-ui.test.jsx
git commit -m 'refactor: move color QR lab to verified engine'
```

---

### Task 9: BTA sürüm 2 ile şifrelemeden önce sıkıştırma

**Files:**
- Modify: `src/crypto/encrypted-container.js`
- Modify: `src/__tests__/encrypted-container.test.js`

**Interfaces:**
- Consumes: `PreparedPayload` from Task 1.
- Produces: existing `encryptFile(file)` unchanged for BTA version 1; new `encryptPreparedFile(file, preparedPayload)` for BTA version 2; `decryptContainer` reads both versions.
- BTA2 metadata: `{ name, type, compression, originalSize, storedSize, originalSha256, storedSha256 }`.

- [ ] **Step 1: BTA2 sıkıştırma ve BTA1 geriye uyum testlerini ekle**

```js
import { prepareTransferPayload } from '../transfer/payload-compression.js';
import {
  decryptContainer,
  encryptFile,
  encryptPreparedFile,
} from '../crypto/encrypted-container.js';

it('BTA2 sıkıştırılmış veriyi özgün ad, tür ve içerikle açar', async () => {
  const original = new Uint8Array(100 * 1024).fill(65);
  const file = new File([original], 'İstanbul-belgesi.txt', { type: 'text/plain' });
  const prepared = await prepareTransferPayload(original);
  const encrypted = await encryptPreparedFile(file, prepared);
  const bytes = new Uint8Array(await encrypted.blob.arrayBuffer());
  expect(bytes[4]).toBe(2);
  const opened = await decryptContainer(bytes, encrypted.keyText);
  expect(opened.file.name).toBe(file.name);
  expect(new Uint8Array(await opened.file.arrayBuffer())).toEqual(original);
  expect(opened.compression).toBe('zlib');
});

it('encryptFile varsayılan olarak BTA1 üretmeye devam eder', async () => {
  const encrypted = await encryptFile(new File(['legacy'], 'legacy.txt'));
  const bytes = new Uint8Array(await encrypted.blob.arrayBuffer());
  expect(bytes[4]).toBe(1);
});

it('BTA2 stored hash bozulursa dosya üretmez', async () => {
  const file = new File([new Uint8Array(4096).fill(9)], 'kanıt.bin');
  const prepared = await prepareTransferPayload(new Uint8Array(await file.arrayBuffer()));
  const encrypted = await encryptPreparedFile(file, { ...prepared, storedSha256: 'A'.repeat(43) });
  await expect(decryptContainer(await encrypted.blob.arrayBuffer(), encrypted.keyText))
    .rejects.toMatchObject({ code: 'HASH_MISMATCH' });
});
```

Mevcut `desteklenmeyen sürüm` testindeki değiştirilmiş sürüm baytı `2` yerine `3` olsun. Dondurulmuş BTA1 fixture testi aynen korunsun.

- [ ] **Step 2: `encryptPreparedFile` olmadığı için testi kırmızı çalıştır**

Run: `cmd /c npx vitest run src/__tests__/encrypted-container.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; `encryptPreparedFile` export edilmez.

- [ ] **Step 3: BTA1 üretimini bozmadan ortak şifreleme çekirdeğini çıkar**

```js
export async function encryptFile(file) {
  const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
  const sha256 = await sha256Base64Url(bytes);
  return encryptBytes(file, bytes, {
    version: 1,
    metadata: { name: file.name, type: file.type, size: bytes.length, sha256 },
    resultSha256: sha256,
  });
}

export async function encryptPreparedFile(file, prepared) {
  validatePreparedPayload(file, prepared);
  return encryptBytes(file, prepared.storedBytes, {
    version: 2,
    metadata: {
      name: file.name,
      type: file.type,
      compression: prepared.compression,
      originalSize: prepared.originalSize,
      storedSize: prepared.storedSize,
      originalSha256: prepared.originalSha256,
      storedSha256: prepared.storedSha256,
    },
    resultSha256: prepared.originalSha256,
  });
}
```

`validatePreparedPayload` dosya boyutunu `originalSize` ile, `storedBytes.length` değerini `storedSize` ile, sıkıştırma türünü `none|zlib` ile ve her iki hash'i 43 karakter Base64URL biçimiyle doğrulasın. `encryptBytes` mevcut AES-GCM, IV, key ve BTA1 magic üretimini kullansın; yalnızca sürüm baytını parametreden alsın.

- [ ] **Step 4: `decryptContainer` içinde sürüm 1 ve 2 metadata yollarını ayır**

```js
const version = container[MAGIC.length];
if (version !== 1 && version !== 2) throw containerError('UNSUPPORTED_VERSION');

const storedBytes = plaintext.subarray(metadataEnd);
if (version === 1) return openVersion1(metadata, storedBytes);

if (storedBytes.length !== metadata.storedSize || await sha256Base64Url(storedBytes) !== metadata.storedSha256) {
  throw containerError('HASH_MISMATCH');
}
let originalBytes;
try {
  originalBytes = await restoreTransferPayload(storedBytes, metadata);
} catch {
  throw containerError('HASH_MISMATCH');
}
return {
  file: new File([originalBytes], metadata.name, { type: metadata.type }),
  sha256: metadata.originalSha256,
  compression: metadata.compression,
};
```

`parseMetadata` sürüme göre zorunlu alanları doğrulasın. BTA1 için `name/type/size/sha256`, BTA2 için Task 9 metadata alanları dışında değer kabul etmesin. Boyutlar mevcut `MAX_ENCRYPTED_INPUT_BYTES` ve 16 KiB metadata sınırlarını korusun.

- [ ] **Step 5: BTA testlerinin tamamını çalıştır**

Run: `cmd /c npx vitest run src/__tests__/encrypted-container.test.js --pool=threads --maxWorkers=1`

Expected: PASS; dondurulmuş BTA1 fixture dahil bütün testler geçer.

- [ ] **Step 6: Git varsa BTA2 görevini commit et**

```powershell
git add src/crypto/encrypted-container.js src/__tests__/encrypted-container.test.js
git commit -m 'feat: add compressed BTA version 2 containers'
```

---

### Task 10: Gerçek renkli QR video üreticisi

**Files:**
- Create: `src/video/create-color-qr-video.js`
- Create: `src/__tests__/create-color-qr-video.test.js`
- Modify: `src/optical/profiles.js`
- Modify: `src/video/create-qr-video.js`
- Modify: `src/__tests__/create-qr-video-v4.test.js`

**Interfaces:**
- Consumes: worker client, `encryptPreparedFile`, `renderColorMatrixV2`, `getQrRegions`, MediaRecorder.
- Produces: `createColorQrVideo(file, options, onProgress): Promise<QrVideoResult>` with the same base result fields as `createQrVideo` plus `compressionStats` and `isColor: true`.
- Produces: `recordPreparedColorSession({ client, sessionId, optical, options, onProgress, resultMetadata? }): Promise<RecordedColorVideo>`; laboratuvarın önceden hazırlanmış şifresiz CQF2 oturumunu yeniden paketlemeden kaydeder.
- `createQrVideo` delegates immediately when `profile.isColor === true`.

- [ ] **Step 1: Renkli üreticinin standart QR kütüphanesini kullanmadığını test et**

```js
const { qrToCanvasMock, renderColorMatrixMock } = vi.hoisted(() => ({
  qrToCanvasMock: vi.fn(),
  renderColorMatrixMock: vi.fn(),
}));
vi.mock('qrcode', () => ({ default: { toCanvas: qrToCanvasMock } }));
vi.mock('../optical/color-matrix-canvas.js', () => ({ renderColorMatrixV2: renderColorMatrixMock }));

it('color_balanced profilde CRF2 matrisleri çizer ve standart QRCode çağırmaz', async () => {
  const result = await createQrVideo(new File(['renkli belge'], 'belge.txt'), {
    profileId: 'color_balanced',
    workerClient: fakePreparedColorWorker({ emittedSymbols: 2, sourceCount: 1 }),
  });
  expect(renderColorMatrixMock).toHaveBeenCalled();
  expect(qrToCanvasMock).not.toHaveBeenCalled();
  expect(result).toMatchObject({ profileId: 'color_balanced', isColor: true });
});

it('balanced profilde mevcut standart QR üretimini korur', async () => {
  await createQrVideo(new File(['normal belge'], 'belge.txt'), { profileId: 'balanced' });
  expect(qrToCanvasMock).toHaveBeenCalled();
  expect(renderColorMatrixMock).not.toHaveBeenCalled();
});
```

Testte canvas, captureStream, MediaRecorder ve timer mockları mevcut `create-qr-video-v4.test.js` desenini kullansın. Fake worker sırasıyla `preparePayload`, `prepareOptical` ve `getFrame` sonuçlarını döndürsün.

- [ ] **Step 2: Renkli üretici olmadığı için testi kırmızı doğrula**

Run: `cmd /c npx vitest run src/__tests__/create-color-qr-video.test.js src/__tests__/create-qr-video-v4.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; renkli profil standart QR yoluna girer veya kapasite hatası üretir.

- [ ] **Step 3: Güvenli renkli profil değerlerini tanımla**

```js
color_balanced: Object.freeze({
  id: 'color_balanced',
  label: 'Renkli Dengeli (Deneysel)',
  width: 1920,
  height: 1080,
  fps: 12,
  qrCount: 2,
  symbolBytes: 380,
  emissionRatio: 1.30,
  holdFrames: 2,
  isColor: true,
}),
```

`estimateOpticalVideo` mevcut formülü kullanmaya devam etsin; `holdFrames` değerini süreye dahil etsin: `durationSeconds = Math.ceil(videoFrames * holdFrames / fps)`.

- [ ] **Step 4: Renkli video üretim akışını uygula**

```js
export async function createColorQrVideo(file, options = {}, onProgress = null) {
  const profile = getOpticalProfile('color_balanced');
  const client = options.workerClient ?? createColorQrWorkerClient();
  const sessionId = `color-video:${crypto.randomUUID()}`;
  try {
    report(onProgress, 'compressing', 0);
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const prepared = await client.preparePayload(sessionId, new Uint8Array(originalBytes));
    report(onProgress, 'compressing', 100);
    const encrypted = await encryptPreparedFile(file, prepared);
    const encryptedBytes = new Uint8Array(await encrypted.blob.arrayBuffer());
    const optical = await client.prepareOptical(sessionId, encryptedBytes, {
      transferId: encrypted.transferId,
      blockBytes: profile.symbolBytes,
      emissionRatio: profile.emissionRatio,
    });
    return await recordPreparedColorSession({
      client,
      sessionId,
      optical,
      options: { ...options, profile },
      onProgress,
      resultMetadata: {
        keyText: encrypted.keyText,
        transferId: encrypted.transferId,
        sha256: encrypted.sha256,
        compressionStats: {
          compression: prepared.compression,
          originalSize: prepared.originalSize,
          storedSize: prepared.storedSize,
          savedPercent: prepared.savedPercent,
        },
      },
    });
  } finally {
    client.disposeSession(sessionId);
    if (!options.workerClient) client.terminate();
  }
}

export async function recordPreparedColorSession({
  client,
  sessionId,
  optical,
  options = {},
  onProgress = null,
  resultMetadata = {},
}) {
  const profile = options.profile ?? getOpticalProfile('color_balanced');
  const schedule = buildColorSchedule(optical.emittedSymbols, profile.qrCount, profile.holdFrames);
  const recorded = await recordColorSchedule({
    client, sessionId, schedule, profile, onProgress, options,
  });
  return { ...recorded, ...resultMetadata, profileId: profile.id, isColor: true };
}

function buildColorSchedule(emittedSymbols, regionCount, holdFrames) {
  const schedule = [];
  for (let first = 0; first < emittedSymbols; first += regionCount) {
    const regions = Array.from({ length: regionCount }, (_, offset) => {
      const symbolId = first + offset;
      return symbolId < emittedSymbols ? symbolId : null;
    });
    for (let repeat = 0; repeat < holdFrames; repeat += 1) schedule.push(regions);
  }
  return schedule;
}
```

`recordColorSchedule` her sembol için `client.getFrame`, her bölge için `renderColorMatrixV2`, ana canvas için `imageSmoothingEnabled=false` kullansın. Her program adımında ana canvas önce beyaza temizlensin; son gruptaki `null` bölge boş bırakılarak önceki sembolün ekranda kalması engellensin. `recordPreparedColorSession` oturumu kapatmasın; yaşam döngüsü çağırana ait olsun. `resultMetadata` verilmezse laboratuvara yalnızca `blob`, süre, mime, profil ve `isColor` alanlarını döndürsün. Mevcut MediaRecorder mime sırası, 8 Mbps bitrate, gerçek zamanlı hedef saat, kurtarma store ve progress alanları korunacak.

- [ ] **Step 5: Ana üreticiyi sadece renkli profilde yönlendir**

```js
export async function createQrVideo(file, options = {}, onProgress = null) {
  const profile = getOpticalProfile(options.profileId ?? 'balanced');
  if (profile.isColor) return createColorQrVideo(file, options, onProgress);
  return createStandardQrVideo(file, profile, options, onProgress);
}
```

Mevcut `createQrVideo` gövdesini `createStandardQrVideo` özel fonksiyonuna taşı; standart profillerde çıktı şekli ve QRCode seçenekleri değişmesin.

- [ ] **Step 6: Renkli ve standart video üretim testlerini çalıştır**

Run: `cmd /c npx vitest run src/__tests__/create-color-qr-video.test.js src/__tests__/create-qr-video-v4.test.js src/__tests__/create-qr-video.test.js --pool=threads --maxWorkers=1`

Expected: PASS; renkli yol CRF2 kullanır, standart yollar mevcut QRCode testlerini geçer.

- [ ] **Step 7: Git varsa renkli üreticiyi commit et**

```powershell
git add src/video/create-color-qr-video.js src/optical/profiles.js src/video/create-qr-video.js src/__tests__/create-color-qr-video.test.js src/__tests__/create-qr-video-v4.test.js
git commit -m 'feat: generate real color QR videos'
```

---

### Task 11: Renkli video çözme ve profil yönlendirme

**Files:**
- Create: `src/video/decode-color-qr-video.js`
- Create: `src/__tests__/decode-color-qr-video.test.js`
- Modify: `src/video/decode-qr-video.js`
- Modify: `src/__tests__/decode-qr-video-v4.test.js`

**Interfaces:**
- Consumes: worker client, `createColorReceiveSession`, video seek helpers.
- Produces: `probeColorQrVideo(file, options): Promise<boolean>`, `decodeColorQrVideo(file, callbacks, signal, options): Promise<Uint8Array>`.
- `decodeQrVideo` probes color first for at most three early samples; true ise renkli çözücüye, false ise mevcut standard çözücüye gider.
- Test-only option: `options.frameBytes: Uint8Array[]` bypasses DOM video sampling.

- [ ] **Step 1: Kayıp kare kurtarma, erken bitirme ve abort testlerini yaz**

```js
import { createFountainEncoder } from '../optical/fountain.js';
import { createColorPackageV2, openColorPackageV2 } from '../optical/color-package-v2.js';
import { encodeColorFrameV2 } from '../optical/color-frame-v2.js';
import { decodeColorQrVideo } from '../video/decode-color-qr-video.js';

it('CRF2 karelerinden şifreli kapsayıcı baytlarını tamamlar', async () => {
  const input = Uint8Array.from({ length: 8 * 380 }, (_, index) => index & 0xff);
  const encoder = await createFountainEncoder(input, {
    transferId: 'Ab12Cd34Ef56', blockBytes: 380, emissionRatio: 1.30,
  });
  const frameBytes = encoder.symbols()
    .filter((symbol) => symbol.symbolId !== 0)
    .map((symbol) => encodeColorFrameV2(encoder.metadata, symbol));
  await expect(decodeColorQrVideo(null, {}, null, { frameBytes })).resolves.toEqual(input);
});

it('paket tamamlanınca kalan test karelerini işlemez', async () => {
  const input = new Uint8Array(380).fill(5);
  const encoder = await createFountainEncoder(input, {
    transferId: 'Ab12Cd34Ef56', blockBytes: 380, emissionRatio: 1.30,
  });
  const completeFrame = encodeColorFrameV2(encoder.metadata, encoder.symbol(0));
  await expect(decodeColorQrVideo(null, {}, null, {
    frameBytes: [completeFrame, new Uint8Array([1])],
  })).resolves.toEqual(input);
});

it.each([10 * 1024, 100 * 1024])('%i baytlık CQF2 dosyasını ad, tür ve içerikle açar', async (size) => {
  const payload = new Uint8Array(size).fill(65);
  const transferId = 'Ab12Cd34Ef56';
  const created = await createColorPackageV2({
    payload, name: `örnek-${size}.txt`, type: 'text/plain', transferId,
  });
  const encoder = await createFountainEncoder(created.containerBytes, {
    transferId, blockBytes: 380, emissionRatio: 1.30,
  });
  const frameBytes = encoder.symbols()
    .map((symbol) => encodeColorFrameV2(encoder.metadata, symbol));
  const decoded = await decodeColorQrVideo(null, {}, null, { frameBytes });
  const opened = await openColorPackageV2(decoded, { expectedTransferId: transferId });
  expect(opened).toMatchObject({ name: `örnek-${size}.txt`, type: 'text/plain' });
  expect(opened.payload).toEqual(payload);
});

it('AbortSignal iptalinde ABORTED hatası verir', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(decodeColorQrVideo(new File(['video'], 'renkli.webm'), {}, controller.signal))
    .rejects.toMatchObject({ code: 'ABORTED' });
});
```

- [ ] **Step 2: Renkli decoder olmadığı için testi kırmızı doğrula**

Run: `cmd /c npx vitest run src/__tests__/decode-color-qr-video.test.js --pool=threads --maxWorkers=1`

Expected: FAIL; renkli decoder modülü bulunamaz.

- [ ] **Step 3: Test kareleri ve gerçek video için tek oturumlu decoder'ı uygula**

```js
export async function decodeColorQrVideo(file, callbacks = {}, signal, options = {}) {
  const session = createColorReceiveSession();
  if (options.frameBytes) {
    for (const bytes of options.frameBytes) {
      throwIfAborted(signal);
      const result = acceptParsedFrame(session, parseColorFrameV2(bytes), callbacks);
      if (result.complete) return (await session.assemble()).bytes;
    }
    throw incompleteError(session.progress());
  }

  return scanVideoFrames(file, async (imageData, timing) => {
    throwIfAborted(signal);
    const decoded = await options.workerClient.decodeImage(options.sessionId, imageData);
    callbacks.onScanProgress?.(timing);
    if (!decoded?.frame) return null;
    const accepted = session.accept(decoded.frame);
    callbacks.onProgress?.(session.progress());
    return accepted.accepted && session.getState() === 'complete'
      ? (await session.assemble()).bytes
      : null;
  }, { stepSeconds: 0.08, signal });
}
```

`scanVideoFrames` video metadata yüklenmesini 3 saniye timeout ile sınırlandırsın, her seek için `seeked` veya 250 ms timeout beklesin, görüntüyü en fazla 1280×720 tuvale çeksin, `duration - 0.02` son kare sınırını korusun ve sonuç oluşunca döngüyü hemen bitirsin. Eksik sonuç `INCOMPLETE_TRANSFER`, profil algılanmaması `VIDEO_PROFILE_UNDETECTED` kodu versin.

- [ ] **Step 4: İlk örneklerle ucuz renkli video probunu uygula**

```js
export async function probeColorQrVideo(file, { workerClient, sessionId, signal } = {}) {
  const samples = [0.05, 0.20, 0.40];
  for (const second of samples) {
    throwIfAborted(signal);
    const imageData = await readVideoFrame(file, second, { maxWidth: 640, maxHeight: 360 });
    const decoded = await workerClient.decodeImage(sessionId, imageData);
    if (decoded?.frame?.protocolVersion === 'CRF2') return true;
  }
  return false;
}
```

Prob başarısız olduğunda renkli çözücü tüm video boyunca çalıştırılmasın. `decodeQrVideo` renkli worker istemcisini bir kez oluşturup probe ve decode arasında paylaşsın; standart yol seçildiğinde renkli session dispose edilip worker kapatılsın.

- [ ] **Step 5: Router regresyon testini ekle**

```js
it('CRF2 probu true ise standart QR decoder yerine renkli decoderı çağırır', async () => {
  probeColorMock.mockResolvedValue(true);
  decodeColorMock.mockResolvedValue(new Uint8Array([66, 84, 65, 49]));
  const bytes = await decodeQrVideo(new File(['video'], 'renkli.webm'));
  expect(bytes).toEqual(new Uint8Array([66, 84, 65, 49]));
  expect(standardDecodeImageMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Renkli ve standart decoder testlerini birlikte çalıştır**

Run: `cmd /c npx vitest run src/__tests__/decode-color-qr-video.test.js src/__tests__/decode-qr-video-v4.test.js src/__tests__/video-decode-state.test.js --pool=threads --maxWorkers=1`

Expected: PASS; renkli yönlendirme ve standart video regresyonları geçer.

- [ ] **Step 7: Git varsa decoder görevini commit et**

```powershell
git add src/video/decode-color-qr-video.js src/video/decode-qr-video.js src/__tests__/decode-color-qr-video.test.js src/__tests__/decode-qr-video-v4.test.js
git commit -m 'feat: decode and route color QR videos'
```

---

### Task 12: Ana QR Video arayüzü ve laboratuvar video bağlantısı

**Files:**
- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/ColorQrLabPage.jsx`
- Modify: `src/App.css`
- Modify: `src/__tests__/video-transfer-ui.test.jsx`
- Modify: `src/__tests__/color-qr-lab-ui.test.jsx`

**Interfaces:**
- Consumes: color result fields `{ isColor, compressionStats, durationSeconds, profileId }`; decoder transparently returns BTA bytes.
- Produces: accessible experimental profile UI, compression stats, re-enabled lab color video create/open controls.

- [ ] **Step 1: Deneysel profil ve sıkıştırma istatistiği UI testlerini yaz**

```jsx
it('Renkli Dengeli profilini deneysel açıklamayla sunar ama Dengeli varsayılan kalır', () => {
  render(<VideoTransferPanel view='create' />);
  expect(screen.getByDisplayValue('balanced')).toBeChecked();
  expect(screen.getByDisplayValue('color_balanced')).not.toBeChecked();
  expect(screen.getByText('Gerçek dört renkli matris · deneysel cihaz uyumu')).toBeInTheDocument();
});

it('renkli video sonucunda sıkıştırma tasarrufunu gösterir', async () => {
  createQrVideoMock.mockResolvedValueOnce({
    ...DEFAULT_VIDEO_RESULT,
    isColor: true,
    profileId: 'color_balanced',
    compressionStats: { originalSize: 102400, storedSize: 4096, savedPercent: 96 },
  });
  render(<VideoTransferPanel view='create' />);
  await selectFileChooseColorAndCreate();
  expect(await screen.findByText('Renkli QR verisi %96 küçültüldü')).toBeInTheDocument();
});
```

- [ ] **Step 2: UI testlerinin yeni metinler olmadığı için kırmızı olduğunu doğrula**

Run: `cmd /c npx vitest run src/__tests__/video-transfer-ui.test.jsx src/__tests__/color-qr-lab-ui.test.jsx --pool=threads --maxWorkers=1`

Expected: FAIL; deneysel profil açıklaması ve sıkıştırma sonucu bulunmaz.

- [ ] **Step 3: Profil açıklamalarını kimliğe göre açıkça üret**

```js
const PROFILE_DESCRIPTIONS = Object.freeze({
  balanced: 'Daha hızlı · iki standart QR',
  compatible: 'Daha geniş cihaz uyumu · tek standart QR',
  color_balanced: 'Gerçek dört renkli matris · deneysel cihaz uyumu',
});
```

Mevcut `profile.id === 'balanced' ? ... : ...` ifadesini kaldır ve her profil için bu sabit sözlüğü kullan. Renkli profil etiketinin yanında `Deneysel` rozeti ve “Gerçek telefon testleri tamamlanana kadar Dengeli profil önerilir.” açıklaması göster.

- [ ] **Step 4: Sonuç ve ilerleme alanlarını renkli profile bağla**

```js
const PROGRESS_LABELS = Object.freeze({
  compressing: 'Sıkıştırma',
  encrypting: 'Şifreleme',
  preparing: 'Kareleri hazırlama',
  recording: 'Videoyu kaydetme',
});

function getCompressionMessage(result) {
  if (!result?.isColor || !result.compressionStats) return null;
  return result.compressionStats.savedPercent > 0
    ? `Renkli QR verisi %${result.compressionStats.savedPercent} küçültüldü`
    : 'Dosya zaten sıkıştırılmış; özgün boyut korundu';
}
```

`compressing` yalnızca renkli yol çağırdığında ilerleme listesine eklensin. Standart profillerde mevcut dört aşama, sıralama ve metinler değişmesin.

- [ ] **Step 5: Laboratuvar video düğmelerini gerçek üretici ve çözücüyle yeniden aç**

Laboratuvar video oluşturma düğmesi `createColorQrVideo` çağırmasın; laboratuvar şifresiz CQF2 taşıdığı için Task 8'de hazırlanmış worker oturumunu kullansın:

```js
const recorded = await recordPreparedColorSession({
  client: colorWorker,
  sessionId: sendSessionId,
  optical: sendInfo,
  options: { profile: getOpticalProfile('color_balanced') },
  onProgress: setVideoProgress,
});
replaceVideoUrl(URL.createObjectURL(recorded.blob));

const receiveVideoSessionId = `lab-video:${crypto.randomUUID()}`;
const containerBytes = await decodeColorQrVideo(file, {
  onProgress: setReceiveProgress,
}, abortController.signal, {
  workerClient: colorWorker,
  sessionId: receiveVideoSessionId,
});
const opened = await openColorPackageV2(containerBytes);
setVerifiedResult(createDownloadResult(opened));
colorWorker.disposeSession(receiveVideoSessionId);
```

`replaceVideoUrl` önceki object URL'yi yenisini atamadan önce iptal etsin; component unmount sırasında son video URL'si de iptal edilsin. Decode oturumu `finally` içinde dispose edilsin. Ana QR Video akışındaki BTA anahtar ekranı laboratuvara taşınmamalı.

- [ ] **Step 6: Ana ve laboratuvar UI testlerini çalıştır**

Run: `cmd /c npx vitest run src/__tests__/video-transfer-ui.test.jsx src/__tests__/color-qr-lab-ui.test.jsx src/__tests__/receive-encrypted-video.test.jsx --pool=threads --maxWorkers=1`

Expected: PASS; standart anahtar akışı, deneysel profil ve şifresiz laboratuvar video akışı birlikte geçer.

- [ ] **Step 7: Git varsa UI entegrasyonunu commit et**

```powershell
git add src/VideoTransferPanel.jsx src/ColorQrLabPage.jsx src/App.css src/__tests__/video-transfer-ui.test.jsx src/__tests__/color-qr-lab-ui.test.jsx
git commit -m 'feat: expose verified experimental color QR profile'
```

---

### Task 13: Performans kanıtı, tam regresyon ve gerçek telefon kontrolü

**Files:**
- Create: `scripts/benchmark-color-qr.mjs`
- Create: `docs/color-qr-manual-test.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `prepareTransferPayload`, CQF2/CRF2, optical profile estimator.
- Produces: tekrarlanabilir konsol benchmarkı ve doldurulabilir gerçek cihaz kontrol belgesi.

- [ ] **Step 1: Otomatik benchmark scriptini oluştur**

```js
import { performance } from 'node:perf_hooks';
import { prepareTransferPayload } from '../src/transfer/payload-compression.js';

const BLOCK_BYTES = 380;
const EMISSION_RATIO = 1.30;

for (const size of [10 * 1024, 100 * 1024, 1024 * 1024]) {
  for (const [kind, bytes] of [
    ['compressible', new Uint8Array(size).fill(65)],
    ['incompressible', deterministicNoise(size)],
  ]) {
    const startedAt = performance.now();
    const prepared = await prepareTransferPayload(bytes);
    const sourceCount = Math.max(1, Math.ceil(prepared.storedSize / BLOCK_BYTES));
    const emittedSymbols = Math.ceil(sourceCount * EMISSION_RATIO);
    console.log(JSON.stringify({
      size, kind,
      compression: prepared.compression,
      storedSize: prepared.storedSize,
      savedPercent: prepared.savedPercent,
      sourceCount,
      emittedSymbols,
      prepareMs: Number((performance.now() - startedAt).toFixed(2)),
    }));
  }
}
```

`deterministicNoise` Task 1 testindeki xorshift algoritmasını kullansın. Script 100 KB compressible satırında `savedPercent >= 90`, incompressible satırında `compression === 'none'` değilse `process.exitCode = 1` yapsın.

- [ ] **Step 2: Benchmarkı çalıştır ve eşikleri doğrula**

Run: `node scripts/benchmark-color-qr.mjs`

Expected: 10 KB, 100 KB ve 1 MiB için altı JSON satırı; 100 KB sıkıştırılabilir veri en az yüzde 90 küçülür, sıkıştırılamayan veri `none` kalır, çıkış kodu 0 olur.

- [ ] **Step 3: Gerçek telefon kontrol belgesini yaz**

`docs/color-qr-manual-test.md` şu doldurulabilir bölümleri içersin:

```markdown
# Renkli QR Gerçek Cihaz Kontrolü

## Cihaz bilgisi
- Cihaz / işletim sistemi:
- Tarayıcı / sürüm:
- Ekran parlaklığı:
- Ortam: Kontrollü ışık / düşük ışık / yansıma

## 10 KB testi
- 5 deneme sonucu: Başarılı __ / 5
- Özgün ad, MIME ve SHA-256 eşleşti: Evet / Hayır
- Arayüz tarama sırasında kullanılabildi: Evet / Hayır

## 100 KB testi
- 5 deneme sonucu: Başarılı __ / 5
- Özgün ad, MIME ve SHA-256 eşleşti: Evet / Hayır
- Video hazırlama hedef süresi + 2 saniye içinde: Evet / Hayır

## Hata kaydı
- Görülen hata kodu:
- Eksik/kabul edilen sembol:
- Ekran görüntüsü veya video adı:
```

Android kontrollü ışıkta 10 KB için 5/5 ve 100 KB için en az 4/5; iPhone Safari için aynı eşikler sağlanmadan ana QR Video renkli profilinin deneysel kapısı açılmasın.

- [ ] **Step 4: Bütün test paketini tek worker ile çalıştır**

Run: `cmd /c npx vitest run --pool=threads --maxWorkers=1`

Expected: Bütün test dosyaları PASS; unhandled worker timeout veya canvas hatası test sonucu olarak kalmaz.

- [ ] **Step 5: Kod denetimini çalıştır ve yeni uyarıları temizle**

Run: `cmd /c npm run lint`

Expected: Exit code 0. Yeni dosyalarda unused import, eksik hook dependency veya erişilemeyen kod uyarısı bulunmaz. Önceden var olan uyarılar değiştirilmediyse raporlanır; yeni uyarı bırakılmaz.

- [ ] **Step 6: Üretim derlemesini çalıştır**

Run: `cmd /c npm run build`

Expected: Exit code 0; `color-qr.worker` üretim asset'i oluşur ve worker URL çözümleme hatası görülmez.

- [ ] **Step 7: Standart QR regresyonlarını ayrıca odaklı çalıştır**

Run: `cmd /c npx vitest run src/__tests__/create-qr-video.test.js src/__tests__/create-qr-video-v4.test.js src/__tests__/decode-qr-video-v4.test.js src/__tests__/receive-encrypted-video.test.jsx src/__tests__/encrypted-container.test.js --pool=threads --maxWorkers=1`

Expected: PASS; standart `Dengeli`, `Uyumlu`, QRF4 ve BTA1 yolları geçer.

- [ ] **Step 8: README'ye deneysel profil sınırlarını ekle**

README'ye şu bölümü ekle:

```markdown
## Renkli QR (deneysel)

Renkli QR, metin ve benzeri sıkıştırılabilen belgelerde kare sayısını azaltabilir. JPG,
PNG, MP4 ve ZIP gibi zaten sıkıştırılmış dosyalarda ek küçülme beklenmez. Varsayılan ve
önerilen profil **Dengeli** profildir.

Renkli profil, ekran ve kamera arasında dört renk kalibrasyonuna bağlıdır; gerçek cihaz
kontrolleri tamamlanana kadar deneysel kabul edilir. Birden fazla kare gerektiren aktarım
tek PNG olarak paylaşılamaz; canlı akış veya video kullanılmalıdır.
```

- [ ] **Step 9: Git varsa son doğrulama ve belge commitini oluştur**

```powershell
git add scripts/benchmark-color-qr.mjs docs/color-qr-manual-test.md README.md
git commit -m 'test: verify color QR performance and device workflow'
```

---

## Final Verification Checklist

- [ ] `cmd /c npx vitest run --pool=threads --maxWorkers=1` çıkış kodu 0.
- [ ] `cmd /c npm run lint` çıkış kodu 0 ve yeni uyarı yok.
- [ ] `cmd /c npm run build` çıkış kodu 0.
- [ ] `node scripts/benchmark-color-qr.mjs` çıkış kodu 0.
- [ ] 100 KB tekrarlı veri en az yüzde 90 küçülüyor.
- [ ] 100 KB sıkıştırılamayan veri `none` kalıyor.
- [ ] Bir bayt bozuk CRF2 kare `FRAME_CRC_MISMATCH` ile reddediliyor.
- [ ] Bir bayt bozuk tamamlanmış kapsayıcı indirilmiyor.
- [ ] Farklı `transferId` kareleri aynı alım oturumuna girmiyor.
- [ ] `sourceCount > 1` iken PNG, paylaş ve pano düğmeleri kapalı.
- [ ] Aynı anda yalnızca bir kamera decode işi çalışıyor.
- [ ] BTA1 dondurulmuş fixture hâlâ açılıyor.
- [ ] `balanced` ve `compatible` standart QR üretmeye devam ediyor.
- [ ] `color_balanced` standart QRCode kütüphanesini çağırmadan CRF2 matris üretiyor.
- [ ] Gerçek cihaz kontrollü ışık eşikleri manuel belgede kayıtlı.
