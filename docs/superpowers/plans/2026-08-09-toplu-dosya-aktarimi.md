# Toplu Dosya Aktarımı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Şifreli Paket ve QR Video alanlarında en fazla 15 dosyayı tek seçimle ZIP tabanlı olarak aktarmak.

**Architecture:** Ortak `batch-files` modülü seçimi doğrular ve çoklu dosyaları mevcut protokole girecek tek bir ZIP `File` nesnesine dönüştürür. Paneller yalnızca seçim durumunu ve kullanıcı geri bildirimini yönetir; mevcut BTA1 ve QRT3 üretme/açma hatları değişmeden kullanılır.

**Tech Stack:** React 19, Vitest, Testing Library, fflate, Web Crypto, mevcut BTA1/QRT3 modülleri

## Global Constraints

- En fazla 15 dosya seçilebilir.
- QR Video özgün dosyalarının toplamı en fazla 15 MB olabilir.
- Şifreli Paket mevcut 50 MiB sınırını korur.
- Tek dosya davranışı ve eski aktarım biçimleri geriye uyumlu kalır.
- Dosyalar yalnızca tarayıcı içinde işlenir.

---

### Task 1: Ortak toplu dosya hazırlama modülü

**Files:**
- Create: `src/transfer/batch-files.js`
- Create: `src/__tests__/batch-files.test.js`

**Interfaces:**
- Produces: `MAX_BATCH_FILES`, `VIDEO_BATCH_MAX_BYTES`, `getTotalFileSize(files)`, `validateBatchFiles(files, options)`, `prepareTransferFile(files, options)`

- [ ] **Step 1: Write the failing tests**

Tek dosyanın değişmeden dönmesini, 16 dosyanın reddedilmesini, toplam boyut sınırını, iki dosyanın ZIP'e girmesini ve aynı adın benzersizleştirilmesini gerçek `File` nesneleriyle test et.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/batch-files.test.js`
Expected: FAIL because `batch-files.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

`fflate.zipSync` kullanarak her dosyanın `arrayBuffer()` sonucunu arşive ekle. Tek dosyada aynı nesneyi döndür. Doğrulama hatalarında kullanıcıya gösterilecek Türkçe `RangeError` üret.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/batch-files.test.js`
Expected: PASS.

### Task 2: Şifreli Paket panelinde çoklu seçim

**Files:**
- Modify: `src/SecurePackagePanel.jsx`
- Modify: `src/App.css`
- Test: `src/__tests__/secure-package-ui.test.jsx`

**Interfaces:**
- Consumes: `validateBatchFiles(files, { maxBytes: MAX_INPUT_BYTES })` and `prepareTransferFile(files)`

- [ ] **Step 1: Write the failing UI tests**

Dosya seçicinin `multiple` olduğunu, seçilen dosyaların listelendiğini, 16 dosyanın reddedildiğini, kaldırma düğmesini ve çoklu seçimde `encryptFile` işlevine ZIP verilmesini test et.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/secure-package-ui.test.jsx`
Expected: FAIL on missing multi-file behavior.

- [ ] **Step 3: Implement the panel behavior**

Tek `sourceFile` yerine `sourceFiles` tut; seçimi doğrula, aktarım dosyasını hazırla, SHA-256 değerini aktarım dosyasından hesapla ve liste/kaldırma arayüzünü ekle. Eski tek dosya testlerinin kullandığı etiket ve düğme adlarını koru.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/secure-package-ui.test.jsx`
Expected: PASS.

### Task 3: QR Video panelinde 15 MB toplu seçim

**Files:**
- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/video/frame-schedule.js`
- Test: `src/__tests__/video-transfer-ui.test.jsx`
- Test: `src/__tests__/frame-schedule.test.js`

**Interfaces:**
- Consumes: `VIDEO_BATCH_MAX_BYTES`, `validateBatchFiles`, `prepareTransferFile`
- Produces: `VIDEO_OPTIONS.maxBytes === 15 * 1024 * 1024`

- [ ] **Step 1: Write the failing UI and limit tests**

15 MB sınırının davranışını, `multiple` özelliğini, çoklu dosya listesini, kaldırmayı ve `createQrVideo` işlevine ZIP verilmesini test et. Eski 2 MB hata beklentisini 15 MB sınırına göre güncelle.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/video-transfer-ui.test.jsx src/__tests__/frame-schedule.test.js`
Expected: FAIL on 2 MB limit and missing multi-file behavior.

- [ ] **Step 3: Implement the panel and limit**

Toplam özgün dosya boyutunu sınır kontrolü ve süre tahmininde kullan; çoklu seçimde ZIP'i SHA ve video üretimine ver; açıklama ve hata metinlerini 15 MB/en fazla 15 dosya olarak güncelle.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/video-transfer-ui.test.jsx src/__tests__/frame-schedule.test.js`
Expected: PASS.

### Task 4: Tam doğrulama

**Files:**
- Verify all modified files

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Run static checks**

Run: `npm run lint`
Expected: exit code 0.

- [ ] **Step 3: Build production bundle**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Review requirements**

Confirm both panels accept at most 15 files, QR Video blocks totals above 15 MB, multi-file output is ZIP, and single-file behavior remains unchanged.
