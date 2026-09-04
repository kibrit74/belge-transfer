# Standart QR Video Hızlı Alıcı Tasarımı

**Tarih:** 13 Ağustos 2026  
**Durum:** Kullanıcı tarafından onaylandı  
**Kapsam:** Siyah-beyaz `Dengeli` QR Video alıcısının hızlandırılması

## 1. Amaç

Orta seviye bir Android telefonda, 5 MiB büyüklüğündeki standart siyah-beyaz `Dengeli` QR Videoyu dosya bütünlüğünden ödün vermeden üç dakikanın altında açmak.

Hedefler:

- Kesin kabul sınırı: en fazla 180 saniye.
- İyi sonuç aralığı: 90–150 saniye.
- Dosya tamamlandığında SHA-256 doğrulaması zorunlu kalır.
- Mevcut QRF1 videolar geriye dönük uyumlu kalır.
- Gönderici video biçimi ve mevcut `Dengeli` profil bu çalışmada değişmez.

## 2. Kapsam Dışı Konular

- Renkli QR motorunun hızlandırılması.
- Renkli QR laboratuvarının ürün kararı veya görünürlüğü.
- QRF1 çerçeve biçiminin değiştirilmesi.
- Sembol başına veri miktarının veya yüzde 50 kurtarma ek yükünün azaltılması.
- Şifreli Paket ve Güvenli Bağlantı akışlarının değiştirilmesi.

Renkli QR laboratuvarı ana ürün yolundan ayrı ele alınacaktır. Bu tasarım yalnız standart siyah-beyaz video alıcısına odaklanır.

## 3. Mevcut Darboğaz

`Dengeli` profil 1920×1080 çözünürlükte, saniyede 24 kare ve aynı karede iki QR üretir. 5 MiB veri için video süresi yaklaşık 118 saniyedir.

Mevcut alıcı:

1. Önce renkli QR olup olmadığını anlamak için videoyu ayrıca yoklar.
2. Standart videoda yaklaşık her `1 / 24` saniyeye tek tek `currentTime` atamasıyla gider.
3. Her atlamada `seeked` olayını veya 200 ms zaman aşımını bekler.
4. 1920×1080 kareden iki adet yaklaşık 900×900 bölge çıkarır.
5. İki bölgenin çözülmesini bekledikten sonra sonraki zaman noktasına geçer.
6. İlk geçiş eksik biterse videonun tamamını yarım kare kaydırılmış ikinci bir ızgarayla tekrar tarar.

Bu düzen video süresinden bağımsız ek beklemeler oluşturur. Darboğaz şifre çözme veya SHA-256 hesabı değil; karelere tek tek atlama, büyük görüntüleri işleme ve ikinci tam taramadır.

## 4. Seçilen Yaklaşım

Gönderici ve protokol değiştirilmeden yalnız alıcı hızlandırılacaktır.

### 4.1 Sıralı kare okuyucu

Yeni bir sıralı kare okuyucu, videoyu film şeridi gibi baştan sona oynatarak işler. Desteklenen tarayıcılarda sunulan her video karesi için kare geri çağrısı kullanılır. Okuyucu şu sorumluluklara sahip olur:

- Video metadata bilgisini ve gerçek çözünürlüğü okumak.
- Kareleri zaman sırasını bozmadan sunmak.
- Çözümleme kuyruğu dolduğunda videoyu geçici olarak durdurmak.
- Kuyruk boşaldığında videoyu kaldığı yerden devam ettirmek.
- İptal, hata ve tamamlanma durumunda video kaynağını temizlemek.

Sıralı kare API'sinin kullanılamadığı veya oynatma başlatılamadığı cihazlarda mevcut seek tabanlı tarayıcı güvenli yedek olarak korunur.

### 4.2 720p işleme ve doğru çift bölge geometrisi

Standart `Dengeli` videonun 1920×1080 karesi, çözümleme için 1280×720 boyutuna indirilir. İki QR bölgesi profil koordinatlarıyla ölçeklenir:

- Sol QR: yaklaşık 600×600.
- Sağ QR: yaklaşık 600×600.

Mevcut kod 1280×720 görüntüde tek merkez bölgeye düşebildiği için bölge seçimi yalnız çözünürlüğe göre yapılmayacaktır. Algılanan veya bilinen profil düzeni kullanılarak iki bölge her çözünürlükte korunacaktır.

Bu değişiklik, her karede işlenen piksel miktarını yaklaşık yüzde 56 azaltır.

### 4.3 Sınırlı paralel çözümleme

İki QR bölgesi mevcut WASM işçi havuzunda paralel çözülür. Kuyruk sınırsız büyümez:

- İşçi sayısı cihazın çekirdek sayısına göre 1–4 arasında kalır.
- En fazla iki video karesi çözümleme kuyruğunda tutulur.
- Kuyruk dolduğunda video durdurulur; kare atlanmaz.
- Her işçi aynı anda tek QR işi işler.
- Sonuçlar kare sırasından bağımsız kabul edilebilir; QRF1 sembol kimliği tekrarları güvenli biçimde eler.

Bu sınırlar düşük bellekli telefonlarda aşırı ısınmayı ve tarayıcı sekmesinin kapanmasını önler.

### 4.4 Uyarlanabilir oynatma hızı

Okuyucu 1× hızda başlar. Telefon çözümlemeyi rahat yetiştiriyorsa oynatma hızı kademeli olarak 1.5× ve en fazla 2× yapılabilir. Kuyruk büyürse hız tekrar 1× seviyesine iner veya video kısa süre durur.

Hız kararı sabit cihaz modeline göre değil, gerçek kuyruk doluluğuna göre verilir. Böylece güçlü telefonlar hızlanırken zayıf telefonlar kare kaybetmez.

### 4.5 Erken tamamlanma

Her geçerli QRF1 sembolü mevcut alım oturumuna aktarılır. Oturum dosyayı oluşturabildiğinde:

1. Sembol toplama durur.
2. Dosya baytları birleştirilir.
3. SHA-256 doğrulanır.
4. Video oynatma ve bekleyen işler iptal edilir.
5. Doğrulanmış şifreli paket mevcut açma akışına verilir.

Video sonuna kadar gereksiz tarama yapılmaz.

### 4.6 Renkli probun standart ana yoldan ayrılması

Ana ürün QR Video ekranı renkli profil üretmeyeceği için standart dosya açma yolunda renkli video probu çalıştırılmaz. Renkli laboratuvar kendi doğrudan renkli çözücüsünü kullanmaya devam edebilir. Eski deneysel renkli videoların otomatik algılanması bu hızlı standart yolun sorumluluğunda değildir.

## 5. Veri Akışı

1. Kullanıcı QR video dosyasını seçer ve “QR videoyu tara” düğmesine basar.
2. Alıcı videonun metadata bilgisini okur.
3. Sıralı okuyucu ilk kareyi 1280×720 analiz tuvaline çizer.
4. Profil geometrisi sol ve sağ 600×600 QR bölgelerini çıkarır.
5. Bölgeler sınırlı işçi havuzuna verilir.
6. Geçerli QRF1 sonuçları alım oturumuna eklenir; tekrarlar sayılır fakat yeniden işlenmez.
7. İlerleme, bulunan benzersiz sembol sayısına ve taranan video zamanına göre gösterilir.
8. Alım oturumu tamamlanırsa SHA-256 doğrulanır ve tarama erken sonlanır.
9. Video biter fakat veri tamamlanmazsa dikkatli tamamlama geçişi çalışır.
10. İkinci geçiş de eksik biterse mevcut kurtarma kaydı korunur ve kullanıcıya bulunan/eksik sembol sayısı gösterilir.

## 6. Tamamlama Geçişi

İlk sıralı geçiş eksik biterse doğrudan ikinci tam tarama başlatılmaz.

- Önce alım oturumunda gerçekten eksik veri olduğu doğrulanır.
- Yedek seek tarayıcı, yarım kare kaydırılmış zaman noktalarıyla çalışır.
- Daha önce kabul edilmiş semboller oturum tarafından tekrar olarak elenir.
- Dosya tamamlandığı anda geçiş durur.
- Kullanıcı iptal ederse kurtarma durumu kaydedilir.

Bu geçiş normal başarı yolunun parçası değil, yalnız hata kurtarma yoludur.

## 7. Hata ve Kaynak Yönetimi

- Kullanıcı iptalinde video, zamanlayıcılar, kare geri çağrıları ve işçi işleri durdurulur.
- Yeni video seçimi eski tarama neslini geçersiz kılar.
- Bir QR bölgesi okunamazsa diğer bölgenin geçerli sonucu korunur.
- Tek bir işçi hata verirse bekleyen işi hata olarak döndürür; havuz ve video kaynakları kontrollü kapanır.
- Sıralı oynatma desteklenmiyorsa seek tabanlı yedek tarayıcıya geçilir.
- SHA-256 doğrulanmazsa dosya yayımlanmaz veya otomatik indirilmez.
- Üç dakika hedefi aşılırsa işlem kesilmez; kullanıcıya bu cihazda Şifreli Paket yönteminin daha pratik olduğu bilgisi gösterilir.
- Hata mesajları teknik kod yerine kullanıcıya anlaşılır Türkçe metinle sunulur.

## 8. İlerleme ve Kullanıcı Deneyimi

Ekranda iki ayrı ilerleme bilgisi korunur:

- Video taraması: işlenen video zamanının yüzdesi.
- Kurtarılan veri: çözülen kaynak sembol oranı.

Ek olarak geçen süre gösterilir. 180 saniye aşıldığında şu yönlendirme görünür:

> Bu cihazda QR Video taraması uzun sürüyor. Büyük dosyalarda Şifreli Paket daha hızlıdır.

Bu uyarı işlemi bozmaz ve kullanıcı isterse taramaya devam edebilir.

## 9. Test Tasarımı

### 9.1 Birim testleri

- 1920×1080 ve 1280×720 karelerde iki QR bölgesinin doğru koordinatlarda üretildiği.
- Kuyruğun iki kareyi aşmadığı ve dolduğunda okuyucunun durduğu.
- Kuyruk boşaldığında oynatmanın devam ettiği.
- Uyarlanabilir hızın 1×–2× sınırları içinde kaldığı.
- İptalin bekleyen kare ve işçi işlemlerini kapattığı.
- Dosya tamamlanınca sonraki karelerin çözülmediği.
- Renkli probun standart hızlı yolda çağrılmadığı.

### 9.2 Entegrasyon testleri

- Gerçek standart QR üreticisinin oluşturduğu çift QR kareleri 1280×720’ye küçültülüp iki bölgeden gerçek WASM okuyucuyla çözülür.
- Kayıp, tekrar ve sıra değişikliği olan semboller doğru şifreli baytları oluşturur.
- İlk geçiş eksik kaldığında yedek geçiş mevcut oturumu tamamlar.
- Eski QRF1 video fixture'ları açılmaya devam eder.
- Tamamlanan dosyanın SHA-256 değeri gönderenle aynıdır.

### 9.3 Performans kabulü

Referans giriş 5 MiB sıkıştırılamayan veridir. `Dengeli` profil ile oluşturulan gerçek video orta seviye Android cihazda Chrome üzerinden taranır.

Başarı şartları:

- Toplam alıcı süresi 180 saniyeyi aşmaz.
- Tercih edilen sonuç 90–150 saniyedir.
- Dosya adı, MIME türü, boyut ve SHA-256 aynıdır.
- Tarama sırasında sekme kapanmaz ve bellek yetersizliği oluşmaz.
- Masaüstü Chrome/Edge ve iPhone Safari regresyon kontrollerinde mevcut videolar açılır.

Gerçek cihaz ölçümü yapılmadan “5 MiB her telefonda iki dakikada açılır” şeklinde kesin ürün vaadi yazılmaz.

## 10. Başarı Ölçütleri

Çalışma şu koşullarda tamamlanmış sayılır:

1. Standart alıcı varsayılan olarak sıralı kare okuyucuyu kullanır.
2. 1280×720 analizde iki QR bölgesi de korunur.
3. Kuyruk ve işçi sayısı sınırlıdır; düşük bellekli cihazda sınırsız büyüme olmaz.
4. Dosya tamamlanınca SHA-256 sonrası erken çıkılır.
5. Desteklenmeyen cihazda mevcut seek tarayıcı çalışır.
6. Tüm mevcut standart QR, şifreli paket ve video regresyonları geçer.
7. Referans Android testinde 5 MiB dosya 180 saniyenin altında doğru açılır.
8. Kod denetimi ve üretim derlemesi yeni hata üretmez.
