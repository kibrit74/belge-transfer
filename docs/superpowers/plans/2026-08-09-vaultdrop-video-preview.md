# VaultDrop QR Video Önizleme Düzeltmesi Uygulama Planı

> **Gerekli beceriler:** `superpowers:test-driven-development`, `frontend-design-expert`, `superpowers:verification-before-completion`

**Amaç:** Oluşturulan QR videonun sonuç alanından taşmasını engelleyip önizlemeyi masaüstü ve mobilde kontrollü, okunaklı bir kart içinde göstermek.

**Yaklaşım:** Mevcut video üretme akışına dokunmadan yalnız sonuç görünümünün semantik yapısı ve CSS'i düzenlenecek. Video 16:9 çerçevede, en fazla 560 px genişlikte ve `object-fit: contain` ile bütünü görünür biçimde sunulacak.

**Teknoloji:** React 19, CSS, Vitest, Testing Library

**Kısıtlar:** Proje Git deposu değil; commit adımları uygulanmayacak. Şifreleme ve QR video üretim protokolü değişmeyecek.

### Görev 1: Sonuç önizlemesi sözleşmesini testle sabitle

**Dosya:** `src/__tests__/video-transfer-ui.test.jsx`

1. QR video oluşturulduğunda erişilebilir etiketli bir video önizlemesi ve taşmayı sınırlayan sonuç bölgesi beklentisini ekle.
2. `npx vitest run src/__tests__/video-transfer-ui.test.jsx` çalıştır; testin beklenen nedenle başarısız olduğunu doğrula.

### Görev 2: Responsive video kartını uygula

**Dosyalar:** `src/VideoTransferPanel.jsx`, `src/App.css`

1. Video için erişilebilir etiket, `playsInline`, önizleme çerçevesi ve sonuç kartı ekle.
2. Kartı ortala, genişliği `min(100%, 560px)` ile sınırla, 16:9 çerçeve ve `object-fit: contain` uygula.
3. Eylem düğmelerinin dar ekranlarda taşmamasını sağla.
4. Hedef testi yeniden çalıştır ve geçtiğini doğrula.

### Görev 3: Genel doğrulama

1. `npm test` çalıştır.
2. `npm run lint` çalıştır.
3. `npm run build` çalıştır.
4. Çalışan uygulamada masaüstü ve dar ekran görünümünü kontrol et.
