# VaultDrop Sunucusuz Güvenlik Temeli Tasarımı

## Amaç

VaultDrop'un dosya içeriğini, şifreli paketi veya şifreleme anahtarını kendi sunucusunda saklamadığı ürün vizyonunu teknik olarak kesinleştirmek. Şifreli Paket yönteminde mevcut BTA1 biçimi korunacak; sunucuda şifreli içerik saklayan Secure Link yöntemi tamamen kaldırılacak.

Bu çalışma büyük dosyalar için yeni bir BTA2 biçimi oluşturmaz. Plus paketindeki 250 MiB ve Kurumsal paketteki 1 GiB değerleri tek dosya sınırı değil, aylık toplam kullanım kotasıdır.

## Kapsam

Bu çalışma şunları kapsar:

- Secure Link oluşturma, açma ve sunucuda saklama akışının kaldırılması.
- Mevcut `secure_shares` kayıtlarının ve tablosunun yeni bir veritabanı geçişiyle kalıcı olarak silinmesi.
- BTA1 Şifreli Paket oluşturma ve açma akışının korunması.
- Bir Şifreli Paket işleminde en fazla 15 dosya ve toplam 50 MiB teknik sınırının uygulanması.
- Misafir kullanıcı için mevcut tek dosya ve toplam 10 MiB sınırının korunması.
- Aylık kotanın paket başarıyla oluşturulduğunda kesinleşmesi.
- Anahtar paylaşım uyarılarının ve tarayıcı güvenlik politikalarının güçlendirilmesi.
- Eski Secure Link adreslerinin içerik döndürmeden yöntemin kaldırıldığını bildirmesi.

Bu çalışma şunları kapsamaz:

- BTA2 paket biçimi.
- Tek işlemde 250 MiB veya 1 GiB dosya işleme.
- Dijital imza veya gönderen kimliği doğrulaması.
- VaultDrop sunucusu üzerinden dosya, şifreli paket, QR verisi ya da anahtar aktarımı.

## Temel Mimari

### Şifreli Paket

Dosyalar yalnızca kullanıcının tarayıcısında hazırlanır ve AES-256-GCM kullanan mevcut BTA1 `.bta` paketine dönüştürülür. Paket, anahtar, özgün dosya adı ve içerik VaultDrop sunucusuna gönderilmez.

Alıcı `.bta` paketini ve ayrı kanaldan aldığı anahtarı kendi cihazında seçer. Paket tarayıcıda açılır ve özgün dosya alıcının cihazında yeniden oluşturulur. Bu sırada paket veya anahtar için sunucu isteği yapılmaz.

### Canlı QR ve QR Video

Canlı QR yönteminde veri optik QR kareleriyle aktarılır. QR Video yönteminde şifreli veri QR kareleri olarak video içinde taşınır. Bu yöntemlerin içerik aktarımı VaultDrop sunucusundan geçmez.

### Sunucunun Sorumluluğu

Sunucu yalnızca hesap, plan, aylık kota ve işlem özeti için gerekli sınırlı bilgileri işler:

- Kullanıcı kimliği.
- Aktarım yöntemi.
- Kotadan düşülecek toplam bayt.
- İşlemin başarılı veya başarısız durumu.
- İşlem zamanı.

Sunucu şu verileri kabul etmez veya saklamaz:

- Özgün dosya içeriği.
- `.bta` paketi.
- Şifreleme anahtarı.
- Dosya adı veya dosya türü.
- QR kareleri ya da QR video içeriği.
- Şifreli dosya verisi.

## Secure Link'in Kaldırılması

- `/api/secure-shares` oluşturma servisi kaldırılır.
- Secure Link bilgisi ve şifreli içerik döndüren servisler kaldırılır.
- Secure Link açma istemcisi ve oluşturma arayüzü kaldırılır.
- Secure Link'e özel sunucu depoları, doğrulayıcılar ve test yardımcıları kaldırılır.
- Yeni bir ileri yönlü veritabanı geçişi `secure_shares` tablosunu düşürür. Daha önce saklanan bütün şifreli paketler kalıcı olarak silinir.
- Eski `/al/:id` adresleri hiçbir içerik veya paket bilgisi döndürmez. Kullanıcıya yöntemin kaldırıldığı ve gönderenden `.bta` paketiyle ayrı anahtarı istemesi gerektiği bildirilir.
- Eski Secure Link API istekleri `410 Gone` durumuyla genel ve içeriksiz bir yanıt alır.

Daha önce uygulanmış geçiş dosyası değiştirilmez veya silinmez. Tabloyu kaldırmak için sıralı yeni bir geçiş eklenir; böylece mevcut kurulumlar güvenli biçimde ileri taşınır.

## Şifreli Paket Veri Akışı

### Oluşturma

1. Kullanıcı dosyaları seçer.
2. İstemci dosya sayısını ve toplam ham boyutu yerel olarak doğrular.
3. Misafir kullanıcı yalnızca bir dosya ve toplam 10 MiB ile sınırlandırılır.
4. Giriş yapmış kullanıcı en fazla 15 dosya ve toplam 50 MiB ile sınırlandırılır.
5. Giriş yapmış kullanıcı için sunucuya yalnızca yöntem ve toplam ham bayt gönderilerek aylık kota rezervasyonu yapılır.
6. Dosyalar tarayıcı içinde hazırlanır ve BTA1 olarak şifrelenir.
7. Paket rastgele, içerik sızdırmayan bir adla kullanıcının cihazına indirilir.
8. Paket başarıyla üretildiğinde rezervasyon aylık kullanıma dönüştürülür.
9. Paket üretimi başarısız olursa rezervasyon bırakılır.

Sunucu alıcının paketi açıp açmadığını doğrulayamaz. Bu nedenle aylık kullanım, paket alıcı tarafından açıldığında değil `.bta` başarıyla oluşturulduğunda kesinleşir.

Otomatik indirme tarayıcı tarafından engellense bile şifreli paket başarıyla üretildiyse kota kullanılmış sayılır. Kullanıcı aynı paket sonucunu ekrandaki indirme bağlantısıyla tekrar indirebilir; yeniden şifreleme veya ikinci kota kullanımı gerekmez.

### Açma

1. Kullanıcı `.bta` dosyasını cihazından seçer.
2. Ayrı kanaldan aldığı anahtarı girer.
3. BTA1 başlığı, paket sınırları ve anahtar biçimi doğrulanır.
4. Paket AES-GCM doğrulamasıyla tarayıcı içinde açılır.
5. Dosya boyutu ve SHA-256 özeti kontrol edilir.
6. Özgün dosya yalnızca bütün kontroller başarılıysa kullanıcının cihazında oluşturulur.
7. Açma işlemi sırasında paket, anahtar, dosya adı veya içerik sunucuya gönderilmez.

## Teknik ve Aylık Sınırlar

- Bir Şifreli Paket işleminde en fazla 15 dosya seçilebilir.
- Giriş yapmış kullanıcı için seçilen dosyaların toplam ham boyutu en fazla 50 MiB olabilir.
- Misafir kullanıcı tek dosya ve toplam 10 MiB ile sınırlıdır.
- 50 MiB, aylık kota değil tek Şifreli Paket oluşturma işleminin teknik sınırıdır.
- Plus kullanıcının bütün başarılı oluşturma işlemleri bir ay içinde toplam 250 MiB ile sınırlıdır.
- Kurumsal kullanıcının bütün başarılı oluşturma işlemleri bir ay içinde toplam 1 GiB ile sınırlıdır.
- Mevcut diğer plan kotaları değişmeden korunur.
- Paketleme ek yükü aylık kotaya eklenmez; kota seçilen özgün dosyaların toplam ham boyutuna göre hesaplanır.

## Anahtar Kullanıcı Deneyimi

Paket üretildikten sonra arayüz iki ayrı adımı açıkça gösterir:

1. `.bta` paketini gönder.
2. Anahtarı farklı bir kanaldan gönder.

Anahtar için şu kurallar uygulanır:

- Anahtar URL'ye, dosya adına, işlem kaydına veya sunucu isteğine eklenmez.
- Anahtar varsayılan durumda açık metin olarak gösterilmez.
- Birincil işlem `Anahtarı kopyala` düğmesidir.
- Kopyalama başarılı olduğunda kullanıcıya paketi ve anahtarı aynı konuşmada paylaşmaması hatırlatılır.
- Pano erişimi engellenirse kullanıcı anahtarı kendi isteğiyle geçici olarak görünür yapıp elle kopyalayabilir.
- Kullanıcı görünür anahtarı yeniden gizleyebilir.
- Paket ve anahtarı tek işlemle birlikte paylaşan bir düğme sunulmaz.
- Anahtar kaybedilirse paketin kurtarılamayacağı açıkça belirtilir.
- VaultDrop anahtar kurtarma veya sıfırlama hizmeti sunmaz.

## Tarayıcı ve Dağıtım Güvenliği

- Şifreleme Web Crypto API ile yalnızca güvenli HTTPS bağlamında çalışır; yerel geliştirme için `localhost` istisnadır.
- İçerik Güvenlik Politikası, uygulamanın kendi kaynaklarına ve Google girişinin gerçekten gerektirdiği bağlantılara izin verecek kadar dar tutulur.
- Üretim yanıtlarında uygun güvenlik başlıkları bulunur.
- Gereksiz üçüncü taraf JavaScript kaldırılır veya yüklenmez.
- Politika `unsafe-eval` kullanımına izin vermez.
- Uygulamanın bir çerçeve içinde açılması engellenir.
- Üretim politikası hem istemci barındırma katmanında hem API katmanında doğrulanır.

Geliştirme ortamının Vite gereksinimleri üretim politikasını genişletmez. Geliştirme ve üretim ayarları ayrı ele alınır.

## Hata Yönetimi

- Dosya sayısı veya toplam boyut sınırı aşılırsa kota rezervasyonu ve şifreleme başlamaz.
- Aylık kota yetmiyorsa gereken miktar ve kalan aylık hak kullanıcıya anlaşılır biçimde gösterilir.
- Yerel hazırlama veya şifreleme başarısız olursa ayrılan kota bırakılır.
- Kota kesinleştirme isteği geçici olarak başarısız olursa mevcut rezervasyon korunur ve güvenli yeniden deneme uygulanır; aynı işlem iki kez kotadan düşülmez.
- Yanlış anahtar, değiştirilmiş paket ve bozuk şifreli içerik aynı genel hata mesajıyla reddedilir.
- Biçim veya boyut sınırı hataları kullanıcıya ayrı ve anlaşılır şekilde gösterilebilir; kriptografik doğrulama ayrıntısı açıklanmaz.
- Özgün dosya adı ve türü yalnızca paket başarıyla açıldıktan sonra kullanılır.
- Eski Secure Link istekleri hiçbir kayıt varlığı veya paket ayrıntısı sızdırmadan `410 Gone` döndürür.

## Test Tasarımı

### Şifreli Paket

- BTA1 paket oluşturma ve açma tur testi.
- Mevcut BTA1 örnek paketiyle geriye uyumluluk testi.
- Her paket için yeni rastgele anahtar ve IV üretildiğinin testi.
- Yanlış anahtarın ve değiştirilmiş paketin aynı genel hatayla reddedilmesi.
- Dosya adı, tür ve içeriğin şifreli bölümde kaldığının testi.
- Anahtarın paket, URL ve sunucu isteklerinde bulunmadığının testi.
- Alım sırasında ağ isteği yapılmadığının testi.

### Sınırlar ve Kota

- Misafir için tek dosya ve toplam 10 MiB sınırı.
- Üye için en fazla 15 dosya ve toplam 50 MiB sınırı.
- Toplam 50 MiB aşımının kota ayırmadan reddedilmesi.
- Başarılı paket üretiminde kotanın kesinleşmesi.
- Yerel başarısızlıkta rezervasyonun bırakılması.
- Aynı rezervasyonun iki kez kesinleştirilememesi.
- Plus 250 MiB ve Kurumsal 1 GiB değerlerinin aylık toplam kota olarak uygulanması.

### Secure Link Kaldırma

- Yeni Secure Link oluşturulamaması.
- Eski API yollarının içeriksiz `410 Gone` döndürmesi.
- Eski alım adresinin kaldırılma mesajı göstermesi.
- İstemci paketinde Secure Link oluşturma ve açma çağrılarının bulunmaması.
- Yeni veritabanı geçişinin `secure_shares` tablosunu kaldırması.
- Sunucu kodunda `encrypted_payload` yazma veya okuma yolunun kalmaması.

### Güvenlik Politikaları

- Üretim CSP başlığının bulunması ve beklenen kaynaklarla sınırlı olması.
- Çerçevelemeyi engelleyen politikanın bulunması.
- Üretimde `unsafe-eval` kullanılmaması.
- Uygulama testleri, kod denetimi ve üretim derlemesinin başarılı olması.

## Kabul Ölçütleri

1. VaultDrop sunucusu dosya, `.bta`, anahtar, dosya adı, QR içeriği veya şifreli dosya verisi kabul etmez ve saklamaz.
2. Secure Link üzerinden yeni paket oluşturulamaz veya eski paket indirilemez.
3. `secure_shares` tablosu ileri yönlü geçişle kaldırılır.
4. Mevcut BTA1 paketleri açılmaya devam eder.
5. Giriş yapmış kullanıcı tek işlemde en fazla 15 dosya ve toplam 50 MiB ile sınırlandırılır.
6. 250 MiB ve 1 GiB değerleri yalnızca aylık toplam kota olarak uygulanır.
7. Aylık kullanım `.bta` başarıyla üretildiğinde kesinleşir.
8. Paket açma işlemi tamamen yerel çalışır ve ağ isteği yapmaz.
9. Paket ile anahtarı birlikte paylaşmayı teşvik eden veya otomatikleştiren bir akış bulunmaz.
10. Üretim güvenlik politikaları gerekli otomatik testlerle doğrulanır.

## Uygulama Sırası

1. Secure Link davranışını kaldıran testleri yazmak.
2. Secure Link istemci ve sunucu kodlarını kaldırmak; eski yolları içeriksiz `410 Gone` yanıtına çevirmek.
3. `secure_shares` tablosunu kaldıran yeni veritabanı geçişini eklemek.
4. Şifreli Paket toplam 50 MiB kontrolünü ve aylık kota kesinleştirme davranışını doğrulamak.
5. Anahtar paylaşım arayüzünü güçlendirmek.
6. Üretim CSP ve güvenlik başlıklarını eklemek veya daraltmak.
7. Otomatik test, kod denetimi ve üretim derlemesini çalıştırmak.

