# VaultDrop Demo Animasyonu ve Navbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing mockup’larını React kontrollü döngüyle oynatmak ve transfer navbar’ını landing görünümüyle eşleştirmek.

**Architecture:** `TransferDemo` görünür sahne ve adımı React state ile yönetir; CSS yalnızca görsel geçişleri uygular. Transfer navbar’ı landing bağlantı yapısını kullanır ve sağda yalnızca ana sayfa ikonu gösterir.

**Tech Stack:** React 19, CSS, Vitest, Testing Library, Playwright CLI.

## Global Constraints

- Demo Canlı QR ve Şifreli Paket sahnelerini otomatik tekrar eder.
- Hareket azaltma ayarında içerik adımları devam eder.
- Transfer navbar’ında “Aktarıma Başla” butonu bulunmaz.
- Sağdaki ana sayfa ikonu `/` adresine gider.
- Aktarım protokolü ve şifreleme kodu değiştirilmez.

---

### Task 1: React Kontrollü Demo Döngüsü

**Files:**
- Modify: `src/components/TransferDemo.jsx`
- Modify: `src/pages/LandingPage.css`
- Modify: `src/__tests__/landing-page.test.jsx`

**Interfaces:**
- Consumes: React `useEffect` ve `useState`.
- Produces: `data-scene` ve `data-step` değerleriyle gözlemlenebilir otomatik demo durumu.

- [ ] Demo başlangıcının `live` ve zaman ilerleyince `package` olduğunu fake timer testiyle tanımla.
- [ ] Testi çalıştır; `data-scene` bulunmadığı için FAIL doğrula.
- [ ] `TransferDemo` içinde 1 saniyelik adımlar ve 8 adımda sahne değişimi sağlayan interval ekle.
- [ ] Görünmeyen sahneyi `is-active`, adımları `is-step-*` sınıflarıyla kontrol et.
- [ ] CSS sonsuz sahne animasyonlarını kaldır; aktif sahne ve adım sınıflarına yumuşak geçişler bağla.
- [ ] Hareket azaltma kuralında geçişleri kısalt fakat sahne görünürlüğünü React state’e bırak.
- [ ] Hedef testi çalıştır ve PASS doğrula.

### Task 2: Transfer Navbar Eşleştirmesi

**Files:**
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/App.css`
- Modify: `src/__tests__/transfer-page-shell.test.jsx`

**Interfaces:**
- Consumes: `Brand` ve landing bölüm adresleri.
- Produces: Logo, orta menü ve `aria-label="Ana sayfaya dön"` ikon bağlantısı.

- [ ] Navbar bağlantılarını ve “Aktarıma Başla” bulunmamasını test et.
- [ ] Testi çalıştır ve mevcut navbar nedeniyle FAIL doğrula.
- [ ] Transfer header’a `/#demo`, `/#features`, `/#sss` bağlantılarını ve ev ikonunu ekle.
- [ ] Landing kapsül ölçülerini ve mobil menü gizleme davranışını `App.css` içinde uygula.
- [ ] Hedef testi çalıştır ve PASS doğrula.
- [ ] `npm test`, `npm run lint`, `npm run build` komutlarını çalıştır.
- [ ] Landing demo döngüsünü ve transfer navbar’ını 5173’te tarayıcıyla doğrula.

Not: Proje Git deposu olmadığı için commit adımları uygulanmaz.
