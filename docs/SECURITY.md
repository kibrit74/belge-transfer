# Güvenlik ve Tehdit Modeli

Bu belge VaultDrop uygulamasının üç aktif aktarım yönteminde neyi koruduğunu ve hangi risklerin kullanıcı sorumluluğunda kaldığını açıklar.

## Ortak güvenlik sınırı

Dosya içeriği tanıştırma sunucusuna yüklenmez. Sunucu yalnız hesap kotası, işlem özeti ve Yakındaki Cihazlar için kısa ömürlü bağlantı mesajlarını işler. Dosya adı, içerik, şifreleme anahtarı ve dosya SHA-256 değeri bağlantı API'sine gönderilmez.

QR Video ve renkli QR aktif ürün yöntemi değildir. Eski teknik modüller ürün arayüzünden başlatılamaz.

## VaultDrop

- Yeni paketler `.vdrop` olarak oluşturulur ve AES-256-GCM ile cihazda şifrelenir. Her paket için rastgele 256 bit anahtar ve 96 bit IV üretilir.
- Dosya adı, türü, boyutu ve SHA-256 özeti paketin şifreli bölümünde tutulur.
- BTA1 ve BTA2 iç paket biçimleri geriye uyumludur; eski `.bta` paketleri yalnız açma uyumluluğu için desteklenir.
- Özgün dosya adı çözme sonrasında güvenli indirme adı olarak temizlenir.
- Yanlış anahtar, bozuk paket, eksik alan veya SHA-256 uyuşmazlığında özgün dosya üretilmez. Bozuk pakette indirme bağlantısı oluşturulmaz.
- Paket, içerik ve anahtar VaultDrop sunucusuna yüklenmez.
- Anahtar ayrı bir kanaldan paylaşılır. Anahtar kaybolursa paket kurtarılamaz.
- Gönderen ve alıcı SHA-256 değerini karşılaştırabilir.

## Canlı QR

- Canlı QR şifreli değildir; ekranı görebilen başka bir kamera kareleri okuyabilir.
- Yalnız yan yana cihazlarda ve hassas olmayan dosyalarda kullanılmalıdır.
- Alıcı paket yapısını, sınırları ve SHA-256 değerini doğrulamadan indirme bağlantısı oluşturmaz.
- Hassas veya uzaktaki dosyalarda VaultDrop kullanılmalıdır.

## Yakındaki Cihazlar

- WebRTC veri kanalı DTLS ile şifrelenir ve güvenilir, sıralı aktarım kullanır.
- Altı karakterli oda kodu tek kullanımlıdır ve en geç üç dakika içinde geçersiz olur.
- İki kullanıcı ekrandaki Türkçe doğrulama ifadesini karşılaştırmadan devam etmemelidir.
- Alıcı dosyayı açıkça kabul etmeden dosya baytları gönderilmez.
- Alıcı SHA-256 kontrolünü tamamlamadan indirme oluşmaz; gönderici de alıcının doğrulama onayı gelmeden başarı göstermez.
- TURN kullanılmadığı için bazı misafir ve kurumsal ağlarda bağlantı kurulamayabilir. On beş saniye sonunda VaultDrop önerilir.

## Korunmayan durumlar

- Ele geçirilmiş cihaz, güvenilmeyen tarayıcı eklentisi, ekran kaydı veya pano içeriğine erişen kötü amaçlı yazılım.
- VaultDrop paketiyle anahtarın aynı mesajda paylaşılması.
- Yakındaki Cihazlar doğrulama ifadesinin kullanıcı tarafından kontrol edilmemesi.
- Mesajlaşma platformlarının gönderim zamanı, taraflar ve paket boyutu gibi üst verileri görmesi.
- SHA-256 eşitliğinin tek başına dosyanın kaynağını veya hukuki kabulünü ispatladığının varsayılması.

## Yayın öncesi kontrol

| Senaryo | Beklenen sonuç |
|---|---|
| Windows Chrome → Android Chrome Canlı QR | Dosya SHA-256 eşleşir |
| Android Chrome → Windows Chrome Canlı QR | Dosya SHA-256 eşleşir |
| Aynı ağda Windows Chrome → Windows Edge | Doğrulama ifadesi ve SHA-256 eşleşir |
| Aynı ağda Windows Chrome → macOS Safari | Doğrulama ifadesi ve SHA-256 eşleşir |
| Misafir veya istemci izolasyonlu ağ | On beş saniye sonunda VaultDrop önerilir |
| `.vdrop` veya eski `.bta` paketi | Yanlış anahtar reddedilir, doğru anahtar özgün dosyayı verir |
| Kamera izni reddi | Kullanıcıya çözüm öneren Türkçe hata gösterilir |

Gerçek kamera, Safari ve yerel ağ davranışları cihazdan cihaza değişebildiği için `docs/nearby-devices-manual-test.md` formu üretim özelliği açılmadan önce doldurulmalıdır.
