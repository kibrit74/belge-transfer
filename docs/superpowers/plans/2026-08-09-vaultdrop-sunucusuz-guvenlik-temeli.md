# VaultDrop Sunucusuz Güvenlik Temeli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Secure Link üzerinden sunucuda şifreli içerik saklamayı kaldırmak, BTA1 Şifreli Paket akışını tamamen yerel tutmak ve toplam 50 MiB işlem sınırıyla aylık kotayı doğru uygulamak.

**Architecture:** BTA1 şifreleme biçimi değişmeden kalır. İstemci yalnızca yöntem ve ham bayt miktarını kota API'sine yollar; dosya, paket, anahtar, dosya adı, MIME türü ve uzantı hiçbir sunucu yoluna girmez. Eski Secure Link yolları içeriksiz 410 yanıtına ve açıklayıcı bir emekliye-ayırma sayfasına dönüşür.

**Tech Stack:** React 19, Vite 8, Web Crypto AES-256-GCM, Express 5, Zod 4, Neon/PostgreSQL, Vitest 4, Testing Library, Supertest, Helmet 8.

## Global Constraints

- BTA1 biçimi ve mevcut .bta paketleriyle geriye uyumluluk korunacak.
- BTA2 oluşturulmayacak.
- Plus 250 MiB ve Kurumsal 1 GiB değerleri yalnız aylık toplam kotadır.
- Giriş yapmış kullanıcı tek Şifreli Paket işleminde en fazla 15 dosya ve toplam 50 MiB kullanabilir.
- Misafir kullanıcı tek dosya ve toplam 10 MiB kullanabilir.
- Aylık kullanım .bta başarıyla üretildiğinde kesinleşir.
- Paketleme ek yükü kotaya eklenmez; özgün seçimin ham toplamı kullanılır.
- Sunucu dosya, .bta, anahtar, dosya adı, QR içeriği veya encrypted_payload kabul etmeyecek.
- Alıcı tarafındaki .bta açma işlemi ağ isteği yapmayacak.
- Eski Secure Link kayıtları 005 geçişiyle kalıcı silinecek.
- Kod ve belgeler UTF-8 olacak; kullanıcı metinleri Türkçe kalacak.
- Çalışma klasörü şu anda Git deposu değildir. Kullanıcı ayrıca Git başlatmadıkça git init çalıştırılmayacak; aşağıdaki commit komutları yalnız bir Git deposu mevcutsa uygulanacak.

## Dosya Haritası

### Oluşturulacak dosyalar

- server/db/migrations/005_drop_secure_shares.sql — secure_shares tablosunu ileri yönlü kaldırır.
- server/db/migrations/006_drop_transfer_item_extension.sql — işlem özetlerinden dosya türü/uzantısı alanını kaldırır.
- server/security-headers.js — API Helmet ayarlarını tek yerde tanımlar.
- server/__tests__/security-headers.test.js — API güvenlik başlıklarını doğrular.
- src/__tests__/static-security-headers.test.js — üretim _headers dosyasını ve dış font kaldırılmasını doğrular.
- public/_headers — statik üretim barındırması için CSP ve tarayıcı güvenlik başlıklarını taşır.

### Değiştirilecek dosyalar

- src/transfer/usage-policy.js — misafir sınırı ve Şifreli Paket toplam 50 MiB sınırını uygular.
- src/__tests__/usage-policy.test.js — toplam sınır ve misafir davranışını doğrular.
- server/validation.js — istemci atlamasına karşı Secure Package toplam sınırını sunucuda tekrar doğrular.
- server/__tests__/validation.test.js — sunucu toplam sınırını doğrular.
- src/SecurePackagePanel.jsx — toplam sınır metni, iki adımlı paylaşım ve güvenli anahtar geri dönüşünü uygular.
- src/__tests__/secure-package-ui.test.jsx — kota kesinleşmesi, toplam sınır ve anahtar arayüzünü doğrular.
- src/transfer/activity-client.js — kota kesinleştirmeyi güvenli biçimde yeniden dener.
- src/__tests__/activity-client.test.js — yeniden deneme ve başarısızlık davranışını doğrular.
- server/runtime.js — Secure Link bellek deposunu kaldırır ve kota kesinleştirmeyi aynı sonuç için idempotent yapar.
- server/repositories.js — Secure Link SQL'ini kaldırır ve kota kesinleştirmeyi aynı sonuç için idempotent yapar.
- server/__tests__/runtime.test.js — aynı kesinleştirmenin iki kez güvenle çağrılmasını doğrular.
- server/__tests__/repositories.test.js — idempotent SQL kesinleştirme yolunu doğrular.
- server/app.js — Secure Link yollarını 410 yapar, içerik yükleme yolunu kaldırır ve Helmet ayarını kullanır.
- server/__tests__/secure-share-api.test.js — eski yükleme/açma testlerini 410 emeklilik testlerine dönüştürür.
- server/__tests__/auth-api.test.js — güvenlik başlığı ve toplam rezervasyon doğrulamasının uygulamaya bağlandığını korur.
- src/pages/SecureLinkReceivePage.jsx — eski bağlantılarda ağ isteği yapmayan bilgilendirme sayfasına dönüşür.
- src/__tests__/secure-link-receive-page.test.jsx — eski bağlantıda anahtar okumama ve fetch yapmama davranışını doğrular.
- src/MobileSharePanel.jsx — Güvenli Bağlantı seçeneğini Şifreli Paket ile değiştirir.
- src/__tests__/mobile-share-panel.test.jsx — mobilde Şifreli Paket ve QR Video seçeneklerini doğrular.
- src/App.css — kaldırılan Secure Link formlarının stillerini temizler; yeni anahtar geri dönüş alanını biçimlendirir.
- index.html — gereksiz Google Fonts bağlantılarını kaldırır.
- README.md — sunucusuz sınırları ve eski Secure Link kaldırılmasını açıklar.
- src/content/faqContent.js — 50 MiB'ı tek paketin toplam teknik sınırı olarak açıklar.
- src/pages/PricingPage.jsx — “dosya başına 50 MiB” ifadesini “tek paket toplamı 50 MiB” olarak düzeltir.
- src/__tests__/faq-page.test.jsx ve src/__tests__/pricing-page.test.jsx — yeni metinleri doğrular.

### Silinecek dosyalar

- src/transfer/secure-link-client.js
- src/__tests__/secure-link-client.test.js
- server/secure-shares.js
- server/__tests__/secure-shares.test.js

---

### Task 1: Şifreli Paket seçim sınırlarını tek kaynaktan uygula

**Files:**
- Modify: src/transfer/usage-policy.js
- Modify: src/__tests__/usage-policy.test.js
- Modify: server/validation.js
- Modify: server/__tests__/validation.test.js

**Interfaces:**
- Consumes: File benzeri nesnelerin size alanı ve method değeri.
- Produces: SECURE_PACKAGE_MAX_BYTES, GUEST_SECURE_PACKAGE_MAX_BYTES ve validateTransferSelection(files, { method, user }).
- Produces: transferReservationSchema içinde secure_package toplamı en fazla 50 MiB olan sunucu doğrulaması.

- [ ] **Step 1: İstemci sınırları için başarısız testleri yaz**

src/__tests__/usage-policy.test.js içindeki “dosya başına” testini toplam paket davranışıyla değiştir ve misafir testlerini ekle:

~~~js
it("üyeye en fazla 15 dosya ve toplam 50 MiB verir", () => {
  const files = [file(30 * 1024 * 1024), file(20 * 1024 * 1024)];
  expect(validateTransferSelection(files, {
    method: "secure_package",
    user: member,
  })).toHaveLength(2);
});

it("üyenin toplam 50 MiB aşımını reddeder", () => {
  const files = [file(30 * 1024 * 1024), file(20 * 1024 * 1024 + 1)];
  expect(() => validateTransferSelection(files, {
    method: "secure_package",
    user: member,
  })).toThrow("Şifreli Paket için toplam boyut en fazla 50 MiB olabilir.");
});

it("misafire tek dosya ve toplam 10 MiB verir", () => {
  expect(validateTransferSelection([file(10 * 1024 * 1024)], {
    method: "secure_package",
    user: null,
  })).toHaveLength(1);
});

it("misafirin ikinci dosyasını ve 10 MiB aşımını reddeder", () => {
  expect(() => validateTransferSelection([file(1), file(1)], {
    method: "secure_package",
    user: null,
  })).toThrow("Misafir kullanımında tek dosya");
  expect(() => validateTransferSelection([file(10 * 1024 * 1024 + 1)], {
    method: "secure_package",
    user: null,
  })).toThrow("en fazla 10 MiB");
});
~~~

- [ ] **Step 2: İstemci testinin beklenen nedenle başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- src/__tests__/usage-policy.test.js
~~~

Expected: FAIL; mevcut kod misafiri tamamen reddeder ve iki dosyanın toplam 50 MiB aşımını yakalamaz.

- [ ] **Step 3: İstemci politikasını en küçük kodla düzelt**

src/transfer/usage-policy.js içinde toplamları açık sabitlerle uygula:

~~~js
export const SECURE_PACKAGE_MAX_BYTES = 50 * MIB;
export const GUEST_SECURE_PACKAGE_MAX_BYTES = 10 * MIB;

export function validateTransferSelection(files, { method, user }) {
  const normalized = Array.from(files ?? []);
  if (normalized.length === 0) throw new RangeError("En az bir dosya seçmelisiniz.");

  const totalBytes = normalized.reduce((total, file) => total + file.size, 0);
  if (!user) {
    if (method !== "secure_package") {
      throw new RangeError("Aktarım için giriş yapmalısınız.");
    }
    if (normalized.length !== 1 || totalBytes > GUEST_SECURE_PACKAGE_MAX_BYTES) {
      throw new RangeError("Misafir kullanımında tek dosya ve en fazla 10 MiB gönderebilirsiniz.");
    }
    return normalized;
  }

  if (method === "live_qr" && normalized.length !== 1) {
    throw new RangeError("Canlı QR yalnızca tek dosya destekler.");
  }
  if (normalized.length > MEMBER_MAX_FILES) {
    throw new RangeError("En fazla " + MEMBER_MAX_FILES + " dosya seçebilirsiniz.");
  }
  if (method === "qr_video" && totalBytes > QR_VIDEO_MAX_BYTES) {
    throw new RangeError("QR Video için toplam boyut en fazla 15 MiB olabilir.");
  }
  if (method === "secure_package" && totalBytes > SECURE_PACKAGE_MAX_BYTES) {
    throw new RangeError("Şifreli Paket için toplam boyut en fazla 50 MiB olabilir.");
  }
  return normalized;
}
~~~

- [ ] **Step 4: Sunucu atlatma testini yaz**

server/__tests__/validation.test.js içine şu vaka eklenir:

~~~js
it("Şifreli Paket toplam 50 MiB aşımını reddeder", () => {
  expect(() => transferReservationSchema.parse({
    method: "secure_package",
    startedAt: "2026-08-09T10:00:00.000Z",
    items: [
      { extension: "bin", sizeBytes: 30 * 1024 * 1024 },
      { extension: "bin", sizeBytes: 20 * 1024 * 1024 + 1 },
    ],
  })).toThrow();
});
~~~

- [ ] **Step 5: Sunucu testinin başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- server/__tests__/validation.test.js
~~~

Expected: FAIL; her öğe 50 MiB altında olduğu için mevcut şema toplam aşımı kabul eder.

- [ ] **Step 6: Sunucu doğrulamasına toplam sınırı ekle**

server/validation.js içindeki validateMethodLimits fonksiyonuna ekle:

~~~js
if (value.method === "secure_package" && totalBytes > 50 * 1024 * 1024) {
  context.addIssue({
    code: "custom",
    path: ["items"],
    message: "Şifreli Paket toplam 50 MiB ile sınırlıdır.",
  });
}
~~~

- [ ] **Step 7: Dar testleri birlikte çalıştır**

Run:

~~~powershell
npm test -- src/__tests__/usage-policy.test.js server/__tests__/validation.test.js
~~~

Expected: PASS.

- [ ] **Step 8: Git varsa bağımsız görevi commit et**

~~~powershell
git rev-parse --is-inside-work-tree
git add src/transfer/usage-policy.js src/__tests__/usage-policy.test.js server/validation.js server/__tests__/validation.test.js
git commit -m "fix: enforce secure package total size limits"
~~~

Current workspace expectation: ilk komut Git deposu olmadığını bildirir; bu durumda git add ve git commit çalıştırılmaz.

---

### Task 2: İşlem özetinden dosya türü ve uzantısını kaldır

**Files:**
- Modify: src/transfer/activity-client.js
- Modify: src/__tests__/activity-client.test.js
- Modify: server/validation.js
- Modify: server/__tests__/validation.test.js
- Modify: server/repositories.js
- Modify: server/__tests__/repositories.test.js
- Modify: server/__tests__/auth-api.test.js
- Create: server/db/migrations/006_drop_transfer_item_extension.sql
- Modify: server/__tests__/migration-files.test.js

**Interfaces:**
- Consumes: buildTransferPayload({ method, direction, status, files, startedAt, completedAt }).
- Produces: items öğelerinde yalnız { sizeBytes: number }; dosya adı, MIME türü ve uzantı bulunmaz.
- Produces: transfer_items tablosunda yalnız sıra ve boyut bilgisi.

- [ ] **Step 1: İstemci özetinin uzantı göndermemesi için başarısız testi yaz**

src/__tests__/activity-client.test.js içindeki ilk testi şu beklentiyle değiştir:

~~~js
expect(payload.items).toEqual([{ sizeBytes: 5 }]);
expect(JSON.stringify(payload)).not.toContain("dava.dosyasi.PDF");
expect(JSON.stringify(payload)).not.toContain('"extension"');
expect(JSON.stringify(payload)).not.toContain("gizli");
~~~

- [ ] **Step 2: İstemci testinin mevcut extension alanıyla başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- src/__tests__/activity-client.test.js
~~~

Expected: FAIL; mevcut öğe { extension: "pdf", sizeBytes: 5 } döndürür.

- [ ] **Step 3: Dosya uzantısı üretimini istemciden kaldır**

src/transfer/activity-client.js içindeki getExtension fonksiyonunu sil ve buildTransferPayload öğelerini şöyle üret:

~~~js
items: Array.from(files).map((file) => ({
  sizeBytes: file.size,
})),
~~~

- [ ] **Step 4: Sunucu şemasının uzantısız öğeyi kabul etmesi için testi yaz**

server/__tests__/validation.test.js içine:

~~~js
it("işlem öğesinde yalnız boyutu tutar", () => {
  const parsed = transferReservationSchema.parse({
    method: "secure_package",
    startedAt: "2026-08-09T10:00:00.000Z",
    items: [{
      sizeBytes: 1200,
      extension: "pdf",
      name: "gizli-dosya.pdf",
      type: "application/pdf",
    }],
  });
  expect(parsed.items).toEqual([{ sizeBytes: 1200 }]);
});
~~~

- [ ] **Step 5: Şema testinin extension zorunluluğu nedeniyle başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- server/__tests__/validation.test.js
~~~

Expected: FAIL; mevcut itemSchema extension alanını zorunlu tutar.

- [ ] **Step 6: itemSchema'yı yalnız boyutla sınırla**

server/validation.js:

~~~js
const itemSchema = z.object({
  sizeBytes: z.number().int().min(0).max(50 * 1024 * 1024),
});
~~~

Zod'un varsayılan nesne davranışı name, type ve extension gibi fazladan alanları sonuçtan çıkarır.

- [ ] **Step 7: API testini sunucuda dosya türü kalmayacak şekilde güncelle**

server/__tests__/auth-api.test.js içindeki yasak alan testinin repository beklentisi:

~~~js
expect(repositories.recordTransfer).toHaveBeenCalledWith(
  expect.objectContaining({
    userId: "user-1",
    items: [{ sizeBytes: 1200 }],
  }),
);
const calls = JSON.stringify(repositories.recordTransfer.mock.calls);
expect(calls).not.toContain("gizli-dosya.pdf");
expect(calls).not.toContain("application/pdf");
expect(calls).not.toContain('"extension"');
~~~

- [ ] **Step 8: SQL repository testini uzantısız parametrelerle yaz**

server/__tests__/repositories.test.js içindeki kayıt ve rezervasyon testlerinde items yalnız sizeBytes taşımalı. Ayrıca:

~~~js
const allSql = query.mock.calls.map((call) => call[0]).join("\n");
const allParameters = JSON.stringify(query.mock.calls.map((call) => call[1]));
expect(allSql).not.toMatch(/\bextension\b/i);
expect(allParameters).not.toContain('"extension"');
expect(allParameters).not.toContain(".pdf");
~~~

- [ ] **Step 9: Repository SQL'inden extension alanını kaldır**

server/repositories.js reserveTransfer içinde safeItems:

~~~js
const safeItems = items.map((item, index) => ({
  ordinal: index + 1,
  size_bytes: item.sizeBytes,
}));
~~~

new_items CTE:

~~~sql
INSERT INTO transfer_items (batch_id, ordinal, size_bytes)
SELECT new_batch.id, item.ordinal, item.size_bytes
FROM new_batch
CROSS JOIN jsonb_to_recordset($6::jsonb)
  AS item(ordinal integer, size_bytes bigint)
~~~

recordTransfer döngüsü:

~~~js
await query(
  "INSERT INTO transfer_items (batch_id, ordinal, size_bytes) VALUES ($1, $2, $3)",
  [batchId, index + 1, item.sizeBytes],
);
~~~

- [ ] **Step 10: Veritabanı sütun kaldırma geçişi için başarısız testi yaz**

server/__tests__/migration-files.test.js içine:

~~~js
import { readFile } from "node:fs/promises";

it("işlem öğelerinden dosya uzantısı sütununu kaldırır", async () => {
  const sql = await readFile(
    new URL("../db/migrations/006_drop_transfer_item_extension.sql", import.meta.url),
    "utf8",
  );
  expect(sql).toMatch(/DROP COLUMN IF EXISTS extension/i);
});
~~~

- [ ] **Step 11: 006 geçişini ekle**

server/db/migrations/006_drop_transfer_item_extension.sql:

~~~sql
ALTER TABLE transfer_items
DROP COLUMN IF EXISTS extension;
~~~

- [ ] **Step 12: Metadata gizliliği testlerini ve taramayı çalıştır**

Run:

~~~powershell
npm test -- src/__tests__/activity-client.test.js server/__tests__/validation.test.js server/__tests__/auth-api.test.js server/__tests__/repositories.test.js server/__tests__/migration-files.test.js
rg -n "\bextension\b|\.extension" src/transfer/activity-client.js server/validation.js server/repositories.js
~~~

Expected: testler PASS; rg sonuç vermez.

- [ ] **Step 13: Git varsa bağımsız görevi commit et**

~~~powershell
git rev-parse --is-inside-work-tree
git add src/transfer/activity-client.js src/__tests__/activity-client.test.js server/validation.js server/repositories.js server/db/migrations/006_drop_transfer_item_extension.sql server/__tests__
git commit -m "security: remove file type from activity metadata"
~~~

Current workspace: Git yoksa commit adımları atlanır.

---

### Task 3: Secure Link sunucu depolamasını ve veritabanı tablosunu kaldır

**Files:**
- Modify: server/app.js
- Modify: server/runtime.js
- Modify: server/repositories.js
- Modify: server/validation.js
- Modify: server/__tests__/secure-share-api.test.js
- Create: server/db/migrations/005_drop_secure_shares.sql
- Modify: server/__tests__/migration-files.test.js
- Delete: server/secure-shares.js
- Delete: server/__tests__/secure-shares.test.js

**Interfaces:**
- Consumes: Eski /api/secure-shares, /api/secure-shares/:id ve /api/secure-shares/:id/unlock yolları.
- Produces: Her eski yol için HTTP 410 ve { code: "SECURE_LINK_RETIRED", error: "..." }.
- Produces: 005_drop_secure_shares.sql.

- [ ] **Step 1: Eski API'lerin içeriksiz 410 vermesi için başarısız testi yaz**

server/__tests__/secure-share-api.test.js içeriğini emeklilik davranışına dönüştür:

~~~js
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";

const config = {
  frontendOrigin: "http://localhost:5173",
  sessionCookieName: "vaultdrop_session",
  isProduction: false,
  googleClientId: "",
  googleClientSecret: "",
  neonAuthBaseUrl: "",
  neonAuthJwksUrl: "",
};

describe("kaldırılan Secure Link API", () => {
  it.each([
    ["post", "/api/secure-shares"],
    ["get", "/api/secure-shares/550e8400-e29b-41d4-a716-446655440000"],
    ["post", "/api/secure-shares/550e8400-e29b-41d4-a716-446655440000/unlock"],
  ])("%s %s için içeriksiz 410 döndürür", async (method, path) => {
    const repositories = {
      findUserBySessionHash: vi.fn().mockResolvedValue(null),
    };
    const response = await request(createApp({ config, repositories }))[method](path);
    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      code: "SECURE_LINK_RETIRED",
      error: "Güvenli bağlantı yöntemi artık desteklenmiyor.",
    });
    expect(JSON.stringify(response.body)).not.toContain("encrypted");
  });
});
~~~

- [ ] **Step 2: API testinin beklenen nedenle başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- server/__tests__/secure-share-api.test.js
~~~

Expected: FAIL; mevcut POST içerik yüklemeye, GET ise kayıt aramaya çalışır.

- [ ] **Step 3: 410 emeklilik yolunu gövde ayrıştırmadan önce ekle**

server/app.js içinde Helmet ve genel rate-limit sonrasında, kimlik ve CSRF katmanından önce:

~~~js
const retiredSecureLinkPaths = [
  "/api/secure-shares",
  "/api/secure-shares/:id",
  "/api/secure-shares/:id/unlock",
];

app.all(retiredSecureLinkPaths, (_request, response) => {
  response.status(410).json({
    code: "SECURE_LINK_RETIRED",
    error: "Güvenli bağlantı yöntemi artık desteklenmiyor.",
  });
});
~~~

Ardından app.js içindeki üç eski Secure Link route bloğunu, secure-share şema importlarını, createAccessCodeVerifier importunu ve yalnız bu akışta kullanılan unlockLimiter tanımını kaldır.

- [ ] **Step 4: Sunucu veri erişim yollarını kaldır**

server/runtime.js içinden secureShares Map'i, createSecureShare, getSecureShare, unlockSecureShare ve verifyAccessCode importunu kaldır.

server/repositories.js içinden verifyAccessCode importunu ve şu üç repository metodunu kaldır:

~~~text
createSecureShare
getSecureShare
unlockSecureShare
~~~

server/validation.js içinden şu dışa aktarımları kaldır:

~~~text
secureShareIdSchema
secureShareUploadSchema
secureShareUnlockSchema
~~~

server/secure-shares.js ve server/__tests__/secure-shares.test.js dosyalarını sil.

- [ ] **Step 5: Tablo kaldırma geçişi için başarısız testi yaz**

server/__tests__/migration-files.test.js içine, Task 2'de eklenen readFile importunu tekrar etmeden:

~~~js
it("Secure Link tablosunu ileri yönlü geçişle kaldırır", async () => {
  const sql = await readFile(
    new URL("../db/migrations/005_drop_secure_shares.sql", import.meta.url),
    "utf8",
  );
  expect(sql).toMatch(/DROP TABLE IF EXISTS secure_shares/i);
  expect(sql).not.toMatch(/encrypted_payload\s+BYTEA/i);
});
~~~

- [ ] **Step 6: Geçiş testinin dosya yokken başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- server/__tests__/migration-files.test.js
~~~

Expected: FAIL with ENOENT for 005_drop_secure_shares.sql.

- [ ] **Step 7: İleri yönlü kaldırma geçişini ekle**

server/db/migrations/005_drop_secure_shares.sql:

~~~sql
DROP TABLE IF EXISTS secure_shares;
~~~

004_secure_shares.sql değiştirilmez; mevcut kurulumların geçiş geçmişi korunur.

- [ ] **Step 8: Secure Link kalıntısı taraması ve dar testleri çalıştır**

Run:

~~~powershell
rg -n "encrypted_payload|createSecureShare|getSecureShare|unlockSecureShare|verifyAccessCode" server --glob "!db/migrations/004_secure_shares.sql"
npm test -- server/__tests__/secure-share-api.test.js server/__tests__/migration-files.test.js server/__tests__/auth-api.test.js
~~~

Expected: rg yalnız yeni negatif testte gerekirse eşleşir; testler PASS.

- [ ] **Step 9: Git varsa bağımsız görevi commit et**

~~~powershell
git rev-parse --is-inside-work-tree
git add server
git commit -m "refactor: retire server-backed secure links"
~~~

Current workspace: Git yoksa commit adımları atlanır.

---

### Task 4: Eski Secure Link istemcisini emekliye ayır ve mobil akışı yerel pakete çevir

**Files:**
- Modify: src/pages/SecureLinkReceivePage.jsx
- Modify: src/__tests__/secure-link-receive-page.test.jsx
- Modify: src/MobileSharePanel.jsx
- Modify: src/__tests__/mobile-share-panel.test.jsx
- Modify: src/App.css
- Delete: src/transfer/secure-link-client.js
- Delete: src/__tests__/secure-link-client.test.js

**Interfaces:**
- Consumes: /al/:id legacy route'u.
- Produces: Ağ çağrısı yapmayan SecureLinkReceivePage bilgilendirme bileşeni.
- Produces: MobileSharePanel içinde "Şifreli Paket" ve "QR Video" yöntemleri.

- [ ] **Step 1: Eski alım sayfasının ağ kullanmaması için başarısız testi yaz**

src/__tests__/secure-link-receive-page.test.jsx:

~~~jsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SecureLinkReceivePage from "../pages/SecureLinkReceivePage.jsx";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("kaldırılan güvenli bağlantı sayfası", () => {
  it("paket veya URL anahtarını okumadan kaldırılma mesajını gösterir", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    window.history.replaceState({}, "", "/al/eski-kayit#key=gizli-anahtar");
    render(<SecureLinkReceivePage />);

    expect(screen.getByRole("heading", {
      name: "Bu bağlantı yöntemi artık desteklenmiyor.",
    })).toBeInTheDocument();
    expect(screen.getByText(/\.bta paketi ve ayrı anahtarı/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("gizli-anahtar");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
~~~

- [ ] **Step 2: Testin mevcut fetch akışı nedeniyle başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- src/__tests__/secure-link-receive-page.test.jsx
~~~

Expected: FAIL; mevcut sayfa URL anahtarını okur ve paylaşım API'sine gider.

- [ ] **Step 3: Sayfayı salt bilgilendirme bileşenine indir**

src/pages/SecureLinkReceivePage.jsx yalnız SiteNavbar ve şu ana içeriği kullanmalı:

~~~jsx
export default function SecureLinkReceivePage() {
  return (
    <div className="secure-receive-page">
      <SiteNavbar homeIcon />
      <main className="secure-receive-main">
        <section className="secure-receive-card">
          <span className="eyebrow">● BAĞLANTI KALDIRILDI</span>
          <h1>Bu bağlantı yöntemi artık desteklenmiyor.</h1>
          <p>
            Gönderenden .bta paketi ve farklı bir kanaldan iletilen anahtarı isteyin.
          </p>
          <a className="btn-solid" href="/transfer">Şifreli paket al</a>
        </section>
      </main>
    </div>
  );
}
~~~

Dosyada useEffect, URL hash okuma, decryptContainer, native share ve secure-link-client importu kalmamalı.

- [ ] **Step 4: Mobil yöntem için başarısız testi yaz**

src/__tests__/mobile-share-panel.test.jsx dosyasını sunucusuz davranışa göre sadeleştir:

~~~jsx
it("Şifreli Paket ve QR Video yöntemlerini gösterir", () => {
  render(<MobileSharePanel user={{ id: "user-1", plan: "free" }} />);
  expect(screen.getByRole("button", { name: /Şifreli Paket/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /QR Video/ })).toBeInTheDocument();
  expect(screen.queryByText(/Güvenli bağlantı/)).not.toBeInTheDocument();
});

it("varsayılan mobil yöntemde yerel paket oluşturma alanını gösterir", () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<MobileSharePanel user={{ id: "user-1", plan: "free" }} />);
  expect(screen.getByLabelText("Paketlenecek belge")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 5: Mobil testin mevcut link yöntemi nedeniyle başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- src/__tests__/mobile-share-panel.test.jsx
~~~

Expected: FAIL; mevcut panel Güvenli Bağlantı gösterir.

- [ ] **Step 6: MobileSharePanel'i iki yerel yönteme indir**

src/MobileSharePanel.jsx içinde bütün erişim kodu, süre, indirme sayısı, Secure Link sonucu ve createSecureShare kodunu kaldır. Bileşenin çekirdeği:

~~~jsx
import { useState } from "react";
import SecurePackagePanel from "./SecurePackagePanel.jsx";
import VideoTransferPanel from "./VideoTransferPanel.jsx";

export default function MobileSharePanel({ user }) {
  const [method, setMethod] = useState("package");
  return (
    <section className="mobile-share-panel" aria-labelledby="mobile-share-title">
      <header className="mobile-share-heading">
        <span className="eyebrow">● MOBİLDEN MOBİLE</span>
        <h2 id="mobile-share-title">Özel dosyanı cihazında hazırla.</h2>
        <p>Şifreli paket veya QR Video oluştur; VaultDrop sunucusuna dosya yüklenmez.</p>
      </header>
      <div className="mobile-methods" aria-label="Mobil paylaşım yöntemi">
        <button
          type="button"
          className={method === "package" ? "mobile-method active" : "mobile-method"}
          aria-pressed={method === "package"}
          onClick={() => setMethod("package")}
        >
          <span><strong>Şifreli Paket</strong><small>.bta cihazında hazırlanır</small></span>
        </button>
        <button
          type="button"
          className={method === "video" ? "mobile-method active" : "mobile-method"}
          aria-pressed={method === "video"}
          onClick={() => setMethod("video")}
        >
          <span><strong>QR Video</strong><small>Şifreli QR karelerini videoya dönüştür</small></span>
        </button>
      </div>
      {method === "package"
        ? <SecurePackagePanel view="create" user={user} />
        : <VideoTransferPanel view="create" user={user} />}
    </section>
  );
}
~~~

Düğmeler mevcut mobile-method erişilebilirlik desenini korumalı; adları tam olarak "Şifreli Paket" ve "QR Video" olmalı.

- [ ] **Step 7: İstemci Secure Link dosyalarını ve artık kullanılmayan stilleri kaldır**

Şunları sil:

~~~text
src/transfer/secure-link-client.js
src/__tests__/secure-link-client.test.js
~~~

src/App.css içinden yalnız kaldırılan link formuna özel seçicileri kaldır:

~~~text
.mobile-link-flow
.mobile-dropzone
.mobile-selection
.mobile-security-disclosure
.mobile-security-options
.mobile-check
.mobile-share-action
.mobile-share-result
.mobile-result-check
.mobile-access-code
.secure-code-form
.secure-meta-strip
.secure-open-result
~~~

Emekli bağlantı sayfasının kullandığı .secure-receive-page, .secure-receive-main ve .secure-receive-card stilleri korunur.

- [ ] **Step 8: İstemci kalıntı taramasını ve testleri çalıştır**

Run:

~~~powershell
rg -n "createSecureShare|getSecureShare|unlockSecureShare|buildSecureShareUrl|#key=" src
npm test -- src/__tests__/secure-link-receive-page.test.jsx src/__tests__/mobile-share-panel.test.jsx src/__tests__/routes.test.js
~~~

Expected: rg sonuç vermez; testler PASS. /al/:id route'u emekli bilgilendirme sayfasına çözülmeye devam eder.

- [ ] **Step 9: Git varsa bağımsız görevi commit et**

~~~powershell
git rev-parse --is-inside-work-tree
git add src
git commit -m "refactor: replace secure links with local packages"
~~~

Current workspace: Git yoksa commit adımları atlanır.

---

### Task 5: Anahtar paylaşımını güvenli ve kullanılabilir yap

**Files:**
- Modify: src/SecurePackagePanel.jsx
- Modify: src/__tests__/secure-package-ui.test.jsx
- Modify: src/App.css

**Interfaces:**
- Consumes: packageResult.keyText.
- Produces: Varsayılan gizli anahtar, copyKey(), pano hatasından sonra isteğe bağlı göster/gizle.
- Produces: İki adımlı ".bta paketini gönder / anahtarı farklı kanaldan gönder" sonucu.

- [ ] **Step 1: Yeni anahtar davranışı için başarısız arayüz testlerini yaz**

src/__tests__/secure-package-ui.test.jsx içine:

~~~jsx
it("paket sonucunda iki ayrı paylaşım adımını gösterir", async () => {
  render(<SecurePackagePanel view="create" user={{ id: "user-1" }} />);
  fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
    target: { files: [new File(["delil"], "belge.pdf")] },
  });
  await screen.findByText("ornek-sha256-ozeti");
  fireEvent.click(screen.getByRole("button", { name: "Şifreli paketi oluştur" }));

  expect(await screen.findByText("1. .bta paketini gönder")).toBeInTheDocument();
  expect(screen.getByText("2. Anahtarı farklı bir kanaldan gönder")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain(SECRET_KEY);
});

it("pano reddedilince anahtarı yalnız kullanıcı isterse gösterir", async () => {
  navigator.clipboard.writeText.mockRejectedValueOnce(new Error("izin yok"));
  render(<SecurePackagePanel view="create" user={{ id: "user-1" }} />);
  fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
    target: { files: [new File(["delil"], "belge.pdf")] },
  });
  await screen.findByText("ornek-sha256-ozeti");
  fireEvent.click(screen.getByRole("button", { name: "Şifreli paketi oluştur" }));
  fireEvent.click(await screen.findByRole("button", { name: "Anahtarı kopyala" }));

  expect(await screen.findByRole("button", { name: "Anahtarı elle göster" })).toBeInTheDocument();
  expect(document.body.textContent).not.toContain(SECRET_KEY);
  fireEvent.click(screen.getByRole("button", { name: "Anahtarı elle göster" }));
  expect(screen.getByLabelText("Geçici paket anahtarı")).toHaveValue(SECRET_KEY);
  fireEvent.click(screen.getByRole("button", { name: "Anahtarı gizle" }));
  expect(document.body.textContent).not.toContain(SECRET_KEY);
});
~~~

- [ ] **Step 2: Yeni testlerin başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- src/__tests__/secure-package-ui.test.jsx
~~~

Expected: FAIL; iki adım ve elle gösterme geri dönüşü henüz yok.

- [ ] **Step 3: Anahtar durumlarını ve sıfırlamayı ekle**

SecurePackagePanel içine:

~~~js
const [manualKeyAvailable, setManualKeyAvailable] = useState(false);
const [isKeyVisible, setIsKeyVisible] = useState(false);
~~~

Yeni dosya seçildiğinde ve yeni paket oluşturulmaya başladığında her ikisini false yap. Pano hatasında:

~~~js
setCopyStatus(COPY_ERROR);
setManualKeyAvailable(true);
setIsKeyVisible(false);
~~~

- [ ] **Step 4: Sonuç arayüzünü iki adımlı ve gizli anahtarlı yap**

Mevcut result bloğunda:

~~~jsx
<ol className="package-share-steps">
  <li>1. .bta paketini gönder</li>
  <li>2. Anahtarı farklı bir kanaldan gönder</li>
</ol>
<a className="btn-solid" href={packageUrl} download={packageResult.downloadName}>
  .bta paketini indir
</a>
<button type="button" className="btn-ghost" onClick={copyKey}>
  Anahtarı kopyala
</button>
{manualKeyAvailable && !isKeyVisible && (
  <button type="button" className="btn-ghost" onClick={() => setIsKeyVisible(true)}>
    Anahtarı elle göster
  </button>
)}
{isKeyVisible && (
  <div className="manual-key-fallback">
    <label>
      <span>Geçici paket anahtarı</span>
      <textarea readOnly value={packageResult.keyText} />
    </label>
    <button type="button" className="btn-ghost" onClick={() => setIsKeyVisible(false)}>
      Anahtarı gizle
    </button>
  </div>
)}
<p className="warning">
  Paket ile anahtarı aynı konuşmada paylaşmayın. Anahtar kaybolursa paket kurtarılamaz.
</p>
~~~

Başarılı kopyalama metni şu olmalı:

~~~js
setCopyStatus("Anahtar kopyalandı. .bta paketinden farklı bir kanalda gönderin.");
~~~

- [ ] **Step 5: Toplam sınır metnini düzelt**

Dosya seçim alt metnini üyede tam olarak şuna çevir:

~~~text
En fazla 15 dosya · toplam 50 MiB
~~~

Misafir metni:

~~~text
Misafir: tek dosya · toplam 10 MiB
~~~

- [ ] **Step 6: Yeni alanın küçük stillerini ekle ve testleri çalıştır**

src/App.css içine package-share-steps ve manual-key-fallback için mevcut .result ve .field desenleriyle uyumlu, taşmayı engelleyen stiller ekle. Anahtar alanında word-break: break-all kullan.

Run:

~~~powershell
npm test -- src/__tests__/secure-package-ui.test.jsx src/__tests__/usage-policy.test.js
~~~

Expected: PASS.

- [ ] **Step 7: Git varsa bağımsız görevi commit et**

~~~powershell
git rev-parse --is-inside-work-tree
git add src/SecurePackagePanel.jsx src/App.css src/__tests__/secure-package-ui.test.jsx
git commit -m "feat: harden package key sharing"
~~~

Current workspace: Git yoksa commit adımları atlanır.

---

### Task 6: Kota kesinleştirmeyi idempotent ve yeniden denenebilir yap

**Files:**
- Modify: src/transfer/activity-client.js
- Modify: src/__tests__/activity-client.test.js
- Modify: server/runtime.js
- Modify: server/repositories.js
- Modify: server/__tests__/runtime.test.js
- Modify: server/__tests__/repositories.test.js
- Modify: server/__tests__/auth-api.test.js
- Modify: src/SecurePackagePanel.jsx
- Modify: src/__tests__/secure-package-ui.test.jsx

**Interfaces:**
- Consumes: finalizeTransferActivity({ user, reservationId, status, completedAt }).
- Produces: Aynı transferId ve aynı status için tekrar çağrılabilen sunucu kesinleştirmesi.
- Produces: İstemcide en fazla 3 güvenli deneme; başarısızlıkta null.

- [ ] **Step 1: İstemci yeniden deneme testini yaz**

src/__tests__/activity-client.test.js içine:

~~~js
it("kota kesinleştirmeyi geçici ağ hatasında yeniden dener", async () => {
  vi.stubEnv("VITE_ENABLE_ACTIVITY_API", "true");
  apiRequest
    .mockRejectedValueOnce(new Error("geçici ağ"))
    .mockResolvedValueOnce({ id: "transfer-1", status: "completed" });

  await expect(finalizeTransferActivity({
    user: { id: "user-1" },
    reservationId: "transfer-1",
    status: "completed",
    completedAt: new Date("2026-08-09T10:00:02.000Z"),
  })).resolves.toEqual({ id: "transfer-1", status: "completed" });
  expect(apiRequest).toHaveBeenCalledTimes(2);
});
~~~

- [ ] **Step 2: Testin tek deneme nedeniyle başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- src/__tests__/activity-client.test.js
~~~

Expected: FAIL; mevcut fonksiyon ilk hatada null döndürür.

- [ ] **Step 3: En fazla üç aynı istek denemesi ekle**

src/transfer/activity-client.js:

~~~js
const FINALIZATION_ATTEMPTS = 3;

export async function finalizeTransferActivity({
  user,
  reservationId,
  status,
  completedAt,
}) {
  if (!user || !reservationId || !isTransferActivityApiEnabled()) return null;
  for (let attempt = 0; attempt < FINALIZATION_ATTEMPTS; attempt += 1) {
    try {
      return await apiRequest("/api/transfers/" + reservationId, {
        method: "PATCH",
        body: JSON.stringify({ status, completedAt: completedAt.toISOString() }),
      });
    } catch {
      // Aynı idempotent istek bir sonraki turda yeniden denenir.
    }
  }
  return null;
}
~~~

- [ ] **Step 4: Bellek repository idempotency testini yaz**

server/__tests__/runtime.test.js içinde aynı rezervasyonu iki kez completed yapan test ekle:

~~~js
const first = await repositories.finalizeTransfer({
  userId: user.id,
  transferId: reservation.id,
  status: "completed",
  completedAt,
});
const second = await repositories.finalizeTransfer({
  userId: user.id,
  transferId: reservation.id,
  status: "completed",
  completedAt,
});
expect(first).toMatchObject({ id: reservation.id, status: "completed" });
expect(second).toEqual(first);
~~~

- [ ] **Step 5: Bellek testinin ikinci çağrıda null ile başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- server/__tests__/runtime.test.js
~~~

Expected: FAIL; mevcut kod yalnız pending kaydı kesinleştirir.

- [ ] **Step 6: Bellek repository'sini aynı sonuç için idempotent yap**

server/runtime.js finalizeTransfer:

~~~js
const transfer = transfers.find(
  (item) => item.id === transferId && item.userId === userId,
);
if (!transfer) return null;
if (transfer.status === status) return { id: transfer.id, status };
if (transfer.status !== "pending" || transfer.reservation_expires_at <= new Date()) {
  return null;
}
transfer.status = status;
transfer.completedAt = completedAt;
transfer.reservation_expires_at = null;
return { id: transfer.id, status };
~~~

- [ ] **Step 7: SQL repository için idempotent sonuç testini yaz**

server/__tests__/repositories.test.js içinde query mock'u önce UPDATE için boş, ardından SELECT için aynı durumu döndürsün:

~~~js
query
  .mockResolvedValueOnce({ rows: [] })
  .mockResolvedValueOnce({ rows: [{ id: "transfer-1", status: "completed" }] });

await expect(repositories.finalizeTransfer({
  userId: "user-1",
  transferId: "transfer-1",
  status: "completed",
  completedAt: new Date("2026-08-09T10:00:02.000Z"),
})).resolves.toEqual({ id: "transfer-1", status: "completed" });
~~~

- [ ] **Step 8: SQL repository'sine güvenli mevcut-sonuç sorgusu ekle**

UPDATE boş dönerse yalnız aynı kullanıcı, id ve istenen status için:

~~~js
if (result.rows[0]) return result.rows[0];
const existing = await query(
  "SELECT id, status FROM transfer_batches WHERE id = $1 AND user_id = $2 AND status = $3",
  [transferId, userId, status],
);
return existing.rows[0] ?? null;
~~~

Farklı durum idempotent başarı sayılmaz.

- [ ] **Step 9: API seviyesinde ikinci kesinleştirmenin 200 olduğunu doğrula**

server/__tests__/auth-api.test.js içine repository mock'u aynı sonucu döndürürken aynı PATCH isteğini iki kez yap ve ikisinin de 200 olduğunu doğrula.

- [ ] **Step 10: Paket arayüzünde kesinleştirme başarısızlığını içerikten ayır**

SecurePackagePanel createPackage içinde paket başarıyla üretildikten sonra finalizeTransferActivity sonucunu al:

~~~js
const finalized = await finalizeTransferActivity({
  user,
  reservationId: reservation?.id,
  status: "completed",
  completedAt: new Date(),
});
if (reservation?.id && !finalized) {
  addCreateLog("UYARI: Aylık kullanım kaydı şu anda doğrulanamadı.");
}
~~~

Paket ve anahtar bu uyarıda silinmez; kullanıcı oluşturduğu paketi indirebilir. Yeni arayüz testi finalizeTransferMock null döndürdüğünde .bta indirme bağlantısının kaldığını doğrular.

- [ ] **Step 11: Kota test grubunu çalıştır**

Run:

~~~powershell
npm test -- src/__tests__/activity-client.test.js src/__tests__/secure-package-ui.test.jsx server/__tests__/runtime.test.js server/__tests__/repositories.test.js server/__tests__/auth-api.test.js
~~~

Expected: PASS.

- [ ] **Step 12: Git varsa bağımsız görevi commit et**

~~~powershell
git rev-parse --is-inside-work-tree
git add src/transfer/activity-client.js src/SecurePackagePanel.jsx src/__tests__ server/runtime.js server/repositories.js server/__tests__
git commit -m "fix: make quota finalization retry-safe"
~~~

Current workspace: Git yoksa commit adımları atlanır.

---

### Task 7: Üretim CSP ve güvenlik başlıklarını sıkılaştır

**Files:**
- Create: server/security-headers.js
- Create: server/__tests__/security-headers.test.js
- Create: public/_headers
- Create: src/__tests__/static-security-headers.test.js
- Modify: server/app.js
- Modify: index.html
- Modify: README.md

**Interfaces:**
- Produces: createApiHelmetOptions() nesnesi.
- Produces: dist/_headers içine kopyalanan üretim başlık bildirimi.

- [ ] **Step 1: API güvenlik başlığı için başarısız testi yaz**

server/__tests__/security-headers.test.js:

~~~js
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";

it("API yanıtlarında sıkı güvenlik başlıkları kullanır", async () => {
  const app = createApp({
    config: {
      frontendOrigin: "https://vaultdrop.example",
      sessionCookieName: "vaultdrop_session",
      isProduction: true,
      googleClientId: "",
      googleClientSecret: "",
      neonAuthBaseUrl: "",
      neonAuthJwksUrl: "",
    },
    repositories: { findUserBySessionHash: vi.fn().mockResolvedValue(null) },
  });
  const response = await request(app).get("/api/health");
  expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
  expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers["content-security-policy"]).not.toContain("unsafe-eval");
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
});
~~~

- [ ] **Step 2: Testin mevcut Helmet varsayımlarıyla beklenen farkı gösterdiğini doğrula**

Run:

~~~powershell
npm test -- server/__tests__/security-headers.test.js
~~~

Expected: FAIL if exact API-only policy is absent.

- [ ] **Step 3: API Helmet ayarını ayrı dosyada tanımla**

server/security-headers.js:

~~~js
export function createApiHelmetOptions() {
  return {
    crossOriginResourcePolicy: { policy: "same-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  };
}
~~~

server/app.js mevcut helmet çağrısını şuna çevir:

~~~js
app.use(helmet(createApiHelmetOptions()));
~~~

- [ ] **Step 4: Statik üretim başlıkları için başarısız testi yaz**

src/__tests__/static-security-headers.test.js:

~~~js
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("statik üretim güvenlik başlıkları", () => {
  it("CSP ile betikleri aynı kökenle sınırlar", async () => {
    const headers = await readFile(new URL("../../public/_headers", import.meta.url), "utf8");
    expect(headers).toContain("script-src 'self'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).not.toContain("unsafe-eval");
  });

  it("index sayfası dış Google fontu yüklemez", async () => {
    const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });
});
~~~

- [ ] **Step 5: Statik testin _headers yokken başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- src/__tests__/static-security-headers.test.js
~~~

Expected: FAIL with ENOENT and Google Fonts eşleşmesi.

- [ ] **Step 6: Google Fonts isteklerini kaldır**

index.html içinden iki preconnect ve fonts.googleapis.com stylesheet etiketini kaldır. Uygulama zaten src/styles/tokens.css içinde Inter, Segoe UI ve system-ui geri dönüşlerini kullanır; yeni paket gerekmez.

- [ ] **Step 7: Statik üretim başlık dosyasını ekle**

public/_headers:

~~~text
/*
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.neon.tech wss://*.neon.tech; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(self), microphone=(), geolocation=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
~~~

style-src içindeki unsafe-inline yalnız mevcut React style özellikleri içindir; script-src bunu içermez ve unsafe-eval hiçbir yerde yoktur.

- [ ] **Step 8: Barındırma gereksinimini belgele**

README.md güvenlik bölümüne:

~~~markdown
### Üretim güvenlik başlıkları

public/_headers dosyası CSP ve tarayıcı güvenlik başlıklarını tanımlar. Seçilen
barındırma hizmeti bu biçimi desteklemiyorsa aynı başlıklar hizmetin panelinde
aynen tanımlanmalıdır. Üretim yayını, Content-Security-Policy yanıt başlığı
doğrulanmadan tamamlanmış sayılmaz.
~~~

- [ ] **Step 9: Güvenlik testlerini ve üretim kopyasını doğrula**

Run:

~~~powershell
npm test -- server/__tests__/security-headers.test.js src/__tests__/static-security-headers.test.js
npm run build
Get-Content -Raw -LiteralPath dist/_headers
~~~

Expected: testler PASS, build PASS ve dist/_headers CSP içerir.

- [ ] **Step 10: Git varsa bağımsız görevi commit et**

~~~powershell
git rev-parse --is-inside-work-tree
git add server/security-headers.js server/__tests__/security-headers.test.js server/app.js public/_headers src/__tests__/static-security-headers.test.js index.html README.md
git commit -m "security: enforce strict browser policies"
~~~

Current workspace: Git yoksa commit adımları atlanır.

---

### Task 8: Ürün metinlerini gerçek teknik ve aylık sınırlarla eşleştir

**Files:**
- Modify: README.md
- Modify: src/content/faqContent.js
- Modify: src/pages/PricingPage.jsx
- Modify: src/__tests__/faq-page.test.jsx
- Modify: src/__tests__/pricing-page.test.jsx

**Interfaces:**
- Produces: Tek işlem toplam 50 MiB ile aylık 250 MiB/1 GiB ayrımını aynı ifadelerle anlatan ürün metni.

- [ ] **Step 1: Yanlış “dosya başına” metnini reddeden testleri yaz**

src/__tests__/pricing-page.test.jsx içinde teknik not için:

~~~jsx
expect(screen.getByText(/tek Şifreli Paket işleminin toplamı 50 MiB/))
  .toBeInTheDocument();
expect(document.body.textContent).not.toContain("dosya başına sınır 50 MiB");
~~~

src/__tests__/faq-page.test.jsx içinde:

~~~jsx
expect(screen.getByText(/Plus paket aylık toplam 250 MiB/)).toBeInTheDocument();
expect(screen.getByText(/Kurumsal paket aylık toplam 1 GiB/)).toBeInTheDocument();
expect(screen.getByText(/tek Şifreli Paket işlemi toplam 50 MiB/)).toBeInTheDocument();
~~~

- [ ] **Step 2: Metin testlerinin mevcut ifadelerle başarısız olduğunu doğrula**

Run:

~~~powershell
npm test -- src/__tests__/pricing-page.test.jsx src/__tests__/faq-page.test.jsx
~~~

Expected: FAIL; mevcut fiyat sayfası “dosya başına 50 MiB” der.

- [ ] **Step 3: Kullanıcı metinlerini tek anlamlı hale getir**

PricingPage teknik notunun özü:

~~~text
Paket kotası aylık olarak yenilenir. Tek Şifreli Paket işleminde en fazla
15 dosya seçilebilir ve seçilen dosyaların toplamı 50 MiB olabilir.
Plus paket ay boyunca toplam 250 MiB, Kurumsal paket toplam 1 GiB kullanım sunar.
~~~

FAQ sınır yanıtının özü:

~~~text
Plus paket aylık toplam 250 MiB, Kurumsal paket aylık toplam 1 GiB kullanım
sunar. Bunlar tek dosya sınırı değildir. Tek Şifreli Paket işlemi en fazla
15 dosya ve toplam 50 MiB destekler.
~~~

README'de Şifreli Paket, Canlı QR ve QR Video ayrımını koru; Secure Link'i aktif özellik olarak anlatan bütün metinleri kaldır. Şifreli Paket bölümünde .bta ve anahtarın farklı kanallarını açıkça yaz.

- [ ] **Step 4: Metin testlerini ve kalıntı taramasını çalıştır**

Run:

~~~powershell
npm test -- src/__tests__/pricing-page.test.jsx src/__tests__/faq-page.test.jsx
rg -n "dosya başına 50 MiB|Güvenli bağlantı|secure share|Secure Link" README.md src --glob "!__tests__/**"
~~~

Expected: testler PASS; rg aktif özellik metni bulmaz. Emekli bağlantı sayfasındaki açıklama istisnadır.

- [ ] **Step 5: Git varsa bağımsız görevi commit et**

~~~powershell
git rev-parse --is-inside-work-tree
git add README.md src/content/faqContent.js src/pages/PricingPage.jsx src/__tests__/faq-page.test.jsx src/__tests__/pricing-page.test.jsx
git commit -m "docs: clarify package and monthly limits"
~~~

Current workspace: Git yoksa commit adımları atlanır.

---

### Task 9: Tam güvenlik ve regresyon doğrulaması

**Files:**
- Verify only; önceki görevlerde değişen bütün dosyalar.

**Interfaces:**
- Produces: Test, lint, build ve yasak veri yolu taramasıyla doğrulanmış teslim.

- [ ] **Step 1: Yasak sunucu veri yollarını tara**

Run:

~~~powershell
rg -n "encrypted_payload|createSecureShare|getSecureShare|unlockSecureShare|buildSecureShareUrl|#key=" server src --glob "!__tests__/**" --glob "!db/migrations/004_secure_shares.sql"
rg -n "\bextension\b|\.extension" src/transfer/activity-client.js server/validation.js server/repositories.js
~~~

Expected: iki tarama da hiçbir sonuç vermez.

- [ ] **Step 2: Aylık ve teknik sınır ifadelerini tara**

Run:

~~~powershell
rg -n "250 MiB|1 GiB|50 MiB" README.md src/content src/pages
~~~

Expected: 250 MiB ve 1 GiB yalnız aylık toplam olarak, 50 MiB tek Şifreli Paket toplamı olarak anlatılır.

- [ ] **Step 3: Bütün otomatik testleri çalıştır**

Run:

~~~powershell
npm test
~~~

Expected: bütün Vitest testleri PASS.

- [ ] **Step 4: Kod denetimini çalıştır**

Run:

~~~powershell
npm run lint
~~~

Expected: exit code 0; yeni hata yok.

- [ ] **Step 5: Üretim derlemesini çalıştır**

Run:

~~~powershell
npm run build
~~~

Expected: exit code 0, dist/index.html ve dist/_headers oluşur.

- [ ] **Step 6: Üretim paketinde yasak istemci dizelerini tara**

Run:

~~~powershell
rg -n "api/secure-shares|encrypted_payload|#key=" dist
~~~

Expected: hiçbir sonuç yok.

- [ ] **Step 7: Değişiklik listesini son kez gözden geçir**

Run:

~~~powershell
git rev-parse --is-inside-work-tree
~~~

Git varsa:

~~~powershell
git status --short
git diff --check
~~~

Git yoksa, değişen dosyaları son çalışma planındaki Dosya Haritası ile karşılaştır ve Git başlatma.

- [ ] **Step 8: Git varsa doğrulama commit'i oluştur**

~~~powershell
git add .
git commit -m "test: verify serverless security foundation"
~~~

Yalnız doğrulama sırasında ayrı düzeltme yapıldıysa commit oluştur; değişiklik yoksa boş commit oluşturma. Current workspace Git değilse bu adımı atla.
