# Renkli QR Güvenli ve Hızlı Aktarım Tasarımı

**Tarih:** 12 Ağustos 2026  
**Durum:** Kullanıcı tarafından kapsamı ve ana yaklaşımı onaylandı  
**Hedef alanlar:** Renkli QR laboratuvarı ve ana QR Video içindeki `Renkli Dengeli` profil

## 1. Amaç

Renkli QR özelliğini deneysel bir gösterim olmaktan çıkarıp ölçülebilir, güvenli ve kullanılabilir bir aktarım seçeneğine dönüştürmek amaçlanmaktadır. Çözüm; sıkıştırılabilen dosyalarda kare sayısını azaltmalı, farklı aktarımların karelerini birbirine karıştırmamalı, bozuk dosyayı başarılı saymamalı ve tarama sırasında özellikle telefon arayüzünü kilitlememelidir.

Çalışma iki kullanıcı alanını kapsar:

1. `/renkli-qr-test` adresindeki gerçek renk matrisi laboratuvarı.
2. Ana QR Video ekranındaki, şu anda gerçek renk matrisi üretmeyen `Renkli Dengeli` profil.

Standart `Dengeli` ve `Uyumlu` QR Video profillerinin mevcut davranışları korunacaktır.

## 2. Mevcut Sorunlar

Mevcut renkli QR uygulamasında aşağıdaki temel sorunlar bulunmaktadır:

- Dosya sıkıştırılmadan 380 baytlık parçalara ayrılmaktadır.
- Her ana parça için bir parite parçası üretildiğinden kare sayısı yaklaşık iki katına çıkmaktadır.
- Karelerde aktarım kimliği bulunmadığı için farklı aktarımların parçaları aynı sonuçta birleşebilmektedir.
- Alıcıda orijinal dosya bulunmadığında doğruluk doğrudan yüzde 100 kabul edilmektedir.
- Çok kareli belge için indirilen veya paylaşılan PNG yalnızca ekrandaki tek kareyi içermektedir.
- Kamera taraması 120 milisaniyede bir, çok sayıda kırpma, matris boyutu ve dönüş açısını ana iş parçacığında denemektedir.
- Ana QR Video ekranındaki `Renkli Dengeli` profil 2.800 baytlık sembolleri standart siyah-beyaz QR kütüphanesine vermektedir. Bu miktar standart QR kapasitesini aştığından profil çalışabilir gerçek renkli video üretmemektedir.

## 3. Tasarım İlkeleri

- **Önce doğruluk:** Bütünlük doğrulanmadan başarı gösterilmez ve dosya indirilmez.
- **Akıllı sıkıştırma:** Sıkıştırma yalnızca sonucu anlamlı biçimde küçültüyorsa kullanılır.
- **Ortak motor:** Laboratuvar ve ana QR Video aynı renkli kare biçimini ve çözme motorunu kullanır.
- **Geriye uyum:** Eski renkli QR biçimi mümkün olduğunca okunur; yeni üretimler yalnızca güvenli biçimi kullanır.
- **Ana ekranı boş bırakma:** Sıkıştırma, dosya özeti ve optik çözme gibi ağır işler ayrı worker içinde yürütülür.
- **Ölçmeden hız iddiası yok:** Renkli profil gerçek telefon testleri tamamlanana kadar deneysel olarak işaretlenir.
- **Yeni bağımlılık yok:** Projede bulunan `fflate`, Web Crypto ve mevcut optik kurtarma modülleri kullanılır.
- **UTF-8:** Dosya adları, kullanıcı metinleri ve tasarım belgeleri UTF-8 olarak korunur.

## 4. Önerilen Mimari

Renkli QR işlemleri dört bağımsız sorumluluğa ayrılır:

### 4.1. Aktarım verisi hazırlama

Ortak hazırlama modülü ham dosyayı alır, güçlü dosya özetini üretir ve akıllı sıkıştırmayı uygular. Laboratuvar bu sonucu `CQF2` paketine dönüştürür. Ana QR Video ise aynı hazırlanmış veriyi şifreli kapsayıcıya koyar.

Önerilen sorumluluklar:

- `prepareTransferPayload(bytes)`: Ham veriyi özetler ve gerekirse sıkıştırır.
- `restoreTransferPayload(storedBytes, metadata)`: Boyut, sıkıştırma ve özet kontrollerinden sonra ham veriyi geri döndürür.
- Sıkıştırma `fflate` ile zlib seviye 6 kullanılarak yapılır.
- Sıkıştırılmış veri ancak hem en az 32 bayt hem de en az yüzde 5 tasarruf sağlıyorsa kabul edilir.
- Boş dosya ve zaten sıkıştırılmış dosyalar güvenli biçimde `none` yöntemiyle taşınabilir.

### 4.2. Optik kare biçimi

Yeni renkli optik kare biçimi `CRF2` olacaktır. Kare başlığı sabit uzunluklu ikili biçimde tutulur; böylece her karede JSON veya Base64 şişmesi oluşmaz.

Her kare aşağıdaki bilgileri taşır:

- `CRF2` sihirli başlığı
- Biçim bayrakları
- 12 karakterlik aktarım kimliği
- Sembol numarası
- Kaynak sembol sayısı
- Blok boyutu
- Taşınan toplam kapsayıcı boyutu
- Kapsayıcının SHA-256 özeti
- Kare verisinin CRC32 kontrolü
- Renk hücrelerine dönüştürülecek sembol verisi

Tüm çok baytlı sayılar ağ sıralamasında, yani big-endian olarak yazılır. Alıcı ilk geçerli kareden oturum bilgisini kurar. Daha sonraki karelerin aktarım kimliği, kaynak sembol sayısı, blok boyutu, toplam boyut ve SHA-256 değeri bu oturumla tam olarak eşleşmek zorundadır.

### 4.3. Kurtarma ve birleştirme

Mevcut `fountain` kodlayıcı ve çözücü yeniden kullanılır. İlk güvenli blok boyutu 380 bayt, üretim oranı `1.30` olacaktır. Böylece mevcut yüzde 100 parite yükü yaklaşık yüzde 30 kurtarma yüküne düşer.

Blok boyutu ilk sürümde otomatik artırılmaz. Gerçek telefon ölçümleri, en az 380 baytlık profilin güvenilirliğini kanıtladıktan sonra 520 ve 700 baytlık adaylar ayrıca değerlendirilebilir. Bu karar uygulamanın ilk sürüm kapsamına dahil değildir.

Alım oturumu:

- Yinelenen kareleri sayar fakat tekrar saklamaz.
- CRC32 kontrolü geçmeyen kareyi reddeder.
- Başka aktarım kimliğine ait kareyi reddeder ve mevcut oturumu bozmaz.
- Gerekli semboller tamamlanınca kapsayıcıyı oluşturur.
- Oluşan kapsayıcının uzunluğunu ve SHA-256 değerini doğrular.
- Doğrulama geçmeden başarı sonucu üretmez.

### 4.4. Renk matrisi oluşturma ve çözme

Yeni matris biçimi aşağıdaki görsel alanları içerir:

- Dışta dört hücre genişliğinde beyaz sessiz alan
- Sol üst, sağ üst ve sol altta 5×5 sabit yön bulma işaretleri
- Sağ altta dönüş yönünü ayırt eden küçük yön işareti
- Siyah, kırmızı, yeşil ve mavi için kamera kalibrasyon hücreleri
- Kalan alanda satır sırasıyla iki bitlik veri hücreleri

Yön ve kalibrasyon hücreleri veri kapasitesine dahil edilmez. Çözücü önce yön işaretlerini ve sınırları bulur, ardından kalibrasyon renklerini ölçer. Böylece her karede 9–257 arasındaki bütün tek matris boyutlarını ve dört dönüş açısını körlemesine denemek yerine doğrudan tek aday geometri çözülür.

İlk sürümde gönderici hücre boyutunu en az 8 fiziksel piksel hedefleyecek şekilde tuvali boyutlandırır. Kullanıcı hücre boyutunu düşürerek güvenilir sınırın altına inemez. Video üretiminde matrisler yeniden örnekleme bulanıklığı oluşturmayan tam sayı koordinatlara çizilir.

## 5. Paket Biçimleri

### 5.1. Laboratuvar paketi: CQF2

Laboratuvarda şifreleme yapılmadan taşınan dosya `CQF2` kapsayıcısı olarak hazırlanır. Kapsayıcı aşağıdaki bölümleri içerir:

1. Dört bayt `CQF2` başlığı
2. Bir bayt sürüm ve bayrak alanı
3. Dört bayt metadata uzunluğu
4. UTF-8 JSON metadata
5. Sıkıştırılmış veya ham saklanan veri

Metadata alanları:

- `v`: `CQF2`
- `transferId`: 12 karakterlik aktarım kimliği
- `name`: Orijinal dosya adı
- `type`: Orijinal MIME türü
- `originalSize`: Ham dosya boyutu
- `storedSize`: Taşınan veri boyutu
- `compression`: `none` veya `zlib`
- `sha256`: Orijinal ham dosyanın SHA-256 özeti

Metadata şeması doğrulanmadan payload ayrılmaz. Boyutlar 15 MiB QR Video sınırını ve metadata için 16 KiB sınırını aşamaz.

15 MiB sınırı kullanıcının seçtiği ham dosya veya toplu arşiv boyutuna uygulanır. Protokol başlıkları bu kotayı büyütmez; ancak çözücü hem ham hem saklanan boyut için ayrıca bellek güvenliği sınırı uygular. `CQF2` içindeki `transferId`, optik `CRF2` aktarım kimliğiyle aynı olmak zorundadır.

### 5.2. Şifreli QR Video paketi

Şifreli QR Video için sıkıştırma şifrelemeden önce yapılır. Bunun nedeni şifrelenmiş verinin rastgele görünmesi ve sonradan etkili biçimde sıkıştırılamamasıdır.

Mevcut `BTA1` şifreli kapsayıcısı okunmaya devam eder. Renkli profil için yeni üretim, aynı kapsayıcı ailesinin sürüm 2 metadata alanlarını kullanır:

- `compression`
- `originalSize`
- `storedSize`
- `originalSha256`
- `storedSha256`

Şifre çözme sırası şöyledir:

1. AES-256-GCM doğrulaması ve şifre çözme
2. Saklanan verinin boyut ve SHA-256 doğrulaması
3. Gerekliyse zlib açma
4. Orijinal boyut ve SHA-256 doğrulaması
5. Orijinal ad ve MIME türüyle `File` oluşturma

Standart QR Video profilleri mevcut sürüm 1 üretimini kullanmaya devam eder. `decryptContainer` hem sürüm 1 hem sürüm 2 okuyabilir.

## 6. Gönderim Akışı

### 6.1. Laboratuvar

1. Kullanıcı dosya veya metin seçer.
2. Worker dosyanın SHA-256 özetini hesaplar ve akıllı sıkıştırmayı dener.
3. `CQF2` kapsayıcısı oluşturulur.
4. Kapsayıcı 380 baytlık fountain sembollerine ayrılır.
5. Yüzde 30 kurtarma sembolü eklenir.
6. Semboller `CRF2` karelerine dönüştürülür.
7. Kareler renk matrisleri olarak ekranda oynatılır veya videoya kaydedilir.
8. Tek kareye sığan aktarımda PNG seçenekleri açılır; çok kareli aktarımda yalnızca canlı akış ve video seçenekleri gösterilir.

### 6.2. Ana QR Video

1. Kullanıcı `Renkli Dengeli` profili seçer.
2. Dosya veya toplu arşiv önce akıllı sıkıştırma hazırlığından geçer.
3. Hazırlanmış veri AES-256-GCM ile şifrelenir.
4. Şifreli kapsayıcı `CRF2` sembollerine ayrılır.
5. Video karelerine gerçek renk matrisleri çizilir.
6. Video, mevcut anahtar paylaşım ve kurtarma akışlarıyla birlikte kullanıcıya sunulur.

`Dengeli` ve `Uyumlu` profiller bu yeni renkli çizim yoluna girmez.

## 7. Alım Akışı

### 7.1. Kamera ve görsel

1. Kamera karesi en fazla 720p analiz tuvaline ölçeklenir.
2. Aynı anda yalnızca bir worker çözme işi çalışır.
3. Worker yön işaretlerini, sınırı, dönüşü ve renk kalibrasyonunu bulur.
4. `CRF2` karesi ayrıştırılır ve CRC32 kontrol edilir.
5. Kare aktarım oturumuna kabul edilir veya anlaşılır bir nedenle reddedilir.
6. Fountain çözücü yeterli sembol toplandığında kapsayıcıyı üretir.
7. Kapsayıcı SHA-256 ile doğrulanır.
8. `CQF2` açılır; gerekirse zlib çözülür ve orijinal dosya tekrar doğrulanır.
9. Bütün kontroller geçerse dosya indirilir.

Tek kareli aktarım, `sourceCount === 1` olarak tanımlanır. PNG çıktısı yalnızca birincil `symbolId === 0` karesini içerir; bu kare tek başına paketi tamamlamaya yeterlidir. Canlı akış ve videoda aynı kare okunabilirliği artırmak için tekrar edilebilir. `sourceCount > 1` olan aktarım hiçbir koşulda tek PNG olarak sunulmaz.

### 7.2. Video

Video çözücü ilk örnek karelerde yüksek renk doygunluğu ve `CRF2` yön işaretlerini arar:

- `CRF2` bulunursa renkli video çözücü seçilir.
- Standart QR bulunursa mevcut video çözücü kullanılır.
- İlk örneklerde tür belirlenemezse kullanıcıya dosyanın okunamadığı bildirilir; iki ağır çözücü video boyunca aynı anda çalıştırılmaz.

Renkli video taraması video süresini ilerleme yüzdesi olarak gösterir ve kapsayıcı tamamlandığı anda erken durur.

Renkli video çözümü tamamlandığında elde edilen veri doğrudan kullanıcı dosyası değil, şifreli BTA kapsayıcısıdır. Mevcut anahtar ekranı korunur. Kullanıcı anahtarı girdikten sonra BTA sürüm 2 açılır, sıkıştırma geri alınır ve özgün dosya ikinci kez doğrulanarak indirilir.

## 8. Performans ve Eşzamanlılık

- Sıkıştırma, SHA-256 ve renk matrisi çözme worker içinde çalışır.
- Ana iş parçacığı yalnızca görüntüyü worker'a hazırlar ve sonucu arayüze yansıtır.
- Kamera çözme hızı başlangıçta saniyede en fazla 6 analiz olarak sınırlandırılır.
- Worker meşgulken yeni kare kuyruğa eklenmez; en güncel kamera karesi bir sonraki analiz için kullanılır.
- Sekme, yöntem, kamera veya aktarım değiştiğinde önceki iş bir oturum numarasıyla geçersiz kılınır.
- Worker geç cevap verse bile eski sonuç kullanıcı durumunu veya yeni aktarımı değiştiremez.
- Video ve görsel nesne URL'leri değişim ve bileşen kapanışında serbest bırakılır.
- Kamera akışı sonuç tamamlandığında veya kamera alanından çıkıldığında kapatılır.

## 9. Kullanıcı Arayüzü

Gönderici aşağıdaki bilgileri görür:

- Orijinal dosya boyutu
- Taşınacak veri boyutu
- Sıkıştırma tasarrufu veya “sıkıştırma gerekmedi” bilgisi
- Ana sembol ve kurtarma sembolü sayısı
- Tahmini canlı aktarım veya video süresi
- Deneysel renkli profil uyarısı

Paylaşım kuralları:

- Tek kareli aktarım: PNG indir, paylaş ve panoya kopyala seçenekleri açıktır.
- Çok kareli aktarım: Bu üç seçenek kapalıdır ve nedenini açıklayan metin gösterilir.
- Çok kareli aktarım için canlı akış ve QR video seçenekleri kullanılır.

Alıcı aşağıdaki durumları ayrı ayrı gösterir:

- Kamera hazırlanıyor
- Renkli matris aranıyor
- Geçerli kare alındı
- Yinelenen kare görüldü
- Farklı aktarıma ait kare reddedildi
- Bozuk kare reddedildi
- Eksik semboller bekleniyor
- Dosya doğrulanıyor
- Dosya tamamlandı

Başarı ifadesi yalnızca bütünlük doğrulamasından sonra gösterilir.

## 10. Hata Modeli

Motor kullanıcı arayüzüne kod ve Türkçe mesaj içeren tanımlı hatalar döndürür:

- `COLOR_UNSUPPORTED`: Tarayıcı gerekli canvas veya worker özelliklerini desteklemiyor.
- `FILE_TOO_LARGE`: Girdi 15 MiB sınırını aşıyor.
- `INVALID_COLOR_FRAME`: Kare başlığı veya alanları geçersiz.
- `FRAME_CRC_MISMATCH`: Kare verisi bozuk.
- `TRANSFER_MISMATCH`: Kare başka aktarıma ait.
- `INCOMPLETE_TRANSFER`: Gerekli semboller toplanamadı.
- `CONTAINER_HASH_MISMATCH`: Birleştirilmiş optik kapsayıcı bozuk.
- `DECOMPRESSION_FAILED`: Sıkıştırılmış veri açılamadı.
- `FILE_HASH_MISMATCH`: Orijinal dosya bütünlük kontrolü başarısız.
- `VIDEO_PROFILE_UNDETECTED`: Video türü güvenilir biçimde belirlenemedi.

Bu hataların hiçbirinde bozuk veya kısmi dosya otomatik indirilmez.

## 11. Geriye Uyumluluk

- Yeni gönderimler yalnızca `CQF2` ve `CRF2` üretir.
- Eski tek kareli `CQF1` görselleri mevcut okuyucu yoluyla açılmaya devam eder.
- Eski çok kareli `CQF1` aktarımı, aktarım kimliği ve güçlü dosya özeti taşımadığı için “eski ve doğrulanamayan biçim” uyarısıyla işlenir; otomatik indirme yapılmaz.
- Standart QRT3/QRF4 QR ve QR Video yolları değişmeden kalır.
- Mevcut BTA sürüm 1 paketleri açılmaya devam eder.

## 12. Dosya Sorumlulukları

Uygulama planında aşağıdaki sınırlar kullanılacaktır:

- `src/transfer/payload-compression.js`: Akıllı sıkıştırma ve geri açma.
- `src/optical/color-package-v2.js`: CQF2 oluşturma ve açma.
- `src/optical/color-frame-v2.js`: CRF2 ikili kare kodlama ve ayrıştırma.
- `src/optical/color-matrix-v2.js`: Yön işaretli renk matrisi çizme ve çözme.
- `src/optical/color-receive-session.js`: Kare toplama, oturum izolasyonu ve fountain çözme.
- `src/workers/color-qr.worker.js`: Sıkıştırma, özet ve optik çözme işlerini ana ekrandan ayırma.
- `src/hooks/useColorQrScanner.js`: Kamera zamanlaması, iptal ve worker iletişimi.
- `src/video/create-color-qr-video.js`: CRF2 matrislerinden video üretme.
- `src/video/decode-color-qr-video.js`: Renkli videoyu örnekleme ve oturuma aktarma.
- `src/ColorQrLabPage.jsx`: İnceltilmiş laboratuvar sayfası ve kullanıcı durumu.
- `src/video/create-qr-video.js`: Profil türüne göre standart veya renkli üreticiyi seçme.
- `src/video/decode-qr-video.js`: Video türünü belirleyip doğru çözücüye yönlendirme.
- `src/crypto/encrypted-container.js`: İsteğe bağlı sıkıştırılmış sürüm 2 şifreli kapsayıcı desteği.
- `src/VideoTransferPanel.jsx`: Gerçek renkli profil açıklamaları, ilerleme ve hata gösterimi.

`ColorQrLabPage.jsx` içindeki paketleme, parite, kamera döngüsü ve video çözme kodları yeni modüllere taşındıktan sonra sayfada tekrar edilmeyecektir.

## 13. Test Stratejisi

### 13.1. Birim testleri

- Sıkıştırılabilir veri küçülür ve `zlib` seçilir.
- Sıkıştırılamayan rastgele veri büyütülmez ve `none` seçilir.
- Sıkıştırılmış veri ham dosyaya kayıpsız döner.
- CQF2 dosya adı, MIME türü, boyut ve UTF-8 karakterlerini korur.
- CRF2 kodlama ve ayrıştırma aynı alanları döndürür.
- Bir baytı değiştirilen kare CRC32 kontrolünden geçmez.
- Farklı aktarım kimlikleri aynı oturumda birleşmez.
- Eksik ana sembol kurtarma sembolleriyle tamamlanır.
- Birleştirilmiş veride bir bayt değişirse SHA-256 doğrulaması başarısız olur.
- BTA sürüm 1 ve sürüm 2 paketleri doğru dosyayı döndürür.

### 13.2. Canvas ve worker testleri

- Dört temel renk kayıpsız sınıflandırılır.
- 0°, 90°, 180° ve 270° dönüşler çözülür.
- Beyaz sessiz alan ve yön işaretleri doğru sınırı üretir.
- Parlaklık ve renk sıcaklığı örnekleri kalibrasyonla çözülebilir.
- Worker meşgulken ikinci iş eşzamanlı başlamaz.
- Geç dönen eski worker sonucu yeni oturumu değiştirmez.
- Bileşen kapanınca worker ve kamera kaynakları temizlenir.

### 13.3. Uçtan uca testler

- Tek karelik metin PNG olarak gönderilip alınır.
- Çok kareli veri için PNG paylaşımı kapalıdır.
- 10 KB ve 100 KB dosyalar renkli videodan eksiksiz açılır.
- Normal `Dengeli` ve `Uyumlu` video profilleri aynı testleri geçmeye devam eder.
- Bozuk video başarı mesajı veya otomatik indirme oluşturmaz.
- Kamera izni reddedildiğinde kullanıcı tekrar deneyebilir veya dosya yükleme yöntemine geçebilir.

### 13.4. Gerçek telefon matrisi

En az aşağıdaki cihaz sınıfları manuel olarak doğrulanır:

- Güncel Android Chrome, orta sınıf cihaz
- Güncel Android Chrome, düşük ışık ve ekran yansıması
- Güncel iPhone Safari
- Masaüstü Chrome ile dosyadan video çözme

Her cihazda 10 KB ve 100 KB örnekler; tek kare, çok kare, döndürülmüş görüntü ve kısa renkli video senaryoları kontrol edilir.

Kontrollü ışıkta 10 KB senaryosu her cihazda art arda 5 denemenin 5'inde; 100 KB senaryosu en az 5 denemenin 4'ünde tamamlanmalıdır. Düşük ışık ve yansıma senaryosu başarı oranı için yayın engeli değildir fakat sonuçları ve başarısızlık nedenleri kayıt altına alınır. Ana QR Video ekranında deneysel profilin açılması için kontrollü ışık eşikleri zorunludur.

## 14. Başarı Ölçütleri

Çalışma aşağıdaki koşulların tamamı sağlandığında tamamlanmış sayılır:

1. Sıkıştırılamayan veri sıkıştırma nedeniyle büyümez.
2. 100 KB tekrarlı test verisi en az yüzde 90 küçülür.
3. Farklı aktarım kimliğine ait kareler hiçbir koşulda birleşmez.
4. Tek bayt bozuk kare ve tek bayt bozuk tamamlanmış dosya reddedilir.
5. Çok kareli aktarım tek PNG olarak indirilemez veya paylaşılamaz.
6. Kamera taramasında aynı anda yalnızca bir çözme işi çalışır.
7. 10 KB ve 100 KB dosyalar renkli videodan özgün ad, tür ve içerikle açılır.
8. `Renkli Dengeli` profil standart QR kütüphanesine 2.800 baytlık veri göndermeyi bırakır ve gerçek renk matrisi üretir.
9. Standart `Dengeli`, `Uyumlu`, QRT3/QRF4 ve BTA sürüm 1 testleri geçmeye devam eder.
10. Üretim derlemesi ve kod denetimi yeni hata üretmez.
11. 100 KB sıkıştırılabilir test verisinin renkli ana sembol sayısı, sıkıştırmasız renkli tabana göre en az yüzde 90 azalır.
12. 100 KB sıkıştırılamayan test verisi `none` yöntemiyle taşınır ve sıkıştırma nedeniyle ek ana sembol üretmez.
13. Masaüstü referans testinde renkli video kaydı, hedef video süresinden en fazla 2 saniye daha uzun hazırlık süresiyle tamamlanır; sapma oluşursa ölçüm raporlanır ve profil ana ekranda açılmaz.

## 15. Yayına Alma

Uygulama üç kontrollü aşamada açılır:

1. **Motor aşaması:** CQF2, CRF2, sıkıştırma ve bütünlük kontrolleri yalnızca otomatik testlerde doğrulanır.
2. **Laboratuvar aşaması:** Yeni motor `/renkli-qr-test` alanında deneysel etiketle kullanılır ve gerçek telefon ölçümleri toplanır.
3. **Ana QR Video aşaması:** Başarı ölçütleri geçildikten sonra `Renkli Dengeli` profil ana QR Video ekranında açılır. Testler tamamlanana kadar standart `Dengeli` profil önerilen varsayılan olarak kalır.

Bir aşama başarısız olursa önceki çalışan aşama korunur; standart QR yolları kapatılmaz.

## 16. Kapsam Dışı Konular

Bu çalışma aşağıdaki konuları kapsamaz:

- Renk paletini dört rengin üzerine çıkarmak
- 380 bayttan büyük blokları üretimde varsayılan yapmak
- Renkli QR için yeni sunucu veya bulut servisi eklemek
- Normal canlı QR protokolünü renkli QR ile değiştirmek
- Standart QR Video profillerinin şifreleme veya optik biçimini değiştirmek
- Renkli QR özelliğini gerçek telefon testleri tamamlanmadan “daha hızlı” olarak pazarlamak

## 17. Uygulama Sırası

Detaylı uygulama planı aşağıdaki sırayı koruyacaktır:

1. Akıllı sıkıştırma ve yük geri yükleme
2. CQF2 paket biçimi
3. CRF2 kare biçimi
4. Güvenli renkli alım oturumu
5. Yön işaretli renk matrisi V2
6. Worker ve kamera tarama zamanlaması
7. Laboratuvar sayfasının yeni motora geçirilmesi
8. Tek kare ve çok kare paylaşım kuralları
9. Renkli video üretme ve çözme
10. Şifreli kapsayıcı sürüm 2 desteği
11. Ana QR Video profil entegrasyonu
12. Regresyon, performans ve gerçek telefon kontrolleri
