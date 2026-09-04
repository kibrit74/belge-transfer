# Mobil Alım Akışı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobilde QR video dosyasıyla belge almayı varsayılan ve kolay bulunan yol yapmak, kamera taramasını ikinci seçenek olarak korumak.

**Architecture:** `App` alım yöntemi durumunu yönetecek ve seçilen yönteme göre video açma ya da kamera panelini gösterecek. `VideoTransferPanel` oluşturma ve açma bölümlerini görünüm özelliğiyle ayıracak; mevcut işlem kodu değişmeden kalacak.

**Tech Stack:** React 19, Vite 8, Vitest, Testing Library, mevcut CSS tasarım sistemi

## Global Constraints

- Yeni bağımlılık eklenmeyecek.
- Mevcut koyu tema ve yeşil vurgu korunacak.
- Metinler kısa, açık ve Türkçe olacak.
- QR oluşturma, video çözme ve kamera tarama davranışları korunacak.
- Kod ve metin dosyaları UTF-8 olacak.

---

### Task 1: Alım yöntemi seçimi

**Files:**
- Create: `src/ReceiveMethodSelector.jsx`
- Modify: `src/App.jsx`
- Test: `src/__tests__/mobile-receive-flow.test.jsx`

**Interfaces:**
- Consumes: `activeMethod: "video" | "camera"`, `onChange(method)`
- Produces: `ReceiveMethodSelector` ve `App` içinde varsayılan `receiveMethod="video"`

- [ ] **Step 1: Varsayılan video akışını doğrulayan testi yaz**

```jsx
render(<App />);
fireEvent.click(screen.getByRole("button", { name: "Al" }));
expect(screen.getByLabelText("Çözülecek QR video")).toBeInTheDocument();
expect(screen.queryByText("Kısa kayıtla tara")).not.toBeInTheDocument();
```

- [ ] **Step 2: Testi çalıştır ve hata verdiğini doğrula**

Run: `npm test -- src/__tests__/mobile-receive-flow.test.jsx`
Expected: FAIL; mevcut `Al` ekranı kamerayı doğrudan gösterir.

- [ ] **Step 3: Seçiciyi ve App durumunu ekle**

```jsx
const [receiveMethod, setReceiveMethod] = useState("video");

<ReceiveMethodSelector activeMethod={receiveMethod} onChange={setReceiveMethod} />
{receiveMethod === "video" ? <VideoTransferPanel view="open" /> : <ReceivePanel />}
```

- [ ] **Step 4: Kamera seçimine geçiş testini ekle**

```jsx
fireEvent.click(screen.getByRole("button", { name: /Kameradan tara/ }));
expect(screen.getByRole("button", { name: "Kısa kayıtla tara" })).toBeInTheDocument();
expect(screen.queryByLabelText("Çözülecek QR video")).not.toBeInTheDocument();
```

- [ ] **Step 5: Hedef testi çalıştır**

Run: `npm test -- src/__tests__/mobile-receive-flow.test.jsx`
Expected: PASS.

### Task 2: QR video panelini amaca göre ayırma

**Files:**
- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/App.jsx`
- Test: `src/__tests__/video-transfer-ui.test.jsx`

**Interfaces:**
- Consumes: `view?: "create" | "open" | "both"`
- Produces: `view="create"` yalnız oluşturma, `view="open"` yalnız açma, varsayılan `both`

- [ ] **Step 1: Görünüm sınırlarını doğrulayan testleri yaz**

```jsx
render(<VideoTransferPanel view="open" />);
expect(screen.getByLabelText("Çözülecek QR video")).toBeInTheDocument();
expect(screen.queryByLabelText("QR video yapılacak belge")).not.toBeInTheDocument();
```

```jsx
render(<VideoTransferPanel view="create" />);
expect(screen.getByLabelText("QR video yapılacak belge")).toBeInTheDocument();
expect(screen.queryByLabelText("Çözülecek QR video")).not.toBeInTheDocument();
```

- [ ] **Step 2: Testleri çalıştır ve hata verdiğini doğrula**

Run: `npm test -- src/__tests__/video-transfer-ui.test.jsx`
Expected: FAIL; panel iki bölümü birlikte gösterir.

- [ ] **Step 3: Bölümleri koşullu göster**

```jsx
const showCreate = view === "both" || view === "create";
const showOpen = view === "both" || view === "open";
```

- [ ] **Step 4: Gönderme ekranını yalnız oluşturma görünümüne bağla**

```jsx
{sendMethod === "video" && <VideoTransferPanel view="create" />}
```

- [ ] **Step 5: Video panel testlerini çalıştır**

Run: `npm test -- src/__tests__/video-transfer-ui.test.jsx`
Expected: PASS.

### Task 3: Kamera ekranını sadeleştirme

**Files:**
- Modify: `src/ReceivePanel.jsx`
- Modify: `src/__tests__/receive-panel.test.jsx`

**Interfaces:**
- Consumes: mevcut `triggerBurstRecording`, `toggleCamera`, `burstSeconds`
- Produces: kısa kullanıcı metinleri ve CSS sınıfları; tarama davranışı değişmez

- [ ] **Step 1: Yeni düğme metnini doğrulayan testi yaz**

```jsx
render(<ReceivePanel />);
expect(screen.getByRole("button", { name: "Kısa kayıtla tara" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Kamerayı çevir" })).toBeInTheDocument();
```

- [ ] **Step 2: Testi çalıştır ve hata verdiğini doğrula**

Run: `npm test -- src/__tests__/receive-panel.test.jsx`
Expected: FAIL; eski uzun metinler görünür.

- [ ] **Step 3: Metinleri ve sınıfları güncelle**

```jsx
<button className="camera-switch" aria-label="Kamerayı çevir">Kamerayı çevir</button>
<button className="btn-solid receive-scan-button">Kısa kayıtla tara</button>
```

- [ ] **Step 4: Var olan test seçicilerini yeni erişilebilir adlara geçir**

Burst testleri `Kısa kayıtla tara` düğmesine tıklayacak; süre seçimi ayrı açılır listede kalacak.

- [ ] **Step 5: Kamera testlerini çalıştır**

Run: `npm test -- src/__tests__/receive-panel.test.jsx`
Expected: PASS.

### Task 4: Mobil yerleşimi iyileştirme

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `receive-method-selector`, `camera-switch`, `receive-controls`, `receive-tip`
- Produces: 44 piksel dokunma alanları, geniş kamera önizlemesi ve küçük ekranda düzenli yığılma

- [ ] **Step 1: Seçici ve kamera sınıflarını ekle**

```css
.receive-method-selector { display: grid; gap: 8px; }
.camera-switch { min-height: 44px; }
.receive-controls { display: flex; gap: 8px; width: 100%; }
```

- [ ] **Step 2: Kamera alanını ekrana oturt**

```css
.video-frame { width: 100%; aspect-ratio: 4 / 3; overflow: hidden; }
.video { width: 100%; height: 100%; object-fit: cover; }
```

- [ ] **Step 3: Küçük ekran düzenini ekle**

```css
@media (max-width: 420px) {
  .app { padding: 20px 14px 32px; gap: 18px; }
  .actions { flex-direction: column; }
}
```

- [ ] **Step 4: Tarayıcıda 390x844 görünümü kontrol et**

Expected: Video seçimi ilk ekranda, tüm ana kontroller taşmadan görünür; kamera alanında gereksiz boşluk kalmaz.

### Task 5: Tam doğrulama

**Files:**
- Verify: `src/**`

**Interfaces:**
- Consumes: önceki dört görevin sonucu
- Produces: test, derleme ve kod kontrolü kanıtı

- [ ] **Step 1: Tüm testleri çalıştır**

Run: `npm test`
Expected: tüm test dosyaları PASS.

- [ ] **Step 2: Üretim derlemesini çalıştır**

Run: `npm run build`
Expected: build başarıyla tamamlanır.

- [ ] **Step 3: Kod kontrolünü çalıştır**

Run: `npm run lint`
Expected: hata bulunmaz.

- [ ] **Step 4: Mobil alım akışını son kez doğrula**

Expected: `Al` → `QR video dosyası` → video seç → çöz → anahtar gir → özgün dosyayı indir; kamera yalnız kullanıcı seçtiğinde açılır.

