# VaultDrop Telefon Tarama Animasyonu Tasarımı

## Amaç

Canlı QR mockup’ındaki telefon ekranını statik çerçeveden çıkarıp gerçek bir tarama süreci gibi anlaşılır hâle getirmek.

## Kök Neden

Mevcut telefon ekranında yalnızca boş bir tarama çerçevesi ve CSS `scan-line` animasyonu bulunur. Global hareket azaltma kuralı animasyonu `0.01ms` seviyesine indirir. Taranacak QR/desen katmanı ve adımlara bağlı görsel durum olmadığı için kullanıcı yalnızca boş çerçeve görür.

## Değerlendirilen Yaklaşımlar

1. **Önerilen ve onaylanan:** React demo adımlarına bağlı QR katmanı, tarama ışığı, algılama durumu ve başarı geçişi.
2. Yalnızca CSS çizgisini güçlendirmek. Daha kısa fakat hareket azaltma ayarında tekrar kaybolabilir.
3. Hazır video/GIF kullanmak. Dosya boyutunu artırır ve mevcut HTML mockup’ını erişilemez hâle getirir.

## Davranış

- Canlı QR sahnesinin ilk adımında telefon bekleme durumundadır.
- QR oluşunca telefon ekranında yarı saydam QR dokusu ve dört köşe hedefi görünür.
- Tarama adımında parlak kırmızı ışık ekran boyunca hareket eder; çerçevede kırmızı bir parıltı oluşur.
- Algılama tamamlanınca çerçeve yeşile döner ve kısa bir onay parlaması görünür.
- Son adımda “Dosya alındı” kartı açılır.
- Hareket azaltma tercihinde uzun kayma yerine adım bazlı konum değişimi kullanılır; tarama hiçbir zaman boş ve statik kalmaz.

## Bileşenler

- `TransferDemo.jsx`: Telefon ekranına QR dokusu, hedef köşeleri, tarama ışığı ve algılama katmanı ekler.
- `LandingPage.css`: `data-scene` ve `data-step` durumlarına göre katmanları görünür yapar ve tarama hareketini tanımlar.

## Testler

- Telefon mockup’ında QR dokusu ve tarama ışığı bulunur.
- Canlı QR sahnesi tarama adımına ilerler.
- Başarı adımında “Dosya alındı” içeriği görünür kalır.
- StrictMode sahne döngüsü ve diğer mockup akışları bozulmaz.

## Kapsam Dışı

Gerçek kamera erişimi, aktarım protokolü ve transfer uygulamasındaki kamera tarayıcısı değiştirilmez.
