# QR Video Gönderim Rehberi Tasarımı

## Amaç

QR Video oluşturan kişinin videoyu mesajlaşma uygulamasında yanlış biçimde göndermesini önlemek. Kullanıcı, videoyu normal medya olarak değil dosya-belge olarak göndermesi gerektiğini tek bakışta anlamalıdır.

## Seçilen yaklaşım

Üç alternatif değerlendirildi:

1. Yalnız kısa metin uyarısı: az yer kaplar fakat nedenini anlatmaz.
2. Uygulama adına göre ayrı yardım pencereleri: daha ayrıntılıdır fakat kullanıcıyı gereksiz seçimlere sokar.
3. Üç adımlı sabit gönderim şeması: en kolay anlaşılır yaklaşımdır ve telefon/PC ayrımı gerektirmez.

Üçüncü yaklaşım seçildi.

## Yerleşim

- Rehber, QR Video oluşturma bölümünde mevcut iki kısa uyarının yerini alır.
- QR Video sonucu oluştuğunda aynı rehber, paylaş ve indir düğmelerinin hemen üstünde kısa sürümüyle tekrar görünür.
- Mobil ekranda üç adım alt alta; geniş ekranda soldan sağa akar.

## İçerik

Şema şu sırayı gösterir:

1. QR videoyu oluştur.
2. WhatsApp veya Telegram'da ataç simgesinden Belge/Dosya seç.
3. Alıcı QR videoyu açar ve dosyayı yeniden oluşturur.

Altında iki açık karşılaştırma yer alır:

- Yanlış: Galeriden Video gönderme — uygulama görüntüyü küçültüp QR karelerini bozabilir.
- Doğru: Belge/Dosya olarak gönder — QR video dosyası değişmeden kalır.

Anahtar için ayrı bir sarı not bulunur: Anahtar, video ile aynı mesajda değil ayrı mesajla gönderilir.

## Görsel dil

- Mevcut VaultDrop renkleri, yumuşak köşeler ve açık arka plan korunur.
- Kırmızı yalnız yanlış yolu; yeşil yalnız doğru yolu belirtir. Metin de anlamı tek başına açıklar.
- Yeni bir resim, harici yazı tipi veya ağ isteği eklenmez. Şema doğrudan HTML/CSS ile çizilir.

## Davranış ve erişilebilirlik

- Şema statiktir; kullanıcıdan tıklama veya ek izin istemez.
- Ekran okuyucu için anlamlı başlıklar ve kısa açıklamalar kullanılır.
- Dar ekranlarda yatay kaydırma oluşturmaz.

## Testler

- Oluşturma ekranında üç adım, doğru/yanlış karşılaştırması ve anahtar notu görünür.
- Video sonucu ekranında kısa paylaşım hatırlatması görünür.
- Mobil CSS kuralı üç adımı alt alta yerleştirir.
- Mevcut QR Video oluşturma ve paylaşma testleri çalışmaya devam eder.
