# VaultDrop Hızlı Şifreli QR Motoru Tasarımı

## 1. Amaç

VaultDrop'un mevcut QR Video aktarımını, şifreleme ve sunucusuzluk ilkelerini bozmadan telefon ve bilgisayarlar arasında kullanılabilecek hızlı ve kayıp karelere dayanıklı bir yapıya dönüştürmek.

İlk sürümün ölçülebilir hedefi, Dengeli profilde 5 MiB şifreli veriyi en fazla 120 saniyelik bir QR taşıyıcı videosuna dönüştürmek ve bu videoyu orta sınıf hedef telefonda en fazla 120 saniyede çözmektir.

Bu 5 MiB değeri bir hesap veya aylık kota değildir. Yalnızca QR Video motorunun ilk performans ve kabul testi boyutudur.

## 2. Kapsam

İlk sürüm aşağıdaki yönlerin tamamını destekleyecektir:

- Telefon → telefon
- Bilgisayar → telefon
- Telefon → bilgisayar
- Bilgisayar → bilgisayar

QR taşıyıcı videosu gönderen cihazın tarayıcısında oluşturulur. Alıcı cihaz videoyu VaultDrop'a dosya olarak seçer ve özgün dosyaları kendi tarayıcısında yeniden oluşturur.

Canlı QR aktarımı aynı kodlama motorunu daha sonra kullanabilecek şekilde sınırlar ayrılarak tasarlanacaktır. Ancak bu çalışmanın ilk teslim hedefi, uzaktaki kullanıcılar için paylaşılabilen QR Video akışıdır. Canlı kamera aktarımının arayüz ve performans geliştirmesi ayrı bir uygulama aşamasıdır.

## 3. Değişmeyecek güvenlik sözleşmesi

- Kaynak dosyalar mevcut BTA1 düzeniyle ve AES-256-GCM kullanılarak gönderen cihazda şifrelenir.
- Sunucu kaynak dosyayı, BTA verisini, QR videosunu, şifreleme anahtarını veya dosya içeriğinden türetilmiş taşıma verisini almaz ve saklamaz.
- QR kareleri yalnızca şifreli BTA verisini taşır.
- Dosya adı, dosya türü ve diğer özel üst bilgiler açık QR metnine yazılmaz.
- Şifreleme anahtarı QR videosuna eklenmez ve kurtarma alanına kaydedilmez.
- Alıcıda birleştirilen şifreli BTA verisi SHA-256 ile doğrulanmadan kullanıcıya çıktı sunulmaz.
- Yanlış anahtar veya doğrulama hataları içerik hakkında ayrıntı sızdırmayan genel mesajlarla gösterilir.
- Özgün dosya yalnız alıcının cihazında, doğru anahtar girildikten sonra yeniden oluşturulur.

## 4. Seçilen yaklaşım

Decimen projesinin güncel kaynak kodu doğrudan alınmayacaktır. Güncel sürümün lisans koşulları ve VaultDrop'un farklı güvenlik sözleşmesi nedeniyle bağımsız bir motor geliştirilecektir.

Yeni motor aşağıdaki ilkeleri kullanacaktır:

- Şifreli BTA verisini sabit boyutlu kaynak bloklarına ayırma
- Kaybolan parçaların yerine geçebilen sistematik fountain kurtarma parçaları üretme
- Karelerin sırasına, tekrarına veya bir bölümünün kaybolmasına bağımlı olmama
- Aynı video karesinde birden fazla bağımsız QR bölgesi kullanabilme
- QR bölgelerini paralel tarayıcı işçilerinde çözme
- Video okuma, QR çözme ve veri birleştirme görevlerini birbirinden bağımsız tutma
- Protokolü sürümlendirerek eski QR Video dosyalarını açmaya devam etme

Mevcut QRT3 ve eski video alma yolu korunacaktır. Yeni videolar yeni ve açıkça sürümlendirilmiş bir optik taşıma biçimi kullanacaktır. Alıcı, videodaki ilk geçerli kareden hangi çözme motorunun kullanılacağını belirleyecektir.

## 5. Veri akışı

### 5.1 Gönderme

1. Kullanıcı bir veya birden fazla dosya seçer.
2. Mevcut dosya sayısı, işlem toplamı ve hesap kuralları uygulanır.
3. Dosyalar gönderen cihazda şifreli BTA1 paketine dönüştürülür.
4. Şifreli BTA baytları kaynak bloklarına ayrılır.
5. Kaynak bloklar ve gerektiğinde üretilen kurtarma blokları QR sembollerine dönüştürülür.
6. QR sembolleri seçilen profile göre bir veya iki bölge halinde video karelerine yerleştirilir.
7. Tarayıcının desteklediği uygun MP4 veya WebM taşıyıcı oluşturulur.
8. Telefonda paylaşım/kaydetme, bilgisayarda indirme seçenekleri sunulur.
9. Kullanıcıya videoyu mesajlaşma uygulamasında medya olarak değil, dosya veya belge olarak göndermesi açıkça anlatılır.

### 5.2 Alma

1. Kullanıcı QR taşıyıcı videosunu dosya seçiciden veya bilgisayarda sürükleyip bırakarak açar.
2. Video biçimi ve çözme yeteneği işlem başlamadan kontrol edilir.
3. Video kareleri sırayla okunur ve QR bölgeleri paralel işçilere dağıtılır.
4. Geçerli, yinelenen, bozuk ve farklı oturuma ait semboller birbirinden ayrılır.
5. Yeterli kaynak/kurtarma sembolü toplanınca şifreli BTA verisi birleştirilir.
6. Bütünlük doğrulaması yapılır.
7. Kullanıcı ayrı kanaldan aldığı anahtarı girer.
8. Özgün dosyalar alıcının cihazında yeniden oluşturulur.

## 6. Performans profilleri

### Dengeli profil

- Varsayılan profil
- 1920×1080 taşıyıcı hedefi
- Aynı karede iki QR bölgesi
- 24 FPS hedefi
- QR başına başlangıçta 1.400 bayt şifreli sembol yükü
- Kaynak blok sayısının yüzde 50'si kadar toplam aktarım ek yükü; bunun içinde kurtarma sembolleri ve protokol gideri bulunur
- 5 MiB şifreli veri için en fazla 120 saniyelik video hedefi
- Güncel orta sınıf telefonlar ve bilgisayarlar için tasarlanır

### Uyumlu profil

- Eski, yavaş veya iki QR bölgesini güvenilir okuyamayan cihazlar için
- 1280×720 taşıyıcı hedefi
- Tek QR bölgesi
- 15 FPS hedefi
- QR başına başlangıçta 700 bayt şifreli sembol yükü
- Dengeli profille aynı yüzde 50 toplam aktarım ek yükü
- Daha uzun süre karşılığında daha düşük QR yoğunluğu ve daha kolay okuma

Bu başlangıç değerleri uygulama planındaki ilk performans tabanıdır. Gerçek cihaz denemelerinde değiştirilmeleri gerekirse, yüzde 20 kare kaybı ve 120 saniyelik Dengeli profil kabul koşulları korunmadan varsayılan değer yükseltilmeyecektir.

İlk sürümde kullanıcıya gereksiz teknik ayarlar gösterilmez. Sistem Dengeli profili önerir; cihaz veya test sonucu uygun değilse Uyumlu profil anlaşılır bir gerekçeyle sunulur.

## 7. Bileşen sınırları

### Şifreli kaynak hazırlayıcı

Mevcut BTA1 üretimini çağırır ve yalnızca şifreli baytları optik motora verir. QR protokolünü veya video üretimini bilmez.

### Fountain kodlayıcı ve çözücü

Kaynak blokları ve kurtarma sembollerini yönetir. QR, video, kullanıcı arayüzü ve şifre çözme işlemlerini bilmez. Aynı giriş ve aynı sembol kimliği için belirli sonuç üretir; böylece test edilebilir ve yarım kalan işlemler devam ettirilebilir.

### Sürümlü QR çerçevesi

Rastgele oturum kimliği, protokol sürümü, sembol kimliği, blok bilgisi, şifreli yük bölümü ve kare hata kontrolünü taşır. Anahtar veya açık dosya üst bilgisi taşımaz.

### Video oluşturucu

QR sembollerini profile göre tuvale yerleştirir ve tarayıcının desteklediği video biçimini üretir. Fountain kodlama veya BTA içeriği hakkında karar vermez.

### Video kare okuyucu

Desteklenen hızlı video okuma yolunu kullanır; desteklenmeyen cihazda HTML video tabanlı uyumlu yola düşer. QR çözme işini doğrudan yapmak yerine kareleri işçi havuzuna verir.

### QR işçi havuzu

Bir veya iki QR bölgesini paralel çözer. İşçi sayısı cihazın işlem gücüne göre sınırlandırılır; telefonun kilitlenmesine veya aşırı ısınmasına yol açacak sınırsız paralellik kullanılmaz.

### Kurtarma deposu

Yalnız şifreli BTA baytlarını, toplanan şifreli sembolleri ve hassas olmayan oturum ilerlemesini cihazın yerel tarayıcı alanında geçici tutar. Anahtar tutmaz.

## 8. Yarım kalan işlemleri kurtarma

### Oluşturma kurtarması

Şifreli BTA hazırlandıktan sonra video üretimi kesilirse şifreli veri geçici depodan yeniden okunabilir ve video baştan üretilebilir. Video kaydının tam ortasından bir medya dosyasına ekleme yapılması tarayıcılar arasında güvenilir olmadığı için, yarım video birleştirilmez; güvenli ve belirli sonuç veren yeniden üretim yapılır.

Anahtar yerel kurtarma deposuna yazılmaz. Kullanıcıya video üretimi başlamadan önce anahtarı kopyalaması veya güvenli biçimde kaydetmesi hatırlatılır.

### Alma kurtarması

Toplanan geçerli semboller yerel ve şifreli taşıma verisi olarak saklanır. Sayfa kapanırsa kullanıcı aynı videoyu tekrar seçtiğinde daha önce toplanan sembollerle devam edilir. Yinelenen semboller depolama ve ilerleme hesabını büyütmez.

Başarılı işlemde kurtarma kaydı otomatik silinir. Kullanıcı kaydı elle silebilir. Tamamlanmayan kayıtlar en geç 24 saat sonra temizlenir. Yerel depolama kullanılamıyorsa aktarım devam eder fakat devam ettirme güvencesi olmadığı açıkça belirtilir.

## 9. Hata yönetimi

- Eksik semboller: Toplanan miktar korunur; aynı veya tamamlayıcı video tekrar seçilebilir.
- Bozuk QR karesi: Kare yok sayılır; yeterli başka sembol varsa işlem sürer.
- Yanlış oturum karesi: Aktif aktarıma karıştırılmaz.
- Desteklenmeyen video: İşlem başlamadan biçim ve tarayıcı yeteneği açıklanır.
- Bütünlük hatası: Dosya sunulmaz; bozuk taşıyıcı uyarısı gösterilir.
- Yanlış anahtar: Genel şifre çözme hatası gösterilir.
- Depolama yetersizliği: Kullanıcıya kurtarma olmadan devam edildiği bildirilir.
- Bellek veya işlem gücü yetersizliği: Dengeli profil durdurulur ve Uyumlu profil önerilir.
- Kullanıcı iptali: Çalışan video okuyucu, işçiler ve geçici nesne adresleri temizlenir; kullanıcının açıkça istediği kurtarma kaydı korunur.

## 10. Kullanıcı deneyimi

Gönderme ekranı aşağıdaki aşamaları ayrı gösterir:

1. Şifreleme
2. Kurtarma parçalarını hazırlama
3. QR videosunu oluşturma
4. Tamamlandı

İşlem başlamadan önce dosya boyutu, tahmini video süresi, tahmini oluşturma süresi ve önerilen profil gösterilir.

Alma ekranında taranan video yüzdesi ile veri kurtarma yüzdesi birbirinden ayrılır. Kullanıcı okunan sembol sayısı, anlık hız ve tahmini kalan süreyi görebilir. Teknik hata kodları yerine ne yapılması gerektiğini söyleyen kısa Türkçe mesajlar kullanılır.

Telefonlarda paylaşım menüsü ve Dosyalar'a kaydetme; bilgisayarlarda indirme ve sürükleyip bırakma desteklenir.

## 11. Test stratejisi

### Birim testleri

- Kaynak bloklardan üretilen sembollerin yeniden birleştirilmesi
- Karelerin sırasının karışması
- Yinelenen kareler
- En az yüzde 20 kare kaybı
- Bozuk kare hata kontrolü
- Farklı oturumların karışmaması
- Eski QRT3 videolarının eski çözücüyle açılmaya devam etmesi
- Kurtarma kaydının anahtar ve açık dosya üst bilgisi içermemesi

### Bütünleşme testleri

- 5 MiB şifreli BTA → QR sembolleri → kontrollü kare kaybı → aynı BTA baytları
- Video oluşturma → video okuma → şifreli paket doğrulama
- Yarım alma → sayfa/oturum yenileme benzetimi → devam etme
- İptal ve kaynak temizliği
- Ağ çağrısı yapılmadığının doğrulanması

### Gerçek cihaz matrisi

- Android Chrome: 2022 veya sonrası, en az 6 GB belleğe ve sekiz çekirdekli orta sınıf işlemciye sahip hedef telefon
- iOS Safari: iPhone 12 veya daha yeni bir hedef cihaz
- Windows Chrome
- Windows Edge
- Telefon → telefon
- Bilgisayar → telefon
- Telefon → bilgisayar
- Bilgisayar → bilgisayar
- WhatsApp veya Telegram üzerinden dosya/belge olarak gönderilmiş taşıyıcı

Gerçek cihaz sonuçlarında cihaz modeli, işletim sistemi, tarayıcı sürümü, profil, kaynak boyutu, video süresi, oluşturma süresi, çözme süresi, okunan/kaybolan sembol oranı ve SHA-256 sonucu kaydedilir.

## 12. Kabul ölçütleri

1. Dengeli profilde 5 MiB şifreli veri için QR taşıyıcı video süresi 120 saniyeyi aşmaz.
2. Gerçek cihaz matrisinde tanımlanan Android sınıfında ve iPhone 12 veya daha yeni cihazda 5 MiB taşıyıcı en fazla 120 saniyede çözülür.
3. Sembollerin en az yüzde 20'si kayıp, yinelenmiş veya farklı sırada olsa da doğru şifreli BTA yeniden oluşturulur.
4. Dört cihaz yönü otomatik testler ve uygulanabilir gerçek cihaz testleriyle doğrulanır.
5. Dosya/belge olarak dış kanaldan gönderilen taşıyıcı başarıyla çözülür.
6. Yeniden oluşturulan özgün dosyanın SHA-256 değeri kaynak dosyayla aynıdır.
7. Dosya, QR videosu, anahtar, şifreli BTA veya QR yükü için ağ isteği oluşmaz.
8. Başarısız cihaz sessizce bozulmaz; Uyumlu profil veya uygulanabilir çözüm önerilir.
9. Yarım kalan alma işlemi aynı videoyla devam ettirilebilir.
10. Başarılı veya kullanıcı tarafından silinen işlemin geçici kayıtları temizlenir; diğer kayıtlar 24 saat içinde sona erer.

## 13. Kapsam dışında kalanlar

- Sunucuda dosya veya QR video saklama
- Bulut üzerinden içerik aktarımı
- Şifreleme anahtarını QR videosuna gömme
- Güncel Decimen kaynak kodunu kopyalama
- İlk teslimde renkli veya özel QR benzeri kodlar
- İlk teslimde üç ya da dört QR bölgesini üretim varsayılanı yapma
- İlk teslimde canlı kamera aktarım arayüzünü tamamen yenileme
- BTA1 dosya biçimini değiştirme

## 14. Uygulama sırası

Uygulama planı en az şu bağımsız aşamalara bölünecektir:

1. Sürümlü fountain sembol biçimi ve kayıp kare testleri
2. Çoklu QR video oluşturma
3. Paralel QR video çözme
4. Yerel kurtarma deposu
5. Gönderme ve alma arayüzü
6. Eski video uyumluluğu ve güvenlik kontrolleri
7. Masaüstü tarayıcı testleri
8. Gerçek Android/iPhone ve mesajlaşma kanalı doğrulaması
