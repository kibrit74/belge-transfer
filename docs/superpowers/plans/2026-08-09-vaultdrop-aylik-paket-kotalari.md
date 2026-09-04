# VaultDrop Aylık Paket Kotaları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standart, Plus ve Kurumsal kullanıcıların aylık gönderim kotalarını atomik rezervasyonlarla uygulamak ve profil kartında gerçek byte kullanımını göstermek.

**Architecture:** Paket limitleri istemci ve sunucunun birlikte kullandığı saf bir modülde tanımlanır. Sunucu, gönderim başlamadan önce tek SQL sorgusuyla kota rezervasyonu oluşturur; istemci başarı veya hata sonunda rezervasyonu kapatır. Profil özeti aynı kayıtları kullanarak aylık kullanım, kalan kota ve yenilenme tarihini döndürür.

**Tech Stack:** React 19, Express 5, Neon PostgreSQL, Zod 4, Vitest, Testing Library, Supertest

## Global Constraints

- Standart aylık kota tam olarak `50 * 1024 * 1024` byte olmalıdır.
- Plus aylık kota tam olarak `250 * 1024 * 1024` byte olmalıdır.
- Kurumsal aylık kota tam olarak `1024 * 1024 * 1024` byte olmalıdır.
- Eski `member` planı güvenli biçimde `standard` olarak yorumlanmalı ve göç edilmelidir.
- Kota dönemi UTC takvim ayıdır ve sonraki ayın ilk günü yenilenir.
- Yalnız gönderimler kotadan düşer; alımlar ve başarısız işlemler düşmez.
- Canlı QR tek dosya, Şifreli Paket 15 dosya/dosya başına 50 MiB ve QR Video 15 dosya/toplam 15 MiB teknik sınırları değişmemelidir.
- Sunucuya dosya adı, dosya içeriği veya şifreleme anahtarı gönderilmemelidir.
- Yeni ödeme, yükseltme ekranı veya yönetim paneli eklenmemelidir.
- Kod ve kullanıcı metinleri UTF-8 olmalıdır.
- Çalışma alanı Git deposu değildir; commit adımları uygulanamaz, her görev test çıktısıyla checkpoint oluşturur.

---

### Task 1: Ortak paket politikası

**Files:**
- Create: `shared/plan-policy.js`
- Create: `src/__tests__/plan-policy.test.js`

**Interfaces:**
- Produces: `PLAN_LIMIT_BYTES`, `normalizePlan(plan)`, `getPlanLimitBytes(plan)`, `getPlanLabel(plan)`, `getUtcMonthlyPeriod(date)`.
- Consumed by: repository, profil sayfası ve paket testleri.

- [ ] **Step 1: Paket değerleri için başarısız testi yaz**

```js
import { describe, expect, it } from "vitest";
import {
  getPlanLabel,
  getPlanLimitBytes,
  getUtcMonthlyPeriod,
  normalizePlan,
} from "../../shared/plan-policy.js";

describe("aylık paket politikası", () => {
  it.each([
    ["standard", 50 * 1024 * 1024, "Standart"],
    ["plus", 250 * 1024 * 1024, "Plus"],
    ["corporate", 1024 * 1024 * 1024, "Kurumsal"],
  ])("%s paketini doğru tanımlar", (plan, bytes, label) => {
    expect(getPlanLimitBytes(plan)).toBe(bytes);
    expect(getPlanLabel(plan)).toBe(label);
  });

  it("eski ve bilinmeyen planları standarda düşürür", () => {
    expect(normalizePlan("member")).toBe("standard");
    expect(normalizePlan("unknown")).toBe("standard");
  });

  it("UTC aylık dönemini hesaplar", () => {
    expect(getUtcMonthlyPeriod(new Date("2026-08-09T10:00:00Z"))).toEqual({
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-09-01T00:00:00.000Z"),
    });
  });
});
```

- [ ] **Step 2: Testi çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm.cmd test -- src/__tests__/plan-policy.test.js`

Expected: FAIL with module resolution error for `shared/plan-policy.js`.

- [ ] **Step 3: Saf paket modülünü oluştur**

```js
export const PLAN_LIMIT_BYTES = Object.freeze({
  standard: 50 * 1024 * 1024,
  plus: 250 * 1024 * 1024,
  corporate: 1024 * 1024 * 1024,
});

const PLAN_LABELS = Object.freeze({
  standard: "Standart",
  plus: "Plus",
  corporate: "Kurumsal",
});

export function normalizePlan(plan) {
  return plan === "plus" || plan === "corporate" ? plan : "standard";
}

export function getPlanLimitBytes(plan) {
  return PLAN_LIMIT_BYTES[normalizePlan(plan)];
}

export function getPlanLabel(plan) {
  return PLAN_LABELS[normalizePlan(plan)];
}

export function getUtcMonthlyPeriod(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}
```

- [ ] **Step 4: Hedef testi çalıştır**

Run: `npm.cmd test -- src/__tests__/plan-policy.test.js`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Doğrula: Ortak modül React, tarayıcı veya Node API’sine bağımlı değildir; Git commit adımı çalışma alanında uygulanmaz.

### Task 2: Veritabanı göçü ve atomik kota repository’si

**Files:**
- Create: `server/db/migrations/002_monthly_plan_quotas.sql`
- Modify: `server/repositories.js`
- Modify: `server/runtime.js`
- Modify: `server/__tests__/repositories.test.js`
- Modify: `server/__tests__/runtime.test.js`

**Interfaces:**
- Consumes: `getPlanLimitBytes(plan)` from `shared/plan-policy.js` for memory runtime.
- Produces: `reserveTransfer({ userId, method, items, startedAt })`, `finalizeTransfer({ userId, transferId, status, completedAt })`, enriched `getProfileSummary(userId)`.

- [ ] **Step 1: Repository sözleşmesi için başarısız testleri yaz**

Test query çağrılarını şu davranışlarla doğrula:

```js
it("gönderimi aktif aylık kota içinde atomik olarak rezerve eder", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ id: "reservation-1" }] });
  const repositories = createRepositories(query);
  await expect(repositories.reserveTransfer({
    userId: "user-1",
    method: "secure_package",
    items: [{ extension: "pdf", sizeBytes: 1024 }],
    startedAt: "2026-08-09T10:00:00.000Z",
  })).resolves.toEqual({ id: "reservation-1" });
  expect(query.mock.calls[0][0]).toContain("status = 'pending'");
  expect(query.mock.calls[0][0]).toContain("reservation_expires_at > NOW()");
});

it("boş insert sonucunu kota aşımı olarak bildirir", async () => {
  const repositories = createRepositories(vi.fn().mockResolvedValue({ rows: [] }));
  await expect(repositories.reserveTransfer({
    userId: "user-1", method: "qr_video",
    items: [{ extension: "zip", sizeBytes: 1024 }],
    startedAt: "2026-08-09T10:00:00.000Z",
  })).resolves.toBeNull();
});
```

Memory repository testinde Standard kullanıcı için 50 MiB rezervasyonun kabul edildiğini, sonraki 1 byte rezervasyonun reddedildiğini ve `failed` finalizasyonundan sonra kotanın serbest kaldığını doğrula.

- [ ] **Step 2: Repository testlerini çalıştır ve yeni metotlar olmadığı için kırıldığını doğrula**

Run: `npm.cmd test -- server/__tests__/repositories.test.js server/__tests__/runtime.test.js`

Expected: FAIL with `reserveTransfer is not a function`.

- [ ] **Step 3: İleri yönlü SQL göçünü ekle**

Göç dosyası şu işlemleri sırasıyla yapmalıdır:

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
UPDATE users SET plan = 'standard' WHERE plan = 'member';
ALTER TABLE users ALTER COLUMN plan SET DEFAULT 'standard';
ALTER TABLE users ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('standard', 'plus', 'corporate'));

ALTER TABLE transfer_batches DROP CONSTRAINT IF EXISTS transfer_batches_status_check;
ALTER TABLE transfer_batches ADD CONSTRAINT transfer_batches_status_check
  CHECK (status IN ('pending', 'completed', 'failed'));
ALTER TABLE transfer_batches
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS transfer_batches_monthly_quota_idx
  ON transfer_batches(user_id, direction, status, created_at DESC);
```

- [ ] **Step 4: PostgreSQL repository rezervasyonunu tek sorguda uygula**

`reserveTransfer` toplam byte’ı ve sıralı, güvenli item JSON’unu hazırlar. Tek CTE sorgusu kullanıcı planını seçmeli, UTC ay başlangıcından itibaren `completed` gönderimler ile süresi dolmamış `pending` gönderimleri toplamalı, kalan kota uygunsa batch ve item kayıtlarını aynı sorguda eklemelidir. Paket limitleri SQL `CASE` içinde exact byte değerleriyle sunucu tarafında seçilmelidir; istemciden limit kabul edilmemelidir.

Sorgu sonucu satır yoksa `null`, varsa `{ id }` dönmelidir.

`finalizeTransfer` yalnız aynı kullanıcıya ait, süresi dolmamış `pending` kaydı şu sorguyla kapatmalıdır:

```sql
UPDATE transfer_batches
SET status = $3, completed_at = $4, reservation_expires_at = NULL
WHERE id = $1 AND user_id = $2 AND status = 'pending'
  AND reservation_expires_at > NOW()
RETURNING id, status
```

- [ ] **Step 5: Profil özetini aylık alanlarla genişlet**

`getProfileSummary` tek sorguda mevcut 90 günlük istatistikleri ve şu snake_case alanları döndürmelidir:

```js
{
  plan: "standard",
  monthly_used_bytes: "0",
  monthly_limit_bytes: "52428800",
  monthly_remaining_bytes: "52428800",
  period_start: Date,
  period_end: Date,
}
```

Aylık kullanım yalnız tamamlanan gönderimler ile aktif rezervasyonları içermeli; `GREATEST(limit - used, 0)` kullanılmalıdır.

- [ ] **Step 6: Memory repository’yi aynı sözleşmeye getir**

Memory kullanıcı planını `standard` yap. Rezervasyon nesnelerinde `status: "pending"`, `direction: "send"`, `reservation_expires_at` tut; 30 dakikası dolmayan rezervasyonları aylık toplama kat. `finalizeTransfer` sahiplik, pending durum ve süreyi kontrol etsin. Profil özeti ortak paket modülünden limit ve UTC dönemini kullansın.

- [ ] **Step 7: Repository testlerini çalıştır**

Run: `npm.cmd test -- server/__tests__/repositories.test.js server/__tests__/runtime.test.js`

Expected: PASS.

- [ ] **Step 8: Checkpoint**

Doğrula: Yeni göç `001` dosyasını değiştirmiyor ve mevcut kurulumlara ileri yönlü uygulanabiliyor.

### Task 3: Kota rezervasyonu API’si

**Files:**
- Modify: `server/validation.js`
- Modify: `server/app.js`
- Modify: `server/__tests__/auth-api.test.js`
- Modify: `server/__tests__/validation.test.js`

**Interfaces:**
- Consumes: repository `reserveTransfer` and `finalizeTransfer`.
- Produces: `POST /api/transfers/reservations`, `PATCH /api/transfers/:id`, stable error code `MONTHLY_QUOTA_EXCEEDED`.

- [ ] **Step 1: Başarısız API testlerini yaz**

```js
it("gönderimi kota içinde rezerve eder", async () => {
  repositories.reserveTransfer.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
  const response = await request(app)
    .post("/api/transfers/reservations")
    .set("Origin", config.frontendOrigin)
    .set("X-VaultDrop-Request", "1")
    .set("Cookie", "vaultdrop_session=raw-session-token")
    .send({ method: "secure_package", startedAt: new Date().toISOString(), items: [{ extension: "pdf", sizeBytes: 1024 }] });
  expect(response.status).toBe(201);
  expect(response.body).toEqual({ id: "11111111-1111-4111-8111-111111111111" });
});

it("aylık kota aşımını güvenli kodla reddeder", async () => {
  repositories.reserveTransfer.mockResolvedValue(null);
  const response = await authenticatedReservationRequest();
  expect(response.status).toBe(409);
  expect(response.body.code).toBe("MONTHLY_QUOTA_EXCEEDED");
});
```

Ayrıca başka kullanıcı rezervasyonunun finalize edilemediğini ve doğrudan `POST /api/transfers` ile `direction: send` kaydının reddedildiğini test et.

- [ ] **Step 2: API testlerini çalıştır ve 404 nedeniyle kırıldığını doğrula**

Run: `npm.cmd test -- server/__tests__/auth-api.test.js server/__tests__/validation.test.js`

Expected: FAIL with route status 404.

- [ ] **Step 3: İstek şemalarını ekle**

```js
export const transferReservationSchema = z.object({
  method: z.enum(["live_qr", "secure_package", "qr_video"]),
  startedAt: z.iso.datetime(),
  items: z.array(itemSchema).min(1).max(15),
}).superRefine(validateMethodLimits);

export const transferFinalizationSchema = z.object({
  status: z.enum(["completed", "failed"]),
  completedAt: z.iso.datetime(),
});
```

Mevcut yöntem limit doğrulamasını `validateMethodLimits` isimli ortak iç fonksiyona çıkar; rezervasyon ve aktivite şemaları aynı kuralları kullanmalıdır.

- [ ] **Step 4: Rezervasyon ve finalizasyon rotalarını ekle**

`POST /api/transfers/reservations` oturum gerektirmeli, parsed body ile repository çağırmalı ve boş sonuçta şunu dönmelidir:

```js
return response.status(409).json({
  code: "MONTHLY_QUOTA_EXCEEDED",
  error: "Bu aktarım aylık paket kotanızı aşıyor.",
});
```

`PATCH /api/transfers/:id` UUID parametresini doğrulamalı; repository sonucu yoksa `404`, varsa `{ id, status }` döndürmelidir.

Mevcut `POST /api/transfers` yalnız `direction: receive` kayıtlarına izin vermelidir.

- [ ] **Step 5: API testlerini çalıştır**

Run: `npm.cmd test -- server/__tests__/auth-api.test.js server/__tests__/validation.test.js`

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Doğrula: API yanıtlarında dosya adı, içerik veya paket anahtarı bulunmuyor.

### Task 4: İstemci rezervasyon sözleşmesi

**Files:**
- Modify: `src/transfer/activity-client.js`
- Modify: `src/__tests__/activity-client.test.js`

**Interfaces:**
- Produces: `reserveTransferActivity({ user, method, files, startedAt })`, `finalizeTransferActivity({ user, reservationId, status, completedAt })`, `recordReceiveActivity(activity)`.
- Consumed by: SendPanel, SecurePackagePanel, VideoTransferPanel.

- [ ] **Step 1: Başarısız istemci testlerini yaz**

Mock `apiRequest` ile şu çağrıları doğrula:

```js
await reserveTransferActivity({ user, method: "secure_package", files, startedAt });
expect(apiRequest).toHaveBeenCalledWith("/api/transfers/reservations", expect.objectContaining({ method: "POST" }));

await finalizeTransferActivity({ user, reservationId: "id-1", status: "completed", completedAt });
expect(apiRequest).toHaveBeenCalledWith("/api/transfers/id-1", expect.objectContaining({ method: "PATCH" }));
```

Misafir rezervasyonunun `null` döndürdüğünü ve API çağırmadığını; alım kaydının `direction: "receive"` kullandığını doğrula.

- [ ] **Step 2: Testi çalıştır ve export’lar olmadığı için kırıldığını doğrula**

Run: `npm.cmd test -- src/__tests__/activity-client.test.js`

Expected: FAIL with missing exports.

- [ ] **Step 3: Yeni aktivite fonksiyonlarını uygula**

`buildTransferPayload` dosya adını yalnız güvenli uzantıya çevirmeye devam etsin. `reserveTransferActivity` giriş yapan kullanıcıda API hatasını yutmamalı; kota mesajının panelde gösterilmesi için hatayı yukarı iletmelidir. `finalizeTransferActivity` hata aldığında aktarım sonucunu bozmamak için `null` dönebilir. `recordReceiveActivity` mevcut best-effort davranışı korumalıdır.

- [ ] **Step 4: İstemci aktivite testini çalıştır**

Run: `npm.cmd test -- src/__tests__/activity-client.test.js`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Doğrula: İstemciden sunucuya yalnız uzantı ve byte boyutu gönderiliyor.

### Task 5: Üç gönderim yönteminde kota rezervasyonu

**Files:**
- Modify: `src/SendPanel.jsx`
- Modify: `src/SecurePackagePanel.jsx`
- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/__tests__/secure-package-ui.test.jsx`
- Modify: `src/__tests__/video-transfer-ui.test.jsx`
- Create: `src/__tests__/send-panel-quota.test.jsx`

**Interfaces:**
- Consumes: `reserveTransferActivity` and `finalizeTransferActivity` from Task 4.
- Produces: Kullanıcıya görünür kota hatası ve rezervasyonla korunan gönderim başlangıcı.

- [ ] **Step 1: Paneller için başarısız UI testlerini yaz**

Her panelde `reserveTransferActivity` reject olduğunda pahalı işlem fonksiyonunun çağrılmadığını ve şu mesajın gösterildiğini doğrula:

```js
reserveTransferActivity.mockRejectedValue(new Error("Bu aktarım aylık paket kotanızı aşıyor."));
expect(await screen.findByText("Bu aktarım aylık paket kotanızı aşıyor.")).toBeInTheDocument();
expect(encryptFile).not.toHaveBeenCalled();
```

Başarılı akışta önce rezervasyon, sonra üretim, en son `finalizeTransferActivity({ status: "completed" })` çağrısı yapılmalıdır. Üretim hatasında aynı rezervasyon `failed` olarak finalize edilmelidir.

- [ ] **Step 2: Panel testlerini çalıştır ve eski post-completion kayıt davranışı nedeniyle kırıldığını doğrula**

Run: `npm.cmd test -- src/__tests__/send-panel-quota.test.jsx src/__tests__/secure-package-ui.test.jsx src/__tests__/video-transfer-ui.test.jsx`

Expected: FAIL because reservation API is not used.

- [ ] **Step 3: SendPanel akışını rezervasyonla koru**

`handleFile` içinde yerel teknik doğrulamadan sonra ve dosyayı okumadan önce:

```js
const startedAt = new Date();
const reservation = await reserveTransferActivity({ user, method: "live_qr", files: [file], startedAt });
try {
  const buf = await readFileAsArrayBuffer(file);
  const result = encodeFileToFrames(file, buf);
  await finalizeTransferActivity({ user, reservationId: reservation?.id, status: "completed", completedAt: new Date() });
  // mevcut başarılı state güncellemeleri
} catch (error) {
  await finalizeTransferActivity({ user, reservationId: reservation?.id, status: "failed", completedAt: new Date() });
  setError(error.message || "Aktarım başlatılamadı.");
}
```

Misafirde reservation `null` olduğu için mevcut yerel akış devam etmelidir. Panelde erişilebilir bir `role="alert"` hata alanı ekle.

- [ ] **Step 4: SecurePackagePanel akışını rezervasyonla koru**

Rezervasyonu `createPackage` içinde `encryptFile` çağrısından hemen önce al. Başarılı şifrelemeden sonra `completed`, catch bloğunda `failed` finalize et. Eski `recordTransferActivity` gönderim çağrısını kaldır; alım çağrısını `recordReceiveActivity` ile koru.

- [ ] **Step 5: VideoTransferPanel akışını rezervasyonla koru**

Rezervasyonu `handleCreateVideo` içinde `createQrVideo` çağrısından hemen önce al. Başarıda `completed`, catch bloğunda `failed` finalize et. Kota hatasında video üretimi başlamamalı, mevcut `createError` ve log alanında Türkçe mesaj görünmelidir. Alım kaydını `recordReceiveActivity` ile koru.

- [ ] **Step 6: Panel testlerini çalıştır**

Run: `npm.cmd test -- src/__tests__/send-panel-quota.test.jsx src/__tests__/secure-package-ui.test.jsx src/__tests__/video-transfer-ui.test.jsx`

Expected: PASS; mevcut QR Video toplam 15 MiB testleri de PASS.

- [ ] **Step 7: Checkpoint**

Doğrula: Kota rezervasyonu alınmadan şifreleme, kare üretimi veya video üretimi başlamıyor.

### Task 6: Profilde aylık kullanım kartı

**Files:**
- Modify: `src/pages/ProfilePage.jsx`
- Modify: `src/pages/MemberPages.css`
- Modify: `src/__tests__/auth-profile-ui.test.jsx`

**Interfaces:**
- Consumes: summary `plan`, `monthly_used_bytes`, `monthly_limit_bytes`, `monthly_remaining_bytes`, `period_end`; shared `getPlanLabel`.
- Produces: Byte tabanlı erişilebilir aylık kullanım kartı.

- [ ] **Step 1: Profil kartı için başarısız testi yaz**

`apiRequest` summary mock’unu aşağıdaki değerlerle döndür:

```js
{
  transfer_count: 2,
  file_count: 3,
  total_size_bytes: 19398656,
  plan: "standard",
  monthly_used_bytes: 19398656,
  monthly_limit_bytes: 52428800,
  monthly_remaining_bytes: 33030144,
  period_end: "2026-09-01T00:00:00.000Z",
}
```

Şunları doğrula:

```js
expect(await screen.findByText(/AYLIK KULLANIM · STANDART/i)).toBeInTheDocument();
expect(screen.getByText("18.5 MiB / 50 MiB")).toBeInTheDocument();
expect(screen.getByText("1 Eylül’de yenilenir")).toBeInTheDocument();
expect(screen.getByRole("progressbar", { name: "Aylık veri kullanımı" }))
  .toHaveAttribute("aria-valuetext", "18.5 MiB / 50 MiB");
expect(screen.queryByText(/QR Video için toplam 15 MiB/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Profil testini çalıştır ve eski dosya sayısı kartı nedeniyle kırıldığını doğrula**

Run: `npm.cmd test -- src/__tests__/auth-profile-ui.test.jsx`

Expected: FAIL on monthly usage heading.

- [ ] **Step 3: Byte formatı ve aylık kart hesaplarını uygula**

`formatBytes` tam 50 MiB değerini `50 MiB`, ondalıklı değeri tek basamakla göstermelidir. Summary gelene kadar kartta `Kullanım bilgisi alınıyor…`, hata olduğunda `Kullanım bilgisi alınamadı` göster; hiçbir durumda sahte `0 / limit` gösterme.

Progress yüzdesi:

```js
const monthlyUsed = Math.max(0, Number(summary.monthly_used_bytes));
const monthlyLimit = Math.max(1, Number(summary.monthly_limit_bytes));
const usagePercent = Math.min(100, (monthlyUsed / monthlyLimit) * 100);
```

Yenilenme tarihi `new Date(period_end).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })` ile yazılmalıdır.

- [ ] **Step 4: Kart metnini ve erişilebilir progress barı değiştir**

Başlık `AYLIK KULLANIM · ${getPlanLabel(summary.plan).toLocaleUpperCase("tr-TR")}` olmalı. Progress bar byte değerleriyle `aria-valuemin="0"`, `aria-valuemax`, `aria-valuenow` ve okunabilir `aria-valuetext` taşımalıdır. Teknik QR açıklamasını profilden kaldır.

- [ ] **Step 5: CSS’i mevcut frosted glass tasarımla uyumlu tut**

Mevcut `.limit-banner`, `.limit-meter` ve responsive kuralları korunmalı; yalnız metin taşması, kota dolu rengi ve loading/error yardımcı stilleri eklenmelidir. Yeni ayrı kart sistemi oluşturulmamalıdır.

- [ ] **Step 6: Profil testini çalıştır**

Run: `npm.cmd test -- src/__tests__/auth-profile-ui.test.jsx`

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Doğrula: Profil kartında 15 MiB değeri görünmüyor; QR Video seçim ekranında görünmeye devam ediyor.

### Task 7: İçerik, tam test ve üretim doğrulaması

**Files:**
- Modify: `src/content/faqContent.js`
- Modify: `src/__tests__/faq-page.test.jsx`
- Verify: `docs/SECURITY.md`

**Interfaces:**
- Consumes: Paket ve teknik sınır değerleri.
- Produces: Kullanıcıya aylık kota ile işlem sınırını ayıran güncel SSS metni.

- [ ] **Step 1: SSS için başarısız test yaz**

Test; dosya sınırı cevabında `Standart 50 MiB`, `Plus 250 MiB`, `Kurumsal 1 GiB` ve ayrı olarak `QR Video toplam 15 MiB` ifadelerini doğrulamalıdır.

- [ ] **Step 2: SSS testini çalıştır ve paket adları olmadığı için kırıldığını doğrula**

Run: `npm.cmd test -- src/__tests__/faq-page.test.jsx`

Expected: FAIL on package copy.

- [ ] **Step 3: SSS metnini güncelle**

Limit cevabı şu anlamı eksiksiz taşımalıdır:

```text
Standart paket aylık 50 MiB, Plus 250 MiB, Kurumsal 1 GiB gönderim kotası sunar. İşlem başına Şifreli Paket dosyaları en fazla 50 MiB olabilir. QR Video en fazla 15 dosya ve toplam 15 MiB destekler.
```

- [ ] **Step 4: İlgili ve tam test paketlerini çalıştır**

Run: `npm.cmd test -- src/__tests__/faq-page.test.jsx src/__tests__/usage-policy.test.js src/__tests__/video-transfer-ui.test.jsx server/__tests__/validation.test.js`

Expected: PASS.

Run: `npm.cmd test -- --reporter=verbose`

Expected: Tüm testler PASS.

- [ ] **Step 5: Kod kontrolü ve üretim derlemesini çalıştır**

Run: `npm.cmd run lint`

Expected: Yeni hata yok; mevcut `AuthContext.jsx` fast-refresh uyarıları değişiklik kapsamı dışındadır.

Run: `npm.cmd run build`

Expected: Başarılı Vite üretim derlemesi; mevcut büyük chunk uyarısı değişiklik kapsamı dışındadır.

- [ ] **Step 6: Veritabanı göçünü kontrollü çalıştır**

Önce `.env.local` içinde `DATABASE_URL` bulunduğunu doğrula. Ardından:

Run: `npm.cmd run db:migrate`

Expected: `001` atlanır veya idempotent çalışır, `002_monthly_plan_quotas.sql` başarıyla uygulanır. Bu komut gerçek uzak veritabanına yazacağı için çalışma zamanı onayı gerekiyorsa kullanıcı onayı alınmalıdır.

- [ ] **Step 7: Tarayıcıda masaüstü ve mobil profil kontrolü yap**

Profil kartında paket adı, gerçek aylık byte kullanımı, yenilenme tarihi ve progress barı kontrol et. 390 px görünümde yatay taşma olmamalıdır. Kota aşımı mock’unda gönderim üretimi başlamadan hata görünmelidir.

- [ ] **Step 8: Son kapsam kontrolü**

Doğrula: QR Video 15 MiB ve 15 dosya teknik sınırları değişmedi; hiçbir payload dosya adı/içerik/anahtar içermiyor; geçici tarayıcı önizleme dosyaları çalışma alanında kalmadı.
