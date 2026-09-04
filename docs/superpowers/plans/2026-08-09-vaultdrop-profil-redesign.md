# VaultDrop Profil Sayfası Yenileme Uygulama Planı

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Profil sayfasını mevcut veri akışını bozmadan daha güçlü, ferah ve modern bir üyelik paneline dönüştürmek.

**Architecture:** Mevcut `ProfilePage` veri yükleme ve kimlik doğrulama akışı korunacak. Görsel hiyerarşi erişilebilir HTML yapısı, küçük yerel SVG ikonları ve `MemberPages.css` içindeki profil odaklı sınıflarla kurulacak; yeni bağımlılık eklenmeyecek.

**Tech Stack:** React, React Router, CSS, Vitest, Testing Library

**Çalışma alanı notu:** Bu klasör bir Git deposu olmadığı için plandaki aşamalar ayrı commit'lere bölünmeyecek.

---

### Task 1: Profil arayüz sözleşmesini testlerle tanımla

**Files:**
- Modify: `src/__tests__/auth-profile-ui.test.jsx`
- Modify: `src/pages/ProfilePage.jsx`

**Step 1: Başarısız olacak arayüz testlerini yaz**

- Profilde erişilebilir dosya kullanım progress barını doğrula.
- Belirgin “Yeni aktarım” bağlantısını doğrula.
- Üç istatistik kartında anlamlı ikon alanı bulunduğunu doğrula.
- Boş işlem geçmişinde davetkâr metin ve ilk aktarım bağlantısını doğrula.

**Step 2: Testi çalıştır ve doğru nedenle başarısız olduğunu doğrula**

Run: `npm test -- src/__tests__/auth-profile-ui.test.jsx`

Expected: Yeni progress bar, ikon ve boş durum öğeleri henüz olmadığı için test başarısız olur.

**Step 3: En küçük JSX uygulamasını yap**

- Profil başlığını gradient halkalı avatar ve güçlü tipografi yapısına hazırla.
- Üye limiti alanına 0–15 arasında güvenli şekilde hesaplanan progress bar ekle.
- İstatistik kartlarına bağımlılıksız, dekoratif yerel SVG ikonları ekle.
- “Yeni aktarım” CTA’sını ve boş durum aksiyonunu erişilebilir bağlantılar olarak ekle.
- Mevcut özet ve işlem geçmişi veri akışını koru.

**Step 4: Hedef testi yeniden çalıştır**

Run: `npm test -- src/__tests__/auth-profile-ui.test.jsx`

Expected: PASS

### Task 2: Frosted glass görsel sistemi ve responsive düzeni uygula

**Files:**
- Modify: `src/pages/MemberPages.css`

**Step 1: Profil yüzeylerini tasarla**

- Profil başlığı, istatistik kartları ve geçmiş kartına yarı saydam arka plan, ince border, blur ve hafif gölge ekle.
- Sayfa arka planına çok hafif dekoratif renk parlamaları ekle.
- Kart aralıkları ve iç boşlukları ortak bir ritme oturt.

**Step 2: Bileşen hiyerarşisini güçlendir**

- Avatar halkası, isim/e-posta tipografisi, limit etiketi ve yardımcı metinleri düzenle.
- İstatistik rakamlarını büyüt; hover’da küçük yükselme ve ikon vurgusu ekle.
- CTA’ya güçlü renk, gölge, hover ve focus-visible durumları ekle.
- Boş durum ikonunu ve micro-copy alanını biçimlendir.

**Step 3: Responsive ve hareket tercihlerini tamamla**

- Dar ekranlarda profil başlığını, limit panelini ve kartları tek sütuna indir.
- Uzun e-posta ve metinlerin taşmasını engelle.
- `prefers-reduced-motion` tercihinde animasyonları kapat.

**Step 4: Hedef testi ve üretim derlemesini çalıştır**

Run: `npm test -- src/__tests__/auth-profile-ui.test.jsx`

Expected: PASS

Run: `npm run build`

Expected: Başarılı üretim derlemesi.

### Task 3: Tarayıcıda görsel ve davranış doğrulaması yap

**Files:**
- Verify: `src/pages/ProfilePage.jsx`
- Verify: `src/pages/MemberPages.css`

**Step 1: Uygulamayı yerel olarak çalıştır**

Run: Projenin tanımlı geliştirme komutunu başlat.

**Step 2: Profil sayfasını geniş ve dar görünümde incele**

- Navbar, avatar, limit progress barı, üç istatistik kartı, CTA ve boş durumun yerleşimini kontrol et.
- Taşma, sıkışma, düşük kontrast ve kırık hover/focus durumlarını düzelt.

**Step 3: Tam doğrulama paketini çalıştır**

Run: `npm test`

Expected: Tüm testler PASS.

Run: `npm run build`

Expected: Başarılı üretim derlemesi.

**Step 4: Son değişiklikleri kapsam açısından kontrol et**

- Yalnızca profil ekranı, ilgili test ve dokümanların değiştiğini doğrula.
- QR Video ve Şifreli Paket dosyalarına dokunulmadığını doğrula.
