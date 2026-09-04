# VaultDrop ve Hızlı Canlı QR Tasarımı

**Tarih:** 13 Ağustos 2026  
**Durum:** Kullanıcı tarafından ana ürün yönü onaylandı  
**Ana karar:** Yakındaki cihazlar için standart siyah-beyaz Canlı QR, uzaktaki cihazlar için zorunlu şifreli VaultDrop paketi kullanılacak.

## 1. Amaç

Ürünü iki anlaşılır ve sürdürülebilir aktarım yöntemine indirmek:

1. **Canlı QR:** Aynı ortamda bulunan cihazlar arasında, ekran ve kamera kullanılarak hızlı aktarım.
2. **VaultDrop:** Farklı konumlardaki cihazlar arasında mevcut mesajlaşma veya e-posta hizmetleriyle gönderilen şifreli paket.

QR Video ve renkli QR ürün yolları tamamen kaldırılacaktır. Canlı QR, renkli hücreler yerine aynı anda birden fazla standart siyah-beyaz QR ve kaçırılan karelere dayanıklı fountain kodlama ile hızlandırılacaktır. VaultDrop paketi ise tek hazırlık geçişi, akıllı sıkıştırma ve arka planda çalışma ile hızlandırılacaktır.

## 2. Onaylanan Ürün Kararları

- Canlı QR zorunlu olarak şifrelenmeyecek; yakın ve kontrollü ortam aktarımı olarak konumlandırılacak.
- VaultDrop her zaman AES-256-GCM ile şifreli olacak.
- Yeni şifreli paketlerin uzantısı `.vdrop` olacak.
- Eski `.bta` paketleri süresiz açılmaya devam edecek.
- QR Video oluşturma ve QR Videodan dosya açma tamamen kaldırılacak.
- “Eski aktarımı aç” veya benzeri bir QR Video uyumluluk ekranı bulunmayacak.
- Renkli QR laboratuvarı üretim arayüzünden ve yönlendirmelerden kaldırılacak.
- Canlı QR renkli yapılmayacak.
- Dosya içeriği, şifreli paket ve anahtar VaultDrop sunucusundan geçmeyecek.

## 3. Değerlendirilen Yaklaşımlar

### 3.1. Yalnız ad ve arayüz değişikliği

`.bta` uzantısını `.vdrop` yapmak ve QR Video düğmelerini gizlemek en hızlı değişikliktir. Ancak dosyanın birden fazla kez okunması, ana ekranın ağır işlemlerde donması ve Canlı QR’ın sıralı kare beklemesi devam eder. Bu yaklaşım tek başına yeterli değildir.

### 3.2. Ortak hazırlık motoru ve çoklu standart QR

VaultDrop için tek hazırlık geçişi ve worker; Canlı QR için çoklu siyah-beyaz QR, fountain kurtarma ve cihaz boyutuna göre güvenli düzen kullanılır. Mevcut şifreleme biçimi korunur ve değişiklikler aşamalı yayınlanabilir. **Seçilen yaklaşım budur.**

### 3.3. Parçalı yeni şifreleme ve özel renk kodu

Çok büyük dosyaları parça parça şifrelemek bellek kullanımını azaltabilir; özel renk kodu da teorik kapasiteyi artırabilir. Buna karşılık anahtar/IV yönetimi, renk kalibrasyonu, kamera farkları ve hata yüzeyi ciddi biçimde büyür. İlk sürüm kapsamına alınmayacaktır.

## 4. Nihai Kullanıcı Akışı

Ana aktarım ekranında yalnız iki kart bulunur:

### 4.1. Canlı QR

- Alt metin: “Yakındaki cihaza, ekran ve kamerayla hızlı gönder.”
- Gönderici tek dosya seçer ve QR akışını başlatır.
- Alıcı kamerayı açar, aynı aktarım kimliğine ait kareleri toplar ve dosyayı doğrular.
- Arayüz, bu yöntemin kontrollü ortam için olduğunu ve ekrana bakan başka bir kameranın veriyi okuyabileceğini kısa bir uyarıyla açıklar.
- Çok büyük veya uzun sürecek dosyada VaultDrop önerilir.

### 4.2. VaultDrop

- Alt metin: “Uzaktaki cihaza şifreli paket gönder.”
- Kullanıcı bir veya birden fazla dosya seçer.
- Tarayıcı dosyaları yerel olarak hazırlar, gerekirse sıkıştırır ve şifreler.
- `vaultdrop-<kısa-kimlik>.vdrop` dosyası indirilir.
- Kullanıcı `.vdrop` dosyasını mevcut mesajlaşma veya e-posta yöntemiyle gönderir.
- Anahtar ayrı kanaldan paylaşılır.
- Alıcı `.vdrop` veya eski `.bta` dosyasını seçer, anahtarı girer ve doğrulanmış özgün dosyayı indirir.

## 5. VaultDrop Teknik Tasarımı

### 5.1. Biçim ve geriye uyumluluk

- Yeni dosya uzantısı `.vdrop` olacaktır.
- İlk sürümde kanıtlanmış BTA2 iç kapsayıcı biçimi korunacaktır; yalnız kullanıcıya görünen ürün adı ve uzantı değişir.
- Alıcı dosya seçicisi `.vdrop,.bta` kabul eder.
- BTA1 ve BTA2 ayrıştırıcıları korunur; yeni üretim yalnız güncel BTA2 yolunu kullanır.
- Dosya uzantısı güvenlik kararı vermek için kullanılmaz. Sihirli başlık, sürüm, uzunluklar ve doğrulama etiketi gerçek kapsayıcıdan kontrol edilir.

### 5.2. Tek hazırlık geçişi

Mevcut akıştaki yinelenen dosya okuma ve SHA-256 hesaplama kaldırılır. Hazırlık sonucu aşağıdaki verileri tek kez üretir:

- Özgün dosya boyutu ve SHA-256 özeti
- Saklanan veri boyutu ve SHA-256 özeti
- Kullanılan sıkıştırma yöntemi
- Şifrelemeye verilecek byte dizisi

Tek dosya doğrudan bu sonuçtan şifrelenir. Çoklu dosya önce güvenli ZIP adlarıyla arşivlenir, ardından aynı hazırlık ve şifreleme sınırından geçer.

### 5.3. Akıllı sıkıştırma

- Metin, JSON, CSV, UDF ve sıkıştırmaya uygun ofis içeriğinde sıkıştırma denenir.
- JPEG, PNG, MP4, WebM, ZIP ve benzeri zaten sıkıştırılmış türlerde gereksiz işlem atlanır.
- Tür bilgisine tek başına güvenilmez; küçük bir örnek veya gerçek sonuç tasarrufu kararı doğrular.
- Sonuç en az yüzde 5 ve en az 32 bayt küçülmüyorsa özgün veri saklanır.
- Sıkıştırma başarısız olursa dosya bozulmaz; güvenli biçimde sıkıştırmasız yola dönülür.
- Açma sırasında sıkıştırılmış boyut, özgün boyut ve iki SHA-256 değeri sınırlar içinde doğrulanır.

### 5.4. Arka planda çalışma

- ZIP hazırlığı, sıkıştırma ve özet hesaplama özel bir worker içinde çalışır.
- Web Crypto uygunsa worker içinde; uyumsuz tarayıcıda yalnız şifreleme adımı ana akışta çalışır.
- Büyük byte dizileri kopyalanmak yerine aktarılabilir tamponlarla taşınır.
- Kullanıcı dosya değiştirdiğinde, sayfadan ayrıldığında veya iptal ettiğinde eski işlem sonucu arayüze yazamaz.
- İşlem aşamaları “Hazırlanıyor”, “Sıkıştırılıyor”, “Şifreleniyor” ve “Paket hazır” olarak gösterilir.
- İptal düğmesi ve bellek yetersizliği için anlaşılır hata bulunur.

### 5.5. Güvenlik sınırları

- Her paket için Web Crypto ile rastgele 256 bit anahtar ve 96 bit IV üretilir.
- AES-256-GCM doğrulaması geçmeden metadata veya dosya kullanıcıya sunulmaz.
- Dosya adı, MIME türü, boyutlar ve özetler şifreli metadata içinde kalır.
- Anahtar URL’ye, dosya adına, analiz kaydına veya sunucu isteğine yazılmaz.
- Yanlış anahtar ve değiştirilmiş paket aynı genel güvenlik hatasıyla reddedilir.
- Açılan dosya otomatik çalıştırılmaz; doğrulamadan sonra yalnız indirme sunulur.
- İndirme adı yol ayraçları, kontrol karakterleri ve Windows/macOS için sorunlu adlara karşı temizlenir.
- Üye için mevcut en fazla 15 dosya ve toplam 50 MiB; misafir için mevcut tek dosya ve 10 MiB sınırı korunur.

## 6. Hızlı Canlı QR Teknik Tasarımı

### 6.1. Neden renkli değil

Renkli hücreler teorik olarak daha fazla bit taşır. Gerçek telefonda ise ışık, ekran renk profili, kamera beyaz ayarı, hareket bulanıklığı ve renk çözme maliyeti hata oranını artırır. Bu nedenle hız artışı garanti edilemez. Standart siyah-beyaz QR; hazır, hızlı ve farklı cihazlarda daha güvenilir çözücülerden yararlanır.

### 6.2. Yeni aktarım modeli

- Dosya önce mevcut akıllı sıkıştırma kuralından geçer.
- Payload sabit boyutlu kaynak bloklara ayrılır.
- Fountain kodlayıcı, kaynak bloklardan sınırsız sayıda kurtarma sembolü üretir.
- Her sembol aktarım kimliği, sembol numarası, blok bilgisi, payload uzunluğu ve hata kontrolü taşır.
- Alıcı kareleri sıra beklemeden kabul eder; yinelenen veya bozuk kareyi atar.
- Yeterli farklı sembol toplandığında dosya oluşturulur ve SHA-256 ile doğrulanır.
- Eksik tek bir kare için bütün turun yeniden gelmesi beklenmez.

Yeni gönderimler sürümlü yeni Canlı QR protokolünü kullanır. Mevcut QRT2 okuyucu, geçiş döneminde eski bir sekme veya önbellekte kalmış göndericiyi okuyabilmek için yalnız alıcı tarafında korunur. Yeni üretim QRT2 oluşturmaz.

### 6.3. Çoklu QR düzeni

“Otomatik” düzen gönderici ekranındaki kullanılabilir alanı ve her QR’ın en küçük güvenli hücre boyutunu temel alır:

- Dar telefon ekranı: 1 QR
- Yeterli genişlikte telefon veya tablet: en fazla 2 QR
- Normal masaüstü: 2 QR
- Geniş ve yüksek çözünürlüklü masaüstü: gerekli gerçek cihaz testleri geçerse en fazla 4 QR

QR sayısı uğruna kodlar okunamayacak kadar küçültülmez. Her QR kendi ayrı sembolünü taşır; aynı karedeki bütün semboller aynı alım oturumuna eklenir. Düşük güçlü alıcı bazı kodları kaçırsa bile fountain akışı devam eder.

Gerçek bir geri bildirim kanalı olmadığı için gönderici alıcı telefonun başarısını doğrudan bilemez. Bu nedenle “otomatik hız” yalnız ekran geometrisi ve güvenli varsayımlara dayanır; sahte bir cihazlar arası otomatik ayar iddiası yapılmaz.

### 6.4. Kare üretme ve tarama

- QR üretme ana arayüzden ayrılır ve küçük bir worker havuzunda önceden hazırlanır.
- Ekran, yalnız hazır olan tam kare gruplarını gösterir; aynı zaman damgasına ait QR’lar karıştırılmaz.
- Gösterim hızı sabit bir yüksek değere zorlanmaz. Uyumlu, dengeli ve hızlı adaylar gerçek cihaz ölçümleriyle belirlenir.
- Varsayılan profil başarısız kare oranından önce okunabilirliği korur.
- Alıcı, kamera karelerini worker havuzuna dağıtır; meşgul worker için kuyruk şişirmek yerine güncel kareyi tercih eder.
- Kamera çözünürlüğü, odak modu ve analiz sıklığı destek sorgusuyla seçilir.
- Tarama tamamlandığında kamera ve worker kaynakları hemen kapatılır.

### 6.5. Ürün sınırı

- Teknik protokol üst sınırı 50 MiB olarak kalabilir; bu değer kullanıcıya önerilen Canlı QR boyutu değildir.
- İlk yayın hedefi Canlı QR için **en fazla 5 MiB** olacaktır.
- 5 MiB üzerindeki dosyalarda Canlı QR başlatılmaz ve VaultDrop önerilir.
- Gerçek cihaz testleri 5 MiB eşiğini karşılamazsa yayın sınırı 1 MiB’a düşürülür; güvenilirlik hız iddiasından önce gelir.

## 7. QR Video ve Renkli QR Temizliği

- QR Video gönderim kartı, profil seçimi, süre tahmini, oluşturma ve indirme düğmeleri kaldırılır.
- QR Video dosyası seçme, videodan kare okuma ve eski video açma akışları kaldırılır.
- Renkli Dengeli profili, renkli laboratuvar yönlendirmesi ve üretim menüleri kaldırılır.
- Kullanılmayan video kaydedici, video çözücü, renkli matris ve bu özelliklere özel worker kodları bağımlılık incelemesinden sonra silinir.
- Canlı QR veya VaultDrop tarafından ortak kullanılan sıkıştırma, fountain, SHA-256 ve güvenli kapsayıcı modülleri korunur.
- Ölü kod yorum satırında bırakılmaz.
- README, SSS, fiyatlandırma, profil geçmişi, yardım metinleri ve test örneklerindeki QR Video vaatleri temizlenir.
- Daha önce üretilmiş QR videoların artık açılamayacağı yayın notunda açıkça belirtilir.

## 8. Sunucu Sınırı

Sunucu yalnız hesap, plan, kota rezervasyonu ve genel işlem sonucu gibi sınırlı kullanım verisini işler. Aşağıdakileri kabul etmez veya saklamaz:

- Özgün dosya içeriği
- `.vdrop` veya `.bta` paketi
- Şifreleme anahtarı
- Dosya adı veya MIME türü
- Canlı QR kareleri ya da payload’ı

Paket oluşturma ve açma sırasında dosya içeriği için ağ isteği yapılmadığı otomatik testle korunur.

## 9. Hata ve Yaşam Döngüsü

- Yeni dosya seçimi önceki hazırlık, QR üretimi veya tarama sonucunu geçersiz kılar.
- İptal, sayfadan ayrılma ve bileşen kapanışı worker, kamera, zamanlayıcı ve nesne URL’lerini temizler.
- Worker başlatılamazsa VaultDrop küçük dosyada güvenli ana akış yedeğine dönebilir; Canlı QR ise desteklenmeyen hız özelliğini kapatıp tek QR uyumlu moda geçer.
- Boyut aşımı ağır işlem başlamadan reddedilir.
- Eksik Canlı QR oturumu kısmi dosya üretmez.
- SHA-256 veya AES-GCM kontrolü başarısız olan veri indirilmez.
- Kullanıcıya ham teknik hata yerine düzeltici Türkçe mesaj gösterilir.

## 10. Test Stratejisi

### 10.1. VaultDrop

- Yeni `.vdrop` üretme ve açma tur testi
- Dondurulmuş BTA1 ve BTA2 `.bta` örneklerini açma testi
- Yanlış anahtar, değiştirilmiş, kesilmiş ve fazla alanlı paketleri reddetme
- Tek hazırlık geçişinde aynı dosyanın ikinci kez okunmadığını doğrulama
- Sıkıştırılabilir ve sıkıştırılamayan dosyada doğru karar
- 15 dosya/50 MiB üye ve tek dosya/10 MiB misafir sınırları
- Worker iptali, geç sonuç, sayfadan ayrılma ve bellek hatası
- Paket oluşturma ve açmada içerik ağ isteği yapılmaması
- Unicode, yol ayıracı ve işletim sistemine özel dosya adları
- Windows→macOS, macOS→macOS, iPhone→Android ve PC→telefon manuel açma matrisi

### 10.2. Canlı QR

- Fountain sembollerinin sıra dışı ve kayıplı alınması
- Yinelenen, bozuk ve başka oturuma ait sembollerin reddi
- 1, 2 ve 4 QR’ın aynı kamera karesinden ayrıştırılması
- Eski QRT2 alıcının geçiş uyumluluğu; yeni göndericinin yalnız yeni sürümü üretmesi
- Düşük güçlü cihazda tek QR uyumlu moda dönüş
- Kamera/worker iptali ve tamamlanınca kaynak temizliği
- SHA-256 doğrulaması olmadan başarı veya indirme üretilmemesi
- Android Chrome, iPhone Safari ve masaüstü tarayıcılarında gerçek ekran-kamera testleri

### 10.3. Özellik kaldırma regresyonu

- Ana ve yardım ekranlarında QR Video veya renkli QR seçeneği bulunmaması
- QR Video oluşturma ve açma yollarına kullanıcı tarafından erişilememesi
- Canlı QR ve VaultDrop’un kaldırılan video modüllerine bağımlı olmaması
- Eski `.bta` paketlerinin kaldırma sonrasında açılmaya devam etmesi

## 11. Başarı Ölçütleri

### 11.1. Güvenilirlik

- VaultDrop yanlış anahtar veya bir bayt değişiklikte dosya üretmez.
- `.vdrop`, BTA1 ve BTA2 paketleri özgün ad, tür, boyut ve içerikle açılır.
- Canlı QR tamamlanması yalnız doğrulanmış dosyada gerçekleşir.
- Kontrollü ışıkta 100 KiB ve 1 MiB Canlı QR senaryoları her cihaz sınıfında art arda 5 denemenin 5’inde tamamlanır.
- 5 MiB senaryosu desteklenen cihaz çiftlerinde en az 5 denemenin 4’ünde tamamlanır; aksi halde yayın sınırı 1 MiB olur.

### 11.2. Hız hedefleri

Bu değerler pazarlama sözü değil, yayın kapısıdır:

- Orta sınıf masaüstü → orta sınıf telefon, 1 MiB: kontrollü ışıkta ortanca en fazla 30 saniye
- Orta sınıf telefon → orta sınıf telefon, 1 MiB: kontrollü ışıkta ortanca en fazla 60 saniye
- Desteklenen masaüstü → telefon, 5 MiB: kontrollü ışıkta en fazla 180 saniye
- VaultDrop hazırlığı sırasında arayüzün ana etkileşimleri donmaz ve ilerleme güncellenir.
- Sıkıştırılamayan dosya gereksiz sıkıştırma yüzünden büyütülmez.

Hedef geçmezse kare hızı körlemesine artırılmaz; QR sayısı, hücre boyutu, worker kapasitesi ve tarama başarısı ölçülerek dar boğaz düzeltilir.

### 11.3. Ürün sadeliği

- Kullanıcı ana aktarım ekranında yalnız Canlı QR ve VaultDrop görür.
- “Yakındaysa Canlı QR, uzaktaysa VaultDrop” ayrımı ilk bakışta anlaşılır.
- Üretim arayüzünde QR Video, eski video açma veya renkli QR laboratuvarı bulunmaz.

## 12. Aşamalı Uygulama Sırası

1. QR Video ve renkli QR bağımlılık haritasını çıkarma
2. Yeni ürün metinleri ve iki yöntemli arayüz için koruma testleri
3. `.vdrop` üretimi ve `.vdrop,.bta` açma uyumluluğu
4. VaultDrop tek hazırlık geçişi ve worker
5. Akıllı sıkıştırma, iptal ve ilerleme
6. QR Video ve renkli QR kullanıcı yollarını kaldırma
7. Kullanılmayan video/renk kodunu güvenli biçimde temizleme
8. Yeni sürümlü Canlı QR fountain çerçevesi
9. Çoklu siyah-beyaz QR üretme ve tarama
10. Worker havuzu, güvenli ekran düzeni ve hız adayları
11. Gerçek cihaz ölçümleri ve 1/5 MiB yayın kapıları
12. Tam regresyon, güvenlik kontrolü, kod denetimi, üretim derlemesi ve doküman temizliği

## 13. Kapsam Dışı

- Canlı QR’ı zorunlu şifrelemek
- Canlı QR’a renkli hücre eklemek
- QR Video geriye uyumluluğu
- Dosya taşıyan yeni sunucu veya bulut depolama
- İlk sürümde parçalı yeni AES-GCM kapsayıcı tasarlamak
- Ölçüm yapılmadan 60 FPS veya belirli bir aktarım hızı vaat etmek
- 50 MiB dosyayı Canlı QR için pratik kullanım olarak pazarlamak

## 14. Kaynaklar

- OWASP Cryptographic Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- MDN Web Crypto `encrypt()`: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
- MDN AES-GCM parametreleri: https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
- MDN Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- MDN CompressionStream: https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream
- Decimen Optical Transfer ve ölçüm kayıtları: https://github.com/bashalarmistalt/decimen-optical-transfer
- Çoklu standart QR ve fountain değerlendirmesi: https://informatika.stei.itb.ac.id/~rinaldi.munir/Penelitian/Makalah_ICAICTA_2023_1.pdf
- Yüksek kapasiteli renkli QR’ın gerçek cihaz zorlukları: https://arxiv.org/abs/1704.06447

