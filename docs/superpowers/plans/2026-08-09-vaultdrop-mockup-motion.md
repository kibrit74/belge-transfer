# VaultDrop Mockup Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing sayfasındaki telefon QR taraması ile bilgisayardan bilgisayara şifreli paket aktarımını, hareket azaltma ayarı açıkken bile adım adım anlaşılır ve görünür hâle getirmek.

**Architecture:** `TransferDemo` mevcut sahne ve adım döngüsünü koruyacak, aktif aktarım adımında kısa aralıklı bir React ilerleme değeri üretecek. Telefon tarama ışığı ve `.BTA` paketi bu değeri CSS özel değişkeni üzerinden kullanacak; böylece global CSS animasyon kısıtlamasına bağlı kalmayacak.

**Tech Stack:** React 19, CSS, Vitest, Testing Library

## Global Constraints

- Mevcut VaultDrop renkleri, tipografisi ve iki sahneli tek kart düzeni korunacak.
- Gerçek kamera, şifreleme protokolü ve transfer uygulaması değiştirilmeyecek.
- Telefon ekranında QR dokusu hiçbir aşamada boş bir çerçeve izlenimi vermeyecek.
- Proje Git deposu olmadığı için commit adımı uygulanmayacak.

---

### Task 1: Mockup motion contract

**Files:**
- Modify: `src/__tests__/landing-page.test.jsx`
- Modify: `src/components/TransferDemo.jsx`
- Modify: `src/pages/LandingPage.css`

**Interfaces:**
- Consumes: `TransferDemo` içindeki `scene` ve `step` durumu.
- Produces: `data-testid="phone-scan-beam"`, `data-testid="moving-package"` ve CSS `--motion-progress` değeri.

- [ ] **Step 1: Write the failing tests**

  Telefon mockup'ında QR dokusu ve tarama ışığı bulunduğunu; tarama adımında ışığın ilerleme değerinin değiştiğini; paket sahnesinde `.BTA` öğesinin bilgisayarlar arasında ilerlediğini doğrula.

- [ ] **Step 2: Run test to verify it fails**

  Run: `cmd /c npx vitest run src/__tests__/landing-page.test.jsx`

  Expected: QR katmanı ve test kimlikleri bulunamadığı için FAIL.

- [ ] **Step 3: Write minimal implementation**

  `TransferDemo` içine aktif hareket adımında ilerleyen ve sahne/adım değişince sıfırlanan `motionProgress` durumu ekle. Telefon ekranına QR deseni, hedef köşeleri ve tarama ışığı ekle. Hareketli `.BTA` öğesine ilerleme değerini aktar.

- [ ] **Step 4: Add responsive visual styling**

  QR dokusunu telefon çerçevesine yerleştir, ışığı `translateY()` ile ilerlet, paket konumunu `translateX()` ile iki bilgisayar arasında taşı. Masaüstü ve mobil mesafeleri CSS değişkenleriyle sınırla.

- [ ] **Step 5: Run focused test**

  Run: `cmd /c npx vitest run src/__tests__/landing-page.test.jsx`

  Expected: PASS.

### Task 2: Verification

**Files:**
- Verify: `src/components/TransferDemo.jsx`
- Verify: `src/pages/LandingPage.css`

- [ ] **Step 1: Run all tests**

  Run: `cmd /c npm test -- --maxWorkers=1`

- [ ] **Step 2: Run lint and build**

  Run: `cmd /c npm run lint`

  Run: `cmd /c npm run build`

- [ ] **Step 3: Verify in the browser**

  `http://localhost:5173/#demo` adresinde Canlı QR ve Şifreli Paket sahnelerinde ilerleme değerlerinin zamanla değiştiğini; masaüstü ve mobilde taşma olmadığını doğrula.
