# VaultDrop Paketler ve Zorunlu Giriş Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ayrı paketler sayfası oluşturmak ve Free dahil tüm aktarım akışını giriş zorunluluğuna bağlamak.

**Architecture:** Paket kuralları paylaşılan politika dosyasında merkezileştirilecek. React uygulaması `/transfer` rotasını oturum seviyesinde koruyacak; sunucu ve dosya seçim politikası aynı kuralı savunma katmanı olarak uygulayacak.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, Express, Neon PostgreSQL, CSS

## Global Constraints

- Free 10 MiB, Standart 50 MiB, Plus 250 MiB, Kurumsal 1 GiB aylık kota.
- Free dahil aktarım yapabilmek için giriş zorunlu.
- `/paketler` herkese açık, `/transfer` korumalı.
- Mevcut 15 dosya, dosya başına 50 MiB ve QR Video toplam 15 MiB teknik sınırları korunacak.
- Mevcut görsel dil ve UTF-8 Türkçe metinler korunacak.
- Çalışma alanında Git deposu bulunmadığından commit adımları uygulanmayacak.

---

### Task 1: Plan Politikası ve Veritabanı

**Files:**
- Modify: `shared/plan-policy.js`
- Modify: `server/runtime.js`
- Modify: `server/repositories.js`
- Create: `server/db/migrations/003_free_plan.sql`
- Test: `src/__tests__/plan-policy.test.js`
- Test: `server/__tests__/auth-api.test.js`

**Interfaces:**
- Produces: `normalizePlan(plan)`, `getPlanLimitBytes(plan)`, `getPlanLabel(plan)` Free planı tanır.
- Produces: yeni kullanıcı varsayılanı `free`.

- [ ] Free planı ve bilinmeyen plan davranışı için başarısız politika testlerini yaz.
- [ ] `npm test -- src/__tests__/plan-policy.test.js` çalıştırıp doğru nedenle başarısız olduğunu doğrula.
- [ ] Paylaşılan politika, bellek deposu, SQL kota sorguları ve göç dosyasını en az değişiklikle güncelle.
- [ ] Odaklı politika ve sunucu testlerini çalıştır.

### Task 2: Güvenli Giriş Dönüşü ve Korumalı Transfer

**Files:**
- Create: `src/auth/return-path.js`
- Create: `src/components/ProtectedTransferRoute.jsx`
- Modify: `src/auth/neon-client.js`
- Modify: `src/pages/LoginPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/transfer/usage-policy.js`
- Test: `src/__tests__/protected-transfer-route.test.jsx`
- Test: `src/__tests__/neon-auth-client.test.js`
- Test: `src/__tests__/usage-policy.test.js`

**Interfaces:**
- Produces: `getSafeReturnPath(search)` yalnız `/transfer` veya `/profil` döndürür.
- Produces: `ProtectedTransferRoute` yükleme, yönlendirme ve yetkili içerik durumlarını yönetir.

- [ ] Oturumsuz yönlendirme, oturumlu görünüm, güvenli dönüş yolu ve oturumsuz seçim için başarısız testleri yaz.
- [ ] Odaklı testleri çalıştırıp eksik davranış nedeniyle başarısız olduklarını doğrula.
- [ ] Yardımcı fonksiyon, rota koruması, giriş callback'i ve seçim reddini uygula.
- [ ] Odaklı testleri yeniden çalıştırıp başarılı olduğunu doğrula.

### Task 3: Paketler Sayfası ve Site Bağlantıları

**Files:**
- Create: `src/pages/PricingPage.jsx`
- Create: `src/pages/PricingPage.css`
- Modify: `src/routes.js`
- Modify: `src/components/SiteNavbar.jsx`
- Modify: `src/components/SiteFooter.jsx`
- Modify: `src/pages/LandingPage.jsx`
- Modify: `src/content/faqContent.js`
- Test: `src/__tests__/pricing-page.test.jsx`
- Test: `src/__tests__/routes.test.js`
- Test: `src/__tests__/landing-page.test.jsx`
- Test: `src/__tests__/faq-page.test.jsx`

**Interfaces:**
- Produces: `/paketler` rotası ve dört plan kartı.
- Consumes: paylaşılan paket adları ve limitleri.

- [ ] Yeni rota, dört plan, site bağlantıları ve güncel üyelik metinleri için başarısız testleri yaz.
- [ ] Odaklı arayüz testlerini çalıştırıp başarısızlığı doğrula.
- [ ] Paket sayfasını ve responsive stilini ekle; navbar, footer, landing ve SSS metinlerini güncelle.
- [ ] Odaklı arayüz testlerini çalıştırıp başarılı olduğunu doğrula.

### Task 4: Bütünsel Doğrulama

**Files:**
- Verify: all changed files

- [ ] `npm test` ile tam test paketini çalıştır.
- [ ] `npm run lint` çalıştır ve yeni hata olmadığını doğrula.
- [ ] `npm run build` çalıştır ve üretim paketinin oluştuğunu doğrula.
- [ ] Masaüstü ve mobil tarayıcıda `/paketler`, oturumsuz `/transfer` ve giriş dönüşünü görsel olarak kontrol et.
