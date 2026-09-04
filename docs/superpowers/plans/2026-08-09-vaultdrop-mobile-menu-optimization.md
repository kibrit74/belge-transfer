# VaultDrop Mobile Menu Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tüm VaultDrop sayfalarına erişilebilir hamburger menü eklemek ve mobil aktarım ekranını daha az dikey alan kullanan, tek elle rahat bir düzene dönüştürmek.

**Architecture:** `SiteNavbar` mobil açma/kapama durumunu yönetecek, bağlantı içeriği ayrı `MobileNavDrawer` bileşeninde kalacak. Mevcut aktarım bileşenlerinin iş mantığı değişmeyecek; yalnızca mobil düzen CSS'i ve `MobileSharePanel` içindeki güvenlik ayarlarının görünürlüğü değişecek.

**Tech Stack:** React 19, CSS media queries, Testing Library, Vitest.

## Global Constraints

- Onaylanan yön **Hamburger + açılır menü**dür; alt gezinme çubuğu eklenmeyecek.
- Üst menü sabit veya yapışkan yapılmayacak.
- Sunucu API'si, şifreleme ve kota davranışı değişmeyecek.
- Mobil hedef genişlikleri 320, 360, 390 ve 430 px'tir.
- Dokunma hedefleri en az 44 px; birincil işlem düğmeleri en az 52 px olacaktır.
- Hareket azaltma tercihi menü animasyonlarını kaldıracaktır.

---

### Task 1: Erişilebilir mobil navigasyon çekmecesi

**Files:**
- Create: `src/components/MobileNavDrawer.jsx`
- Modify: `src/components/SiteNavbar.jsx`
- Modify: `src/components/SiteNavbar.css`
- Create: `src/__tests__/site-navbar-mobile.test.jsx`

**Interfaces:**
- `MobileNavDrawer({ open, user, homeIcon, onClose })` bağlantıları ve mobil eylemleri gösterir.
- `SiteNavbar` `aria-expanded`, `Escape`, arka katman tıklaması ve geniş ekran geçişini yönetir.

- [ ] **Step 1: Write failing mobile menu behavior tests**

```jsx
render(<SiteNavbar />);
fireEvent.click(screen.getByRole("button", { name: "Menüyü aç" }));
expect(screen.getByRole("dialog", { name: "Mobil menü" })).toBeInTheDocument();
fireEvent.keyDown(document, { key: "Escape" });
expect(screen.queryByRole("dialog", { name: "Mobil menü" })).not.toBeInTheDocument();
```

Also verify guest/member links and backdrop close behavior.

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/__tests__/site-navbar-mobile.test.jsx`
Expected: FAIL because the menu button and drawer do not exist.

- [ ] **Step 3: Implement drawer and navbar state**

Use semantic links, an accessible close button, a fixed scrim only while open, and `document.body.classList` to lock background scrolling. Add a `matchMedia("(min-width: 851px)")` listener that closes the drawer when the viewport becomes desktop-sized.

- [ ] **Step 4: Add responsive styling**

Keep the current desktop navbar unchanged. At `max-width: 850px`, hide desktop navigation/actions, show the hamburger, animate the drawer from the right, and respect `prefers-reduced-motion`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/__tests__/site-navbar-mobile.test.jsx src/__tests__/landing-page.test.jsx src/__tests__/transfer-page-shell.test.jsx`
Expected: PASS.

### Task 2: Mobil aktarım ekranı yoğunluk optimizasyonu

**Files:**
- Modify: `src/App.css`
- Modify: `src/TransferMethodSelector.jsx`
- Modify: `src/ReceiveMethodSelector.jsx`
- Test: `src/__tests__/transfer-page-shell.test.jsx`

**Interfaces:**
- Seçici bileşenlerin React sözleşmesi değişmez: `{ activeMethod, onChange }`.
- Mobil düzen CSS scroll-snap kullanır; masaüstü düzen dört/üç sütun kalır.

- [ ] **Step 1: Add failing structure assertions**

Assert that transfer/receive selectors expose an accessible group and method buttons retain `aria-pressed`. Add stable class hooks for horizontal scroll containers without duplicating controls.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- src/__tests__/transfer-page-shell.test.jsx`
Expected: FAIL until the new mobile selector hooks exist.

- [ ] **Step 3: Implement mobile-only compact layout**

At `max-width: 650px`, reduce intro spacing/type size, flatten shell padding, turn method lists into horizontal `grid-auto-flow: column` scrollers with `scroll-snap-type: x mandatory`, use 148–168 px cards, keep focus outlines visible, and ensure no fixed controls are introduced.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/__tests__/transfer-page-shell.test.jsx src/__tests__/protected-transfer-route.test.jsx`
Expected: PASS.

### Task 3: Açılır güvenlik ayarları ve mobil form iyileştirmesi

**Files:**
- Modify: `src/MobileSharePanel.jsx`
- Modify: `src/App.css`
- Modify: `src/__tests__/mobile-share-panel.test.jsx`

**Interfaces:**
- `MobileSharePanel` mevcut paylaşım sözleşmesini korur.
- Yeni `securityOpen` durumu varsayılan olarak `false` olur.
- Özet metni `1 saat · 1 kez · açılınca sil` biçimindedir ve seçimlerle güncellenir.

- [ ] **Step 1: Write failing disclosure tests**

```jsx
render(<MobileSharePanel user={{ id: "user-1" }} />);
expect(screen.getByRole("button", { name: /Güvenlik ayarları/ })).toHaveAttribute("aria-expanded", "false");
expect(screen.queryByLabelText("Bağlantı süresi")).not.toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /Güvenlik ayarları/ }));
expect(screen.getByLabelText("Bağlantı süresi")).toBeInTheDocument();
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/__tests__/mobile-share-panel.test.jsx`
Expected: FAIL because security options are always visible and no disclosure exists.

- [ ] **Step 3: Implement disclosure and mobile form CSS**

Add the summary button, collapsible options, 16 px mobile form controls, compact dropzone, two compact method cards above 360 px, and one column at 360 px and below.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/__tests__/mobile-share-panel.test.jsx src/__tests__/video-transfer-ui.test.jsx`
Expected: PASS.

### Task 4: Verification

**Files:**
- Modify: `docs/mobile-video-manual-test.md`

- [ ] **Step 1: Document manual menu checks**

Add checks for hamburger open/close, Escape, backdrop, guest/member links, transfer selector scrolling and security disclosure.

- [ ] **Step 2: Run automated verification**

Run: `npm test`
Expected: all tests PASS.

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 3: Browser-check responsive widths**

At 320, 390 and 430 px, verify no horizontal overflow, menu controls remain visible, page body locks only while drawer is open, and the first transfer method plus part of the second are visible. At desktop width verify the original navigation and grid remain visible.

## Self-review

- Spec coverage: hamburger drawer, account-aware links, non-sticky header, compact selectors, security disclosure, mobile form sizing, reduced motion and responsive checks all map to tasks.
- Placeholder scan: no TBD/TODO or undefined implementation step remains.
- Interface consistency: `MobileNavDrawer` props and `securityOpen` names remain consistent across tasks.
