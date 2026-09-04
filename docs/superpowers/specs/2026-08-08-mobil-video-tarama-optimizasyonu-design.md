# Mobil Video Tarama Optimizasyonu Tasarımı

## Amaç

Mobil cihazlarda QR video çözümünü hızlandırmak, tarama sırasında arayüzün donma riskini azaltmak ve kısa kamera taramasının aşırı bellek kullanmasını önlemek.

## Kapsam

Bu aşama iki alanı kapsar:

1. Telefona kaydedilmiş QR video dosyasının taranması.
2. Kameradan yapılan 8–20 saniyelik kısa tarama.

Şifreleme, anahtar doğrulama, dosya oluşturma ve indirme biçimi değişmeyecektir. QR video dosya sınırı, tekrar hesaplamalar ve gerçek video otomasyon testi sonraki aşamalarda ele alınacaktır.

## Seçilen Yaklaşım

Tarama kareleri daha küçük bir çalışma çözünürlüğüne indirilecek ve yakalandıkları anda çözülecektir. Kareler bir listede tutulmayacaktır. İlk aşamada ayrı bir arka plan işçisi eklenmeyecektir; böylece iPhone ve Android tarayıcı uyumluluğu korunurken gereksiz karmaşıklık önlenecektir.

## Video Dosyası Tarama Akışı

- Video bilgileri okunduktan sonra süre belirlenir.
- Her örnekleme noktasında görüntü, en fazla 1280×720 sınırına oranı korunarak küçültülür.
- Küçültülmüş karede QR aranır ve bulunan metin doğrudan mevcut alım oturumuna gönderilir.
- Çözülen QR metinleri ayrı bir dizide biriktirilmez.
- Paket tamamlanır tamamlanmaz tarama sonlandırılır ve şifreli paket döndürülür.
- Tarama boyunca video zamanı üzerinden yüzde bilgisi bildirilir.
- QR kareleri bulunmaya başladıktan sonra toplanan ve toplam kare sayısı ayrıca bildirilir.

## Kısa Kamera Tarama Akışı

- Her 40 milisaniyede yeni bir tuval oluşturulmayacaktır.
- Tek bir küçültülmüş çalışma tuvali tekrar kullanılacaktır.
- Yakalanan kare anında çözülecek ve sonucu mevcut alım oturumuna gönderilecektir.
- Bir önceki çözüm tamamlanmadan yeni çözüm başlatılmayacaktır.
- Süre dolduğunda veya paket tamamlandığında tarama duracaktır.
- Durum metni kalan süreyi ve bulunan yeni QR karesi sayısını gösterecektir.

## Kullanıcı Arayüzü

- Video dosyası taranırken düğmede `Video taranıyor... %42` biçiminde gerçek ilerleme gösterilir.
- Ayrı satırda `Toplanan QR karesi 18 / 40` bilgisi korunur.
- Paket erken tamamlanırsa yüzde doğrudan 100'e çıkarılır ve anahtar adımına geçilir.
- Eksik video için `Video tarandı fakat 18 / 40 QR karesi bulundu` şeklinde anlaşılır hata gösterilir.
- İptal veya yeni dosya seçimi, devam eden taramayı temiz biçimde durdurur.

## Hata ve Kaynak Yönetimi

- Video adresi her sonuçta geri bırakılır.
- Video kaynağı temizlenir ve yeniden yükleme işlemi sonlandırılır.
- Kamera zamanlayıcıları bileşen kapanınca temizlenir.
- Tek kullanımlık çalışma tuvali dışında yakalanmış görüntü tutulmaz.
- Geçersiz QR kareleri sessizce atlanır; gerçek video okuma hataları kullanıcıya açıklanır.

## Testler

- Büyük görüntülerin oranı korunarak çalışma sınırına küçültüldüğü test edilir.
- Video tarama yüzdesinin başlangıçtan sona düzenli ilerlediği doğrulanır.
- Paket tamamlanınca kalan video örneklerinin işlenmediği doğrulanır.
- QR metinlerinin toplu bir dizide biriktirilmeden oturuma aktarıldığı test edilir.
- Kamera taramasında her çekimde yeni tuval listesi oluşmadığı doğrulanır.
- Kamera süresi dolunca ve bileşen kapanınca zamanlayıcıların temizlendiği test edilir.
- Mevcut şifreli QR video, anahtar doğrulama ve indirme testleri korunur.

## Başarı Ölçütleri

- 12 ve 20 saniyelik kamera taramalarında yüzlerce tuval bellekte tutulmaz.
- Video taraması kullanıcıya 0–100 arasında görünür ilerleme verir.
- Paket tamamlandığında tarama videonun sonunu beklemeden biter.
- Mevcut çalışan telefon çözme ve dosya indirme akışı bozulmaz.
- Tüm testler, kod denetimi ve üretim derlemesi başarıyla tamamlanır.

## Sonraki Aşamalar

1. QR video için gerçekçi dosya ve süre sınırları.
2. Dosya okuma ve SHA-256 sonucunun yeniden kullanılması.
3. Oluşturulan gerçek videonun yeniden çözüldüğü tarayıcı testi.
4. Gerekirse QR çözümünün ayrı bir arka plan işçisine taşınması.
