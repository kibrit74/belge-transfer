# Mobil Alım Akışı Tasarımı

## Amaç

Mobil kullanıcıların kendilerine gönderilen QR videoyu kolayca seçip çözebilmesini sağlamak; kamera ile canlı taramayı gerektiğinde kullanılabilen ikinci seçenek olarak korumak.

## Onaylanan Akış

- Kullanıcı `Al` sekmesine geçtiğinde varsayılan olarak `QR video dosyası` yöntemi açılır.
- Ekranın üstünde iki açık seçenek bulunur: `QR video dosyası` ve `Kameradan tara`.
- QR video ekranında yalnızca videoyu açma adımları görünür; video oluşturma alanı gösterilmez.
- Kamera ekranında kamera önizlemesi, kamera değiştirme ve kısa kayıtla tarama kontrolleri görünür.
- Gönderme tarafındaki QR video ekranında yalnızca video oluşturma alanı görünür.

## Kullanıcı Metinleri

- Ana yöntem: `QR video dosyası`
- Ana yöntem açıklaması: `Telefonunuza indirilen QR videoyu seçin`
- İkinci yöntem: `Kameradan tara`
- İkinci yöntem açıklaması: `Başka bir ekrandaki canlı QR kodunu okutun`
- Kamera kısa kayıt düğmesi: `Kısa kayıtla tara`
- Kamera değiştirme düğmesi: `Kamerayı çevir`
- Kamera ipucu yön bağımsız ve kısa olacak.

## Görsel Düzen

- Mevcut koyu renk ve yeşil vurgu korunur.
- Dokunma alanları en az 44 piksel yüksekliğinde tutulur.
- Küçük ekranlarda yatay düğmeler gerektiğinde alt alta geçer.
- Kamera önizlemesi ekran genişliğine oturur ve gereksiz boşluk bırakmaz.
- Başlık, sekmeler ve içerik arasındaki boşluk mobilde azaltılır.

## Teknik Yaklaşım

- `App` içinde alım yöntemi için ayrı durum tutulur ve başlangıç değeri `video` olur.
- Alım yöntemi seçimi küçük, bağımsız bir bileşende gösterilir.
- `VideoTransferPanel`, `create`, `open` veya `both` görünümünü kabul eder.
- Kamera davranışı değiştirilmeden yalnızca metinleri ve düzen sınıfları sadeleştirilir.
- Mevcut QR çözme, şifre çözme ve indirme işlemleri aynen korunur.

## Başarı Ölçütleri

- `Al` sekmesi açıldığında video seçme alanı ilk ekranda görünür.
- Kamera izni, kullanıcı `Kameradan tara` seçmeden istenmez.
- Gönderme ekranında QR video açma alanı görünmez.
- Kullanıcı alım yöntemleri arasında veri kaybı veya sayfa yenileme olmadan geçebilir.
- Mevcut testler, derleme ve kod kontrolü başarılı olur.

