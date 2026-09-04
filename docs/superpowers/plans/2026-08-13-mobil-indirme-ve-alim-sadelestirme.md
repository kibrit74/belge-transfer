# Mobil indirme ve alım akışı sadeleştirmesi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telefonda indirme düğmelerini tam görünür hâle getirmek ve alıcıdaki QR Video yolunu kaldırmak.

**Architecture:** Alıcı yol listesi yalnız VaultDrop ile Canlı QR seçeneklerinden oluşacak; Transfer sayfası QR Video alma panelini hiç bağlamayacak. Ortak aksiyon stilleri dar ekranlarda tek sütuna inecek ve indirme bağlantıları minimum genişlik sınırı olmadan kapsayıcıyı dolduracak.

**Tech Stack:** React, Vitest, Testing Library, mevcut CSS medya sorguları.

## Global Constraints

- Arayüz metinleri UTF-8 ve Türkçe kalacak.
- QR Video gönderim kodu ve eski teknik dosyaları silinmeyecek.
- Alıcıda yalnız `package` ve `camera` yöntemleri gösterilecek.
- 650 piksel ve altı ekranlarda indirme aksiyonları alt alta ve `%100` genişlikte olacak.
- Git deposu olmadığı için commit adımı uygulanmayacak.

---

### Task 1: QR Video alım yolunu kullanıcı arayüzünden kaldırma

**Files:**
- Modify: `src/ReceiveMethodSelector.jsx`
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/__tests__/mobile-receive-flow.test.jsx`
- Modify: `src/__tests__/transfer-page-shell.test.jsx`

**Interfaces:**
- Consumes: `ReceiveMethodSelector({ activeMethod, onChange })`
- Produces: Alıcıda yalnız `package` ve `camera` değerlerini seçen yol listesi.

- [x] **Step 1: Başarısız olacak alıcı seçenek testlerini yaz**

```jsx
it("Al ekranında QR Video yolunu göstermez", () => {
  renderAuthenticatedApp();
  fireEvent.click(screen.getByRole("button", { name: "Al" }));

  expect(screen.getByRole("button", { name: /VaultDrop paketi/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Kameradan tara/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /QR video dosyası/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Çözülecek QR video")).not.toBeInTheDocument();
});
```

- [x] **Step 2: Testin doğru nedenle kırıldığını doğrula**

Run: `cmd /c npm test -- src/__tests__/mobile-receive-flow.test.jsx src/__tests__/transfer-page-shell.test.jsx`

Expected: QR Video düğmesinin hâlâ bulunduğunu belirten FAIL.

- [x] **Step 3: En küçük arayüz değişikliğini yap**

```jsx
const RECEIVE_METHODS = [
  { id: "package", title: "VaultDrop paketi", description: ".vdrop veya .bta dosyasını ayrı gelen anahtarla açın" },
  { id: "camera", title: "Kameradan tara", description: "Yanınızdaki ekranda çalışan Canlı QR kodunu okutun" },
];

{receiveMethod === "package" && <SecurePackagePanel view="open" user={user} />}
{receiveMethod === "camera" && <ReceivePanel />}
```

`VideoTransferPanel` alma yönlendirmesini ve artık kullanılmayan içe aktarmayı kaldır; gönderici tarafını değiştirme.

- [x] **Step 4: Alıcı yol testlerini yeşile çevir**

Run: `cmd /c npm test -- src/__tests__/mobile-receive-flow.test.jsx src/__tests__/transfer-page-shell.test.jsx`

Expected: PASS.

### Task 2: Mobil indirme aksiyonlarını taşmasız hâle getirme

**Files:**
- Modify: `src/App.css`
- Modify: `src/__tests__/secure-package-ui.test.jsx`

**Interfaces:**
- Consumes: `.actions`, `.receive-controls`, `.btn-solid`, `.btn-ghost`, sonuç kartlarındaki indirme bağlantıları.
- Produces: 650 piksel ve altındaki ekranlarda bütün indirme aksiyonları tek sütunda, kapsayıcı genişliğinde görünür.

- [x] **Step 1: Başarısız olacak mobil indirme yerleşim testini yaz**

```jsx
it("mobil sonuç indirme bağlantısını tam genişlikte sunar", async () => {
  render(<SecurePackagePanel view="open" />);
  // Mevcut başarılı paket açma akışını çalıştır.
  const link = await screen.findByRole("link", { name: "Özgün dosyayı indir" });
  expect(link).toHaveClass("download-result-action");
});
```

- [x] **Step 2: Testin doğru nedenle kırıldığını doğrula**

Run: `cmd /c npm test -- src/__tests__/secure-package-ui.test.jsx`

Expected: Sonuç indirme bağlantısında `download-result-action` sınıfı olmadığı için FAIL.

- [x] **Step 3: Sonuç indirme bağlantısını ve dar ekran stilini ekle**

```jsx
<a className="btn-solid download-result-action" href={openedUrl} download={openedName}>
  Özgün dosyayı indir
</a>
```

```css
.download-result-action { min-width: 0; max-width: 100%; box-sizing: border-box; }

@media (max-width: 650px) {
  .actions, .receive-controls { align-items: stretch; }
  .actions > .btn-solid, .actions > .btn-ghost,
  .receive-controls > .btn-solid, .receive-controls > .btn-ghost,
  .download-result-action { width: 100%; flex: 0 0 auto; }
}
```

Yalnız gerçek indirme sonuç bağlantılarına sınıf ekle; sıradan paylaşım düğmelerine ekleme.

- [x] **Step 4: Mobil indirme ve paket açma testlerini yeşile çevir**

Run: `cmd /c npm test -- src/__tests__/secure-package-ui.test.jsx`

Expected: PASS.

### Task 3: Birleşik doğrulama

**Files:**
- Verify: `src/ReceiveMethodSelector.jsx`
- Verify: `src/pages/TransferPage.jsx`
- Verify: `src/SecurePackagePanel.jsx`
- Verify: `src/App.css`

- [x] **Step 1: Hedefli arayüz regresyonlarını çalıştır**

Run: `cmd /c npm test -- src/__tests__/mobile-receive-flow.test.jsx src/__tests__/transfer-page-shell.test.jsx src/__tests__/secure-package-ui.test.jsx`

Expected: PASS.

- [x] **Step 2: Kod kalitesini doğrula**

Run: `cmd /c npm run lint`

Expected: Yeni hata olmadan exit 0.

- [x] **Step 3: Üretim derlemesini doğrula**

Run: `cmd /c npm run build`

Expected: exit 0; mevcut büyük dosya uyarısı varsa not edilir.

- [x] **Step 4: Git işlemi yapma**

Bu çalışma alanında Git deposu bulunmadığından dosya ekleme veya commit uygulanmayacak.

## Self-review

- Kapsamın tamamı karşılandı: alıcı QR Video kartı ve yönlendirmesi Task 1’de, mobil indirme taşması Task 2’de, hedefli test/lint/build Task 3’te.
- Yer tutucu, belirsiz görev veya adı tanımlanmamış arayüz bırakılmadı.
- QR Video gönderim tarafı kapsam dışında tutuldu; yalnız alıcıdaki görünür yol kaldırıldı.
