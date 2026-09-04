# Standart QR Video Hızlı Gönderici Tasarımı

**Tarih:** 13 Ağustos 2026  
**Durum:** Kullanıcı yaklaşımı onayladı; yazılı belge incelemede  
**Kapsam:** Standart siyah-beyaz `Dengeli` QR Video üretimini hızlandırma

## 1. Sorun

2,36 MB büyüklüğündeki sıkıştırılmış bir MP4 dosyasının standart QR Videoya dönüştürülmesi gerçek kullanımda yaklaşık 16 dakika sürmüştür. Bu süre son kullanıcı için kabul edilebilir değildir.

Ölçülen veri akışı:

- Şifreli veri yaklaşık 2,36 MB'dir.
- 1.400 baytlık bloklarla 1.768 kaynak sembol oluşur.
- Yüzde 50 kurtarma payıyla 2.652 QR sembolü üretilir.
- Dengeli profil aynı karede iki QR taşıdığı için 1.326 video karesi gerekir.
- 24 FPS değerinde videonun kuramsal süresi yaklaşık 56 saniyedir.

Video içeriği yaklaşık 56 saniye olmasına rağmen üretimin 16 dakika sürmesinin nedeni dosya şifreleme veya fountain kodlama değildir. Mevcut üretici her QR sembolünü doğrudan 900×900 piksellik bir ara tuvale çizer. Her video karesi iki QR taşıdığı için toplamda yaklaşık 2,1 milyar ara piksel JavaScript tarafından hazırlanır. QR matrisi oluşturma ve büyük `ImageData` doldurma işi ana ekran iş parçacığında sırayla çalışır; telefon 24 FPS hızına yetişemediğinde MediaRecorder kaydı duvar saatiyle uzar.

## 2. Amaç ve Kabul Sınırı

2,36 MB büyüklüğündeki sıkıştırılamayan veya zaten sıkıştırılmış bir dosyayı orta seviye Android Chrome cihazda standart `Dengeli` QR Videoya en fazla 120 saniyede dönüştürmek.

Hedefler:

- Bağlayıcı üst sınır: 120 saniye.
- Tercih edilen aralık: 60–90 saniye.
- Oluşan videonun hedef içerik süresi yaklaşık 56 saniye olarak kalır.
- Dosya adı, MIME türü, boyut ve SHA-256 değeri alıcıda aynı çıkar.
- Mevcut QRF1 protokolü ve eski alıcı uyumluluğu korunur.
- Telefon belleği sınırsız bir QR önbelleği nedeniyle büyümez.

Gerçek Android cihaz ölçümü yapılmadan her telefonda iki dakikanın altı ürün vaadi yazılmaz.

## 3. Kapsam Dışı Konular

- Renkli QR laboratuvarı ve CRF2 üreticisi.
- Alıcı tarafındaki sıralı video tarama optimizasyonu.
- QRF1 metin biçiminin değiştirilmesi.
- Sembol başına 1.400 bayt değerinin veya yüzde 50 kurtarma payının değiştirilmesi.
- Hata düzeltme seviyesinin `M` değerinden düşürülmesi.
- Yeni bir video kapsayıcı veya WebCodecs tabanlı özel muxer yazılması.
- Şifreleme, anahtar taşıma ve kurtarma kaydı sözleşmelerinin değiştirilmesi.

## 4. Değerlendirilen Yaklaşımlar

### 4.1 Yalnız doğal boyutlu QR çizimi

QR yaklaşık 165 modüllük doğal matris boyutunda oluşturulup video karesine keskin biçimde büyütülebilir. Büyük `ImageData` maliyetini ciddi ölçüde azaltır ve en küçük değişikliktir. Ancak QR matrisinin kendisi hâlâ ana ekran iş parçacığında sırayla hesaplanacağı için yavaş telefonlarda 120 saniye hedefi güvenilir değildir.

### 4.2 Doğal boyut + paralel ön hazırlama — seçilen yaklaşım

QR matrisi ve doğal boyutlu piksel verisi 2–4 arka plan işçisinde hazırlanır. Ana ekran yalnız hazır küçük bitmapleri video tuvaline büyütür. Sınırlı bir kuyruk sıradaki kareleri önceden hazır tutar. Bu yaklaşım protokolü değiştirmeden hem büyük piksel maliyetini hem de tek çekirdek darboğazını azaltır.

### 4.3 Daha yoğun QR yükü

Sembol boyutunu artırmak ve hata düzeltme seviyesini düşürmek kare sayısını azaltabilir. Ancak QR daha yoğun olur, sıkıştırılmış videoda okuma güvenilirliği düşebilir ve mevcut ürün dengesini değiştirir. Bu çalışma için seçilmemiştir.

## 5. Mimari

### 5.1 QR hazırlama işçisi

Yeni standart QR hazırlama işçisi şu girdiyi alır:

```text
{ id, frameIndex, regionIndex, text }
```

İşçi:

1. QRF1 metninden `qrcode` kütüphanesiyle hata düzeltme seviyesi `M` olan QR matrisi üretir.
2. İki modüllük beyaz kenarı ekler.
3. Her QR modülünü tek piksel olarak doğal boyutlu siyah-beyaz RGBA verisine dönüştürür.
4. Sonucu aktarılabilir tamponla geri yollar:

```text
{ id, frameIndex, regionIndex, width, height, pixels }
```

Doğal çıktı yaklaşık 169×169 pikseldir; mevcut 900×900 ara tuval oluşturulmaz.

İşçi QR metnini, şifreleme anahtarını veya dosya içeriğini ağ üzerinden göndermez. İşlem yalnız cihaz içinde gerçekleşir.

### 5.2 Sınırlı hazırlama havuzu

Yeni havuz:

- İşçi sayısını `navigator.hardwareConcurrency` değerine göre 2–4 arasında sınırlar.
- Her işçiye aynı anda yalnız bir QR görevi verir.
- Sonuçları kare ve bölge kimliğiyle eşleştirir.
- En fazla sekiz video karesini önceden hazırlar.
- Kuyruk dolduğunda yeni QR görevi üretmez.
- İptalde bekleyen görevleri reddeder ve sahip olduğu işçileri sonlandırır.
- Bir işçi hata verirse tüm kayıt oturumunu anlaşılır hata ile durdurur; eksik video başarı olarak yayımlanmaz.

Sekiz karelik üst sınır, Dengeli profil için en fazla 16 küçük QR bitmapinin bellekte tutulması anlamına gelir. 169×169 RGBA varsayımıyla piksel tamponları yaklaşık 1,8 MB ile sınırlı kalır.

### 5.3 Kare ön hazırlama

Şifreleme, fountain sembolleri ve QRF1 metinleri mevcut şekilde oluşturulur. Ardından üretici kayan bir pencere kullanır:

1. İlk sekiz video karesinin QR görevleri havuza gönderilir.
2. Sıradaki video karesinin iki QR sonucu birlikte hazır olduğunda kare `ready` durumuna geçer.
3. MediaRecorder yalnız ilk kare hazır olduktan sonra başlatılır.
4. Her kayıt adımında hazır kare video tuvaline çizilir.
5. Tüketilen karenin yerine sıradaki tek kare hazırlama kuyruğuna alınır.
6. Kuyruk yetişemezse kayıt döngüsü hazır kareyi bekler; yanlış veya boş kare çizmez.

Sonuçlar işçilerden farklı sırayla gelebilir; video çizimi her zaman `frameIndex` sırasını korur.

### 5.4 Keskin büyütme

Ana video tuvalinde `imageSmoothingEnabled = false` kullanılır. Doğal boyutlu QR bitmapleri mevcut profil bölgelerine, yani iki adet 900×900 alana büyütülür.

Korunan özellikler:

- Beyaz arka plan.
- İki modüllük sessiz kenar.
- Siyah-beyaz renkler.
- Dengeli profilde iki QR'nin mevcut koordinatları.
- Uyumlu profilde tek QR'nin mevcut koordinatları.
- QRF1 metninin birebir aynı olması.

## 6. Kayıt Zamanlaması

MediaRecorder gerçek zamanlı çalışmaya devam eder. Amaç 56 saniyelik videoyu sıfır saniyede üretmek değildir; QR hazırlama maliyetini video oynatma hızının altına indirmektir.

- Kayıt başlamadan önce küçük bir hazır kare tamponu oluşturulur.
- Kare zamanı mevcut profil FPS değeriyle hesaplanır.
- Hazır kare mevcutsa planlanan zamanda çizilir.
- Hazır kare gecikirse kayıt döngüsü onu bekler ve sonraki zaman hedeflerini gerçek başlangıca göre yeniden dengeleyerek çizim gecikmesini üst üste biriktirmez.
- Aynı kare yanlışlıkla iki kez çizilmez.
- Son kare çizildikten sonra kayıt kontrollü biçimde durdurulur.

Bu tasarımın alt sınırı yaklaşık 56 saniyelik gerçek video süresidir. 60–90 saniye iyi sonuç, 120 saniye kabul sınırıdır.

## 7. İlerleme ve Kullanıcı Deneyimi

Mevcut genel yüzde korunur, ancak kayıt aşaması iki anlaşılır alt metinle desteklenir:

- `QR kareleri hazırlanıyor…`
- `Video kaydediliyor…`

İlk hazır tampon oluşturulurken ilerleme donmuş görünmemelidir. Kullanıcı iptal ederse:

- QR görevleri durur.
- Hazırlama işçileri sonlandırılır.
- MediaRecorder aktifse durdurulur.
- Canvas akışındaki medya izleri kapatılır.
- Yarım video başarı sonucu olarak sunulmaz.
- Mevcut şifreli kurtarma kaydı korunur.

## 8. Hata Yönetimi

- Worker oluşturulamıyorsa doğal boyutlu ana-ekran çizimi güvenli yedek olarak kullanılabilir; kullanıcıya cihazın daha yavaş çalışabileceği bildirilir.
- QR matrisi üretilemezse işlem `QR karesi hazırlanamadı` hatasıyla durur.
- Worker beklenmedik biçimde kapanırsa bekleyen tüm işler reddedilir.
- MediaRecorder hata verirse hazır kare kuyruğu ve işçiler kapatılır.
- Kullanıcı yeni dosya seçerse eski üretim nesli geçersiz kılınır; eski sonuç yayımlanmaz.
- `AbortSignal` şifreleme, hazırlama, kayıt ve finalizasyon arasında kontrol edilir.
- Kurtarma kaydı yalnız video başarıyla tamamlanınca silinir.

## 9. Test Tasarımı

### 9.1 Birim testleri

- QR hazırlama işçisi aynı QRF1 metni için hata düzeltme seviyesi `M`, iki modül kenar ve doğal boyutlu piksel tamponu üretir.
- Doğal QR boyutu 900×900 değildir ve modül başına tek pikseldir.
- Siyah ve beyaz dışındaki renkler üretilmez.
- Havuz 2–4 işçi sınırını korur ve bir işçiye iki aktif görev vermez.
- Hazır kare kuyruğu sekiz kareyi aşmaz.
- İşçiler sıra dışı tamamlansa bile çizim kare sırasını korur.
- İptal bekleyen işleri ve sahip olunan işçileri kapatır.
- Worker erişilemezse doğal boyutlu ana-ekran yedeği devreye girer.

### 9.2 Entegrasyon testleri

- Gerçek QRF1 metni işçide doğal bitmap olur, 900×900 bölgeye keskin büyütülür ve gerçek QR okuyucu tarafından tekrar aynı metin olarak çözülür.
- Dengeli profilde iki farklı QR aynı video karesinde doğru bölgelere çizilir.
- Uyumlu profilde tek QR çalışmaya devam eder.
- Oluşturulan video sonucu mevcut alanları korur: `blob`, `keyText`, `transferId`, `sha256`, `opticalSha256`, `durationSeconds`, `mimeType`, `protocolVersion`, `profileId`.
- Şifreleme anahtarı QR metinlerinde, worker mesaj kayıtlarında veya kurtarma kaydında bulunmaz.
- Mevcut alıcı QRF1 karelerini kabul eder ve SHA-256 aynı dosyayı oluşturur.

### 9.3 Performans kabulü

Referans girdi 2,36 MB sıkıştırılamayan veridir. Orta seviye Android Chrome üzerinde:

- Toplam üretim süresi en fazla 120 saniye.
- Tercih edilen sonuç 60–90 saniye.
- Video süresi yaklaşık 56 saniye.
- Çıktı dosyası alıcıda eksiksiz açılır ve SHA-256 aynıdır.
- Sekme kapanmaz, bellek taşması oluşmaz ve telefon kullanılabilir kalır.

Otomatik testler iş sayısını, kuyruk sınırını ve hesaplanan video süresini doğrular; gerçek 120 saniye kabulü fiziksel cihaz ölçümüyle tamamlanır.

## 10. Geriye Dönük Uyumluluk

- Wire protokolü QRF1 olarak kalır.
- `encodeFrameV4` çıktısı değişmez.
- 1.400 bayt sembol, yüzde 50 kurtarma payı ve `M` hata düzeltme seviyesi korunur.
- Video çözünürlüğü, FPS, çift QR koordinatları ve MIME seçimi değişmez.
- Daha önce oluşturulmuş videolar yeni alıcıyla; yeni oluşturulmuş videolar mevcut QRF1 alıcısıyla açılmaya devam eder.

## 11. Başarı Ölçütleri

Çalışma şu koşullarda tamamlanmış sayılır:

1. Standart QR üretici 900×900 ara QR tuvali üretmez.
2. QR hazırlığı varsayılan olarak 2–4 arka plan işçisinde yürür.
3. Hazır kare kuyruğu sekiz kareyi aşmaz.
4. Video çizimi kare sırasını ve iki QR bölgesini korur.
5. İptal ve hata yolları worker, MediaRecorder, stream ve bekleyen görevleri temizler.
6. Mevcut QRF1 protokol ve alıcı regresyonları geçer.
7. Tam test takımı, kod denetimi ve üretim derlemesi yeni hata üretmez.
8. Referans Android cihazda 2,36 MB dosya 120 saniye veya altında videoya dönüşür.
9. Alıcıda oluşturulan dosyanın SHA-256 değeri kaynakla aynıdır.

