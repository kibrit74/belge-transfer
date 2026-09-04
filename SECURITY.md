# VaultDrop Güvenlik Sözleşmesi

## Temel sınır

Dosya içeriği web sunucusuna veya Yakındaki Cihazlar tanıştırma sunucusuna yüklenmez. Tanıştırma sunucusu yalnız 3 dakika yaşayan oda kodu ile WebRTC bağlantı mesajlarını taşır. Dosya adı, MIME türü, dosya boyutu, dosya SHA-256 özeti ve dosya baytları bu API tarafından kabul edilmez.

## Canlı QR

- Yan yana cihazlar içindir ve şifreli değildir.
- Ekranı gören başka bir kamera kareleri okuyabilir; hassas dosyada VaultDrop kullanılmalıdır.
- Alıcı paket yapısı, dosya boyutu ve SHA-256 doğrulanmadan indirme bağlantısı oluşturmaz.
- QR Video ve renkli QR aktif ürün yöntemi değildir.

## Yakındaki Cihazlar

- WebRTC veri kanalı DTLS ile şifrelenir; yalnız sıralı ve güvenilir kanal kullanılır.
- İki cihaz aynı Türkçe doğrulama ifadesini göstermeden kullanıcı devam etmemelidir.
- 6 karakterli kod tek kullanımlıktır; ikinci alıcı reddedilir, denemeler sınırlandırılır ve oda en geç 3 dakikada silinir.
- Ham oda tokenı URL'ye, gövdeye veya günlüğe yazılmaz; sunucuda yalnız SHA-256 özeti saklanır.
- Alıcı açıkça kabul etmeden dosya baytı gönderilmez. Boyut ve SHA-256 doğrulanmadan indirme oluşmaz.
- TURN kullanılmadığı için bazı misafir veya kurumsal ağlarda bağlantı kurulmayabilir; 15 saniye sonra VaultDrop önerilir.

## VaultDrop

- Yeni `.vdrop` paketleri AES-256-GCM ile cihazda şifrelenir. Eski `.bta` yalnız açma uyumluluğu içindir.
- Paket anahtarı dosyadan ayrı bir kanalla gönderilmelidir; sunucuya, URL'ye veya dosya adına yazılmaz.
- Bozuk paket, yanlış anahtar, eksik alan veya SHA uyuşmazlığında dosya indirmesi açılmaz.
- İndirilen dosya adı kontrol karakterleri, yol parçaları, Windows ayrılmış adları ve aşırı uzunluk için temizlenir.

## Kapsamadığı tehditler

Ele geçirilmiş cihaz, kötü niyetli tarayıcı eklentisi, ekran kaydı, kullanıcının doğrulama ifadesini kontrol etmeden devam etmesi veya anahtar ile paketi aynı kanalda paylaşması bu modelin dışındadır.
