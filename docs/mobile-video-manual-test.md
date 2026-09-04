# Mobil Video ve Kamera Tarama Kontrol Listesi

Bu kontrol listesi gerçek telefon üzerinde uygulanmalıdır. Otomatik testler uygulamanın kod davranışını kontrol eder; gerçek telefon, kamera, dosya seçici, WhatsApp aktarımı ve ekran kapanmaması deneyiminin yerini tutmaz.

## Test bilgileri

- Tarih / saat: ______________________________
- Testi yapan: ______________________________
- Cihaz modeli ve işletim sistemi: ______________________________
- Tarayıcı ve sürümü: ______________________________
- Video uzantısı: ______________________________
- PDF boyutu: __________________ KB
- Kullanılan anahtar: ______________________________

## QR video dosyasıyla alma

| # | Adım | Başarılı | Başarısız | Notlar |
|---|---|---|---|---|
| 1 | 20–50 KB arasındaki bir PDF’yi seçip QR video oluştur. | ☐ | ☐ | PDF boyutu: ______ KB; QR video oluşturuldu mu: ______ |
| 2 | Videoyu WhatsApp ile telefona gönder ve telefonun dosyalarına indir. | ☐ | ☐ | İndirilen konum: __________________ |
| 3 | `Al > QR video dosyası` ekranında videoyu seç. | ☐ | ☐ | Dosya seçildi mi: ______ |
| 4 | Yüzdenin 0’dan 100’e ilerlediğini doğrula. | ☐ | ☐ | Görünen yüzde: ______ → ______ |
| 5 | QR kare sayısının arttığını doğrula. | ☐ | ☐ | Başlangıç kare sayısı: ______; bitiş kare sayısı: ______ |
| 6 | Anahtarı gir ve özgün dosyanın indirildiğini ve açıldığını doğrula. | ☐ | ☐ | Dosya adı: __________________; açıldı mı: ______ |

## Kameradan kısa tarama

| # | Adım | Başarılı | Başarısız | Notlar |
|---|---|---|---|---|
| 7 | `Al > Kameradan tara` ekranında 8 saniyelik kısa taramayı başlat. | ☐ | ☐ | Tarama süresi: ______ saniye |
| 8 | Tarama sırasında durum metninin değiştiğini ve telefonun kapanmadığını doğrula. | ☐ | ☐ | Görülen durum metinleri: __________________; ekran açık kaldı mı: ______ |

## 20 saniyelik kamera testi

Her platformda tarama süresini `20 sn` seç. İlk tarama tamamlandıktan sonra aynı ekranda ikinci taramayı başlat; iki taramanın da kilitlenmeden tamamlandığını doğrula.

| Platform | Başarılı | Başarısız | Notlar |
|---|---|---|---|
| Android Chrome | ☐ | ☐ | Cihaz / sürüm: __________________; ikinci tarama başladı mı: ______ |
| iOS Safari | ☐ | ☐ | Cihaz / sürüm: __________________; ikinci tarama başladı mı: ______ |

## Hata kaydı

Bir adım başarısız olursa aşağıdaki alanları doldur:

- Başarısız adım numarası: ______
- Cihaz modeli ve işletim sistemi: ______________________________
- Tarayıcı ve sürümü: ______________________________
- Video uzantısı: ______________________________
- Görünen yüzde: ______
- Hata mesajı veya beklenen/gerçekleşen davranış:  
  ________________________________________________________________
- Tekrarlanma adımları:  
  ________________________________________________________________
- Ekran görüntüsü / video referansı: ______________________________

## Sonuç

- QR video ile alma: ☐ Başarılı ☐ Başarısız
- Kameradan kısa tarama: ☐ Başarılı ☐ Başarısız
- Android Chrome 20 saniyelik kamera testi: ☐ Başarılı ☐ Başarısız
- iOS Safari 20 saniyelik kamera testi: ☐ Başarılı ☐ Başarısız
- Genel değerlendirme: ☐ Başarılı ☐ Başarısız
- Ek notlar:  
  ________________________________________________________________

## QRF1 gerçek cihaz yayın kapısı

QR Video için “5 MiB yaklaşık 120 saniyede çalışır” ifadesi, aşağıdaki Android ve iPhone satırları gerçek cihazda doldurulup başarılı olmadan kesin ürün vaadi olarak kullanılmamalıdır. Video WhatsApp veya Telegram'da medya olarak değil **dosya-belge olarak** gönderilmelidir.

| Yön | Gönderen cihaz / işletim sistemi / tarayıcı | Alıcı cihaz / işletim sistemi / tarayıcı | Kaynak boyutu | Bağlantı | Profil | Oluşturma süresi | Video süresi | Çözme süresi | Kurtarılan / kayıp sembol | SHA-256 | Sonuç |
|---|---|---|---:|---|---|---:|---:|---:|---|---|---|
| Telefon → Telefon | __________________ | __________________ | ______ | Wi-Fi / Mobil | Dengeli / Uyumlu | ______ sn | ______ sn | ______ sn | ______ / ______ | Eşleşti / Eşleşmedi | ______ |
| Telefon → PC | __________________ | __________________ | ______ | Wi-Fi / Mobil | Dengeli / Uyumlu | ______ sn | ______ sn | ______ sn | ______ / ______ | Eşleşti / Eşleşmedi | ______ |
| PC → Telefon | __________________ | __________________ | ______ | Wi-Fi / Mobil | Dengeli / Uyumlu | ______ sn | ______ sn | ______ sn | ______ / ______ | Eşleşti / Eşleşmedi | ______ |
| PC → PC | __________________ | __________________ | ______ | Wi-Fi / Kablolu | Dengeli / Uyumlu | ______ sn | ______ sn | ______ sn | ______ / ______ | Eşleşti / Eşleşmedi | ______ |

Zorunlu cihazlar:

- Android Chrome: cihaz, Android sürümü ve Chrome sürümü yazılmalı.
- iOS Safari: iPhone modeli, iOS sürümü ve Safari sürümü yazılmalı.
- Windows Chrome ve Windows Edge: bilgisayar bilgisi, Windows ve tarayıcı sürümü yazılmalı.
- Dengeli profil başarısızsa hata kaydedilmeli ve aynı dosya Uyumlu profille yeniden denenmelidir.
- Tarama yarıda kesilip sayfa yeniden açılmalı; 24 saatlik yerel kayıttan “Devam et” ile tamamlanabildiği doğrulanmalıdır.
# Mobilden mobile paket paylaşımı kontrolü

## Şifreli Paket

1. Android Chrome ve iOS Safari'de `/transfer` sayfasını açın.
2. **Gönder → Şifreli paket** yolunda misafir olarak tek dosya / toplam 10 MiB; giriş yaptıktan sonra en fazla 15 dosya / toplam 50 MiB sınırını kontrol edin.
3. `.bta` paketini oluşturun; indirmenin başladığını ve anahtarın kopyalanabildiğini doğrulayın.
4. `.bta` paketini ikinci telefona bir kanal ile, anahtarı ise farklı bir kanal ile gönderin.
5. İkinci telefonda **Al → Şifreli paket** yolunda `.bta` dosyasını seçin, anahtarı girin ve özgün dosyanın indirildiğini kontrol edin.
6. Eski `/al/:id` bağlantısı açılırsa paket, erişim kodu veya indirme hakkı göstermediğini; Şifreli Paket alma ekranına yönlendiren emeklilik mesajını gösterdiğini doğrulayın.

## QR Video paylaşımı

1. **Gönder → QR Video** yolunu seçin ve bir veya daha fazla dosya ekleyin.
2. Video üretildikten sonra videoyu paylaşın veya ikinci telefona indirin.
3. Desteklenen cihazda video dosyasının paylaşım menüsüne eklenebildiğini doğrulayın.
4. Desteklenmeyen tarayıcıda indirme ve anahtar kopyalama seçeneklerinin kullanılabildiğini doğrulayın.
5. İkinci telefonda **Al → QR video dosyası** yolunda videoyu seçin; tarama yüzdesini, ayrı anahtar girişini ve dosya indirmeyi kontrol edin.

## Mobil gezinme ve ekran düzeni

1. Sayfayı 320 px, 390 px ve 430 px genişliklerde açın; yatay taşma olmadığını doğrulayın.
2. Sağ üstteki menü simgesine dokunun; menünün sağdan yumuşak biçimde açıldığını kontrol edin.
3. Menü dışındaki karartılmış alana dokununca ve klavyeden `Esc` tuşuna basınca menünün kapandığını doğrulayın.
4. Menü açıkken arka sayfanın kaymadığını, kapatılınca tekrar kaydırılabildiğini kontrol edin.
5. Aktarım yöntemlerinin yatay kaydırılabildiğini ve sonraki seçeneğin bir bölümünün görünerek kullanıcıya yön verdiğini doğrulayın.
6. Al ekranında Şifreli Paket, QR video ve Kameradan tara seçeneklerinin erişilebilir olduğunu; Şifreli Paketin varsayılan geldiğini kontrol edin.
7. Dosya seçme, paylaşma ve form alanlarının tek elle rahat kullanılabildiğini doğrulayın.
