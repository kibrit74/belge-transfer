# VaultDrop SSS Sayfası Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VaultDrop için ayrı, aranabilir ve kategori filtreli `/sss` sayfası oluşturmak.

**Architecture:** SSS metinleri `src/content/faqContent.js` içinde veri olarak tutulur. `FaqPage` arama ve kategori durumunu yönetir; mevcut `FaqList` yalnızca soru-cevap sunumunu yapar. Rota mevcut yalın rota çözücüsüne eklenir.

**Tech Stack:** React 19, Vite 8, Vitest, Testing Library, düz CSS

## Global Constraints

- Yeni çalışma zamanı bağımlılığı eklenmeyecek.
- Mevcut VaultDrop tasarım dili korunacak.
- Türkçe metinler UTF-8 kodlamasında tutulacak.
- Sayfa masaüstü ve mobil görünümde kullanılabilir olacak.

---

### Task 1: SSS rotası ve davranış testleri

**Files:**
- Test: `src/__tests__/routes.test.js`
- Test: `src/__tests__/faq-page.test.jsx`

**Interfaces:**
- Consumes: `resolveRoute(pathname)` ve `FaqPage`
- Produces: `/sss`, metin araması, kategori filtresi ve boş sonuç için doğrulama

- [ ] **Step 1:** `/sss` rotasının `faq` döndürdüğünü doğrulayan testi ekle.
- [ ] **Step 2:** Arama, kategori ve boş sonuç testlerini ekle.
- [ ] **Step 3:** `npm test -- --run src/__tests__/routes.test.js src/__tests__/faq-page.test.jsx` komutunu çalıştır ve beklenen eksikleri gör.

### Task 2: Ayrı SSS sayfasını tamamla

**Files:**
- Create: `src/content/faqContent.js`
- Create: `src/pages/FaqPage.jsx`
- Create: `src/pages/FaqPage.css`
- Modify: `src/routes.js`
- Modify: `src/App.jsx`
- Modify: `src/pages/LandingPage.jsx`

**Interfaces:**
- Consumes: `FAQ_ITEMS`, `FaqList`, `Brand`, `resolveRoute(pathname)`
- Produces: `/sss` adresinde çalışan `FaqPage`

- [ ] **Step 1:** SSS verilerini kimlik, kategori, soru ve cevap alanlarıyla tanımla.
- [ ] **Step 2:** Arama ve kategori filtrelerini yöneten erişilebilir sayfa bileşenini yaz.
- [ ] **Step 3:** Mevcut tasarım değişkenlerini kullanan responsive stilleri ekle.
- [ ] **Step 4:** `/sss` rotasını uygulamaya ve ana sayfadaki SSS bağlantılarına bağla.
- [ ] **Step 5:** Hedef testleri çalıştır ve tamamının geçtiğini doğrula.

### Task 3: Son kalite kontrolü

**Files:**
- Verify: `src/pages/FaqPage.jsx`
- Verify: `src/pages/FaqPage.css`

**Interfaces:**
- Consumes: tamamlanmış uygulama
- Produces: doğrulanmış üretim çıktısı

- [ ] **Step 1:** `npm test` ile tüm testleri çalıştır.
- [ ] **Step 2:** `npm run build` ile üretim derlemesini doğrula.
- [ ] **Step 3:** `/sss` sayfasını masaüstü ve mobil genişlikte tarayıcıda kontrol et.
