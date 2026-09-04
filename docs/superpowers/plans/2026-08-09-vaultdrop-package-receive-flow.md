# VaultDrop Şifreli Paket Alım Akışı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Şifreli paket oluşturmayı Gönder sekmesinde, şifreli paket açmayı Al sekmesinde göstermek.

**Architecture:** Mevcut `SecurePackagePanel` bileşeninin `create` ve `open` görünümleri korunur. `TransferPage` bu görünümleri doğru ana sekme ve yönteme bağlar; `ReceiveMethodSelector` şifreli paket yöntemini sunar.

**Tech Stack:** React 19, Vitest, Testing Library, mevcut VaultDrop CSS sistemi.

## Global Constraints

- Gönder > Şifreli paket yalnızca paket oluşturma alanını gösterir.
- Al sekmesinin varsayılan yöntemi Şifreli paket olur.
- Al yöntemleri Şifreli paket, QR video ve Kameradan tara olarak kalır.
- Şifreleme, dosya biçimi ve QR protokolü değiştirilmez.

---

### Task 1: Gönder ve Al Akışlarını Ayır

**Files:**
- Modify: `src/__tests__/secure-package-ui.test.jsx`
- Modify: `src/__tests__/mobile-receive-flow.test.jsx`
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/ReceiveMethodSelector.jsx`

**Interfaces:**
- Consumes: `SecurePackagePanel({ view: "create" | "open" })`
- Produces: `ReceiveMethodSelector` içinde `package`, `video`, `camera` yöntemleri ve doğru panel yönlendirmesi.

- [ ] **Step 1: Gönder tarafının yalnızca oluşturma alanı gösterdiğini test et**

```jsx
render(<App />);
fireEvent.click(screen.getByRole("button", { name: /Şifreli paket/ }));
expect(screen.getByLabelText("Paketlenecek belge")).toBeInTheDocument();
expect(screen.queryByLabelText(".bta paket dosyası")).not.toBeInTheDocument();
```

- [ ] **Step 2: Al tarafının varsayılan olarak şifreli paket açtığını test et**

```jsx
render(<App />);
fireEvent.click(screen.getByRole("button", { name: "Al" }));
expect(screen.getByLabelText(".bta paket dosyası")).toBeInTheDocument();
expect(screen.getByLabelText("Paket anahtarı")).toBeInTheDocument();
expect(screen.queryByLabelText("Paketlenecek belge")).not.toBeInTheDocument();
```

- [ ] **Step 3: Hedef testleri çalıştır ve beklenen nedenle başarısız olduklarını doğrula**

Run: `npx vitest run src/__tests__/secure-package-ui.test.jsx src/__tests__/mobile-receive-flow.test.jsx`

Expected: Gönder tarafında açma alanı bulunduğu ve Al tarafında şifreli paket yöntemi bulunmadığı için FAIL.

- [ ] **Step 4: Minimal yönlendirme değişikliğini uygula**

```jsx
const [receiveMethod, setReceiveMethod] = useState("package");

{sendMethod === "package" && <SecurePackagePanel view="create" />}
{receiveMethod === "package" && <SecurePackagePanel view="open" />}
```

`ReceiveMethodSelector` listesinin başına:

```js
{
  id: "package",
  title: "Şifreli paket",
  description: ".bta dosyasını ayrı gelen anahtarla açın",
}
```

- [ ] **Step 5: Hedef testleri yeniden çalıştır ve PASS doğrula**

Run: `npx vitest run src/__tests__/secure-package-ui.test.jsx src/__tests__/mobile-receive-flow.test.jsx`

Expected: PASS.

- [ ] **Step 6: Tüm kontrolleri çalıştır**

Run: `npm test`, `npm run lint`, `npm run build`

Expected: Tüm komutlar başarıyla tamamlanır.

- [ ] **Step 7: Tarayıcıda doğrula**

`http://127.0.0.1:5173/transfer` adresinde Gönder > Şifreli paket ve Al > Şifreli paket ekranlarını kontrol et.

Expected: Oluşturma ve açma alanları farklı ana sekmelerde görünür.

Not: Proje Git deposu olmadığı için commit adımı uygulanmaz.
