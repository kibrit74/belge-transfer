# Login Benefits Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giriş sayfasındaki üç fayda kartını premium füme glass görünüme dönüştürmek.

**Architecture:** Mevcut `LoginPage` yerleşimi korunacak. Anlamsal içeriklere üç sade SVG ikon eklenecek; tüm görsel yüzey, responsive davranış, hover ve azaltılmış hareket desteği `MemberPages.css` içinde tutulacak.

**Tech Stack:** React 19, CSS, Vitest, Testing Library

## Global Constraints

- Mevcut Google giriş davranışı değişmeyecek.
- Yeni paket veya dış ikon bağımlılığı eklenmeyecek.
- Ana panel yarı saydam füme glass yüzey kullanacak.
- Hover yükselmesi en fazla 3 piksel olacak.
- 760 piksel altında tek sütun düzeni korunacak.
- Projede `.git` bulunmadığı için commit adımı uygulanmayacak.

---

### Task 1: Premium glass fayda paneli

**Files:**
- Modify: `src/pages/LoginPage.jsx`
- Modify: `src/pages/MemberPages.css`
- Test: `src/__tests__/auth-profile-ui.test.jsx`

**Interfaces:**
- Consumes: Mevcut `.login-benefits` ve üç `article` öğesi.
- Produces: `.benefit-icon` ve `.benefit-copy` sınıflarıyla erişilebilir üç fayda kartı.

- [x] **Step 1: Failing regression test ekle**

```jsx
render(<LoginPage />);
expect(document.querySelectorAll(".login-benefits .benefit-icon")).toHaveLength(3);
expect(document.querySelectorAll(".login-benefits .benefit-copy")).toHaveLength(3);
```

- [x] **Step 2: Testin önce başarısız olduğunu doğrula**

Run: `npm test -- --run src/__tests__/auth-profile-ui.test.jsx`

Expected: `.benefit-icon` ve `.benefit-copy` öğeleri bulunmadığı için FAIL.

- [x] **Step 3: Kart işaretlemesini ve ikonları ekle**

Her kartı aşağıdaki yapıya dönüştür:

```jsx
<article>
  <span className="benefit-icon" aria-hidden="true"><svg /></span>
  <span className="benefit-copy"><b>Başlık</b><span>Açıklama</span></span>
</article>
```

- [x] **Step 4: Premium glass CSS uygula**

Ana panelde katmanlı koyu gradyan, `backdrop-filter: blur(24px)`, yarı saydam kenar ve iç parlama kullan. Kartları iki sütunlu ikon/içerik düzenine geçir; hover durumunu `transform: translateY(-3px)` ile sınırla. `prefers-reduced-motion` altında geçişleri kapat.

- [x] **Step 5: Hedef testi ve derlemeyi doğrula**

Run: `npm test -- --run src/__tests__/auth-profile-ui.test.jsx`

Expected: PASS.

Run: `npm run build`

Expected: üretim derlemesi başarılı.

- [x] **Step 6: Tarayıcıda responsive kontrol yap**

`http://localhost:5173/giris` sayfasını masaüstü ve 390 piksel genişlikte aç. Panelin taşmadığını, metnin okunaklı olduğunu ve glass/hover görünümünün uygulandığını doğrula.
