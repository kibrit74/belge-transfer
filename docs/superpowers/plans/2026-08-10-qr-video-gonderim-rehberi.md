# QR Video Gönderim Rehberi Uygulama Planı

> **Uygulama notu:** Bu küçük, onaylanmış arayüz iyileştirmesi doğrudan bu çalışma alanında uygulanacaktır. Proje bir Git çalışma ağacı olmadığı için ayrı çalışma ağacı oluşturulamaz.

**Amaç:** QR Video'yu uzaktaki kişiye gönderirken videonun QR karelerini bozabilecek “medya/video” yolunu açıkça ayırmak ve kullanıcıya güvenli “Belge / Dosya” yolunu görsel olarak göstermek.

**Yaklaşım:** Mevcut QR Video oluşturma ekranındaki iki kısa uyarının yerine, üç adımlı CSS tabanlı bir akış kartı koyacağız. Video oluşturulduktan sonra da kısa bir hatırlatma göstereceğiz. Harici görsel, yazı tipi veya ağ isteği eklenmeyecek.

---

## Görev 1: Davranış testini önce yaz

**Dosya:** `src/__tests__/video-transfer-ui.test.jsx`

1. QR Video oluşturma ekranının üç adımı, doğru/yanlış gönderme seçimini ve anahtarın ayrı gönderilmesi uyarısını kullanıcıya gösterdiğini test et.
2. Video sonucu ekranının kısa “Belge / Dosya olarak gönder” hatırlatmasını gösterdiğini test et.
3. Testi çalıştır ve yeni arayüz henüz olmadığı için başarısız olduğunu doğrula.

## Görev 2: Görsel rehberi uygula

**Dosyalar:** `src/VideoTransferPanel.jsx`, `src/App.css`

1. QR Video oluşturma alanındaki kısa uyarıların yerine üç adımlı, erişilebilir rehber kartını ekle.
2. Videonun bozulabileceği “Galeriden video olarak gönderme” yolunu ve doğru “Ataç → Belge / Dosya” yolunu yan yana göster.
3. Sonuç ekranına, indirme/paylaşım alanından önce kısa bir tekrar hatırlatması ekle.
4. Mobilde kartların alt alta; geniş ekranda akış biçiminde görünmesi için duyarlı CSS ekle.

## Görev 3: Doğrula

1. Hedef arayüz testini çalıştır.
2. Lint ve üretim derlemesini çalıştır.
3. Uygun olduğu için tüm test paketini tek işlemde çalıştır.

## Teslim ölçütleri

- Kullanıcı, videoyu WhatsApp/Telegram içinde medya yerine “Belge / Dosya” olarak göndermesi gerektiğini ilk bakışta anlayabilir.
- Anahtarın aynı mesaja eklenmemesi açıkça belirtilir.
- Rehber mobilde rahat okunur ve mevcut QR Video oluşturma/alma akışını bozmaz.
- Hiçbir içerik, anahtar veya dosya adı dışarı gönderilmez; yeni ağ isteği eklenmez.
