# VaultDrop

`VaultDrop`, hassas dosyaları sunucuya yüklemeden aktarmak için tasarlanmış bir web uygulamasıdır.

## Üyelik, Neon ve Google girişi

Misafirler VaultDrop paketi yönteminde tek dosyayı, toplam 10 MiB'a kadar işleyebilir. Google ile giriş yapan üyeler tek VaultDrop paketi işleminde en fazla 15 dosya seçebilir; seçilen dosyaların toplamı 50 MiB olabilir. Paketler aylık toplam kullanım kotasıyla sunulur: Free 10 MiB, Standart 50 MiB, Plus 250 MiB ve Kurumsal 1 GiB. Bu kotalar tek dosya ya da tek aktarım sınırı değildir. Üyelerin son 90 günlük işlem özetleri Neon veritabanında tutulur. Dosya adı, dosya içeriği, şifreleme anahtarı ve QR verisi veritabanına yazılmaz.

1. `.env.example` dosyasını `.env.local` adıyla kopyalayın.
2. Neon panelindeki pooled bağlantıyı `DATABASE_URL`, direct bağlantıyı `DATABASE_DIRECT_URL` alanına girin.
3. Google Cloud ayarlarında yönlendirme adresini `http://localhost:5704/api/auth/google/callback` olarak tanımlayın.
4. Daha önce mesaj içinde paylaşılan Google gizli anahtarını yenileyip yalnızca `.env.local` içine yazın.
5. Şemayı kurup sistemi başlatın:

```bash
npm run db:migrate
npm run dev:all
```

Web arayüzü `http://localhost:5173`, API ise `http://localhost:5704` adresinde çalışır.

Ürün üç aktarım yolu etrafında tasarlanmıştır. VaultDrop stabil ana yöntemdir; deneysel kapılar kapalıyken Canlı QR güvenli 1 MiB sınırına iner ve Yakındaki Cihazlar kartı pasif kalır:

- **Canlı QR:** Yan yana cihazlarda kamera ile, tek dosya veya ZIP için en fazla 2 MiB.
- **Yakındaki Cihazlar:** Aynı Wi-Fi veya yerel ağdaki iki tarayıcı arasında doğrudan, tek dosya için en fazla 100 MiB.
- **VaultDrop:** Farklı ağ/şehir veya hassas dosya için şifreli `.vdrop` paketi. Eski `.bta` yalnız açma uyumluluğudur.

QR Video ve renkli QR aktif ürün yöntemi değildir. Dosya içeriği tanıştırma sunucusuna yüklenmez.

Canlı QR'ın 2 MiB ve Yakındaki Cihazlar'ın 100 MiB sınırları gerçek cihaz kabul kapılarıdır. Örnek ortam dosyasında `VITE_ENABLE_NEARBY=false` ve `VITE_ENABLE_LIVE_QR_FAST=false` güvenli varsayılanları kullanılır. Manuel cihaz matrisleri tamamlanmadan hızlı profil üretimde açılmamalıdır; VaultDrop bu kapılardan bağımsız çalışır.

## Çalıştırma

```bash
npm install
npm run dev
```

Kamera erişimi için tarayıcının `localhost` veya HTTPS üzerinde çalışması gerekir. Telefonla test ederken aynı ağda Vite'ı `--host` ile açabilir veya uygulamayı HTTPS destekli bir ortama deploy edebilirsiniz.

## VaultDrop Paket Akışı

Uzak gönderim için önerilen yöntem **VaultDrop paketi** modudur.

1. Gönderen dosyayı seçer.
2. Uygulama dosyayı cihazda AES-256-GCM ile şifreler ve yeni paketi `.vdrop` olarak hazırlar. Paket ve anahtar VaultDrop sunucusuna yüklenmez.
3. Gönderen `.vdrop` dosyasını WhatsApp, Slack, e-posta veya başka bir kanaldan gönderir. Eski `.bta` paketleri yalnız açma uyumluluğu için desteklenir.
4. Anahtar ayrı bir kanaldan gönderilir. Telefon, SMS, ayrı sohbet veya başka bir güvenilir kanal kullanın; anahtarı aynı mesajda göndermeyin.
5. Alıcı `.vdrop` veya eski `.bta` dosyasını seçer, anahtarı girer ve özgün dosyayı indirir.

Yeni paketler `.vdrop` uzantısıyla oluşturulur. `.vdrop` paketi anahtar olmadan dosya adını, dosya türünü ve içeriği okunur halde taşımaz. Anahtar kaybolursa paket kurtarılamaz. Gönderen ve alıcı, ekranda gösterilen SHA-256 değerini karşılaştırabilir.

## Canlı QR Akışı

Canlı QR yalnız yan yana olan cihazlar içindir: tek dosya veya ZIP **en fazla 2 MiB** olabilir. Renkli kod veya QR Video kullanılmaz; yeni gönderimler tek, büyük ve siyah-beyaz QRL2 kodlu Dengeli profili kullanır. Dengeli profil 24 FPS hedefler ve her karede 1465 baytlık fountain sembolü taşır; eski QRL1 aktarımları yalnız alım uyumluluğu için 1 MiB sınırıyla okunur.

Bu yol şifreli değildir. Hassas, büyük, çoklu veya uzaktaki gönderimler için şifreli **VaultDrop** paketini kullanın. Kamera yaklaşık yüzde 20 kare kaybını tolere eder; alıcı, paket ve dosya SHA-256 kontrolleri geçmeden indirme bağlantısı göstermez.

Dar ekranlarda hücre boyutu güvenli değilse Canlı QR başlamaz ve VaultDrop önerilir. Dört QR'lı geniş ekran düzeninde her QR hücresi gerçek görüntüde en az üç piksel kalır.

## Yakındaki Cihazlar Akışı

Yakındaki Cihazlar aynı Wi-Fi veya yerel ağdaki iki bilgisayarın tarayıcıları içindir. Davet bağlantısı ana akış, kısa kod yedek akıştır. Davet tek kullanımlık ve 5 dakika geçerlidir. Gönderen bağlantıyı Teams, WhatsApp Web veya e-posta gibi bir kanaldan paylaşabilir. Link otomatik katılmaz; alıcı oda kodunu kontrol edip açıkça `Bağlan` der. İki ekranda aynı doğrulama ifadesi görülürse kullanıcılar devam eder. Alıcı dosyayı kabul ettikten sonra en fazla 100 MiB dosya WebRTC veri kanalı üzerinden doğrudan aktarılır.

Tanıştırma sunucusu yalnız oda kodu ile WebRTC bağlantı mesajlarını taşır. Dosya adı, türü, boyutu, SHA-256 özeti ve içerik davet URL'sine ya da tanıştırma API'sine gönderilmez. Token davet URL'sine konmaz; tanıştırma API'sine yalnız kimlik doğrulama başlığında gönderilir. Dosya mesajlaşma kanalından veya tanıştırma API'sinden geçmez; yalnız doğrudan WebRTC veri kanalını kullanır. Alıcı SHA-256 doğrulamasını bitirmeden gönderici başarı göstermez ve indirme bağlantısı oluşmaz. Aynı ağ/WebRTC bağlantısı 15 saniyede kurulamazsa VaultDrop stabil yedek olarak kullanılır.

Gerçek cihaz matrisi tamamlanana kadar üretimde `VITE_ENABLE_NEARBY=false` kalır. QR Video ve renkli QR aktif ürün yöntemi değildir.

## Kaldırılan deneysel yöntemler

QR Video ve renkli QR yeni gönderim, alım veya öneri olarak gösterilmez. Eski teknik modüller yalnız geriye dönük test/temizlik amacıyla kaynakta kalabilir; aktif ürün akışı bunları çağırmaz.

## Teknik Özet

- Canlı QR: LQP1 paket, QRL2 kare ve 1000 baytlık parça düzeni; eski QRL1 yalnız alım uyumluluğudur.
- Yakındaki Cihazlar: NDP1 mesajları, 32 KiB veri parçaları, güvenilir WebRTC veri kanalı ve uçtan uca SHA-256 doğrulaması.
- VaultDrop: AES-256-GCM şifreli `.vdrop` paketi; eski `.bta` yalnız açma uyumluluğudur.
- VaultDrop paketi sınırı: Giriş yapan üyeler: tek işlemde en fazla 15 dosya, toplam 50 MiB; misafirler: tek dosya, toplam 10 MiB.
- Canlı QR sınırı: tek dosya veya ZIP için 2 MiB.
- Yakındaki Cihazlar sınırı: tek dosya için 100 MiB.
- Aylık kullanım kotası: Free 10 MiB, Standart 50 MiB, Plus 250 MiB, Kurumsal 1 GiB.
- SHA-256 özeti, alıcı ve gönderici tarafında dosya bütünlüğünü karşılaştırmak için gösterilir.

Eski QR Video ve renkli QR biçimleri kaynakta yalnız teknik geriye dönük testler için bulunabilir; ürün arayüzünden başlatılamaz.

## Test

```bash
npm test
npm run lint
npm run build
```

## Admin paneli

Admin paneli `/admin` adresindedir. İlk yetkili hesabı tanımlamak için `.env.local`
dosyasına giriş hesabınızın e-postasını ekleyin:

```env
VAULTDROP_SUPER_ADMIN_EMAILS=admin@example.com
```

Birden fazla kurtarma hesabı virgülle ayrılabilir. Bu değişken yalnız sunucuda
tutulmalı ve `VITE_` öneki almamalıdır. Veritabanı şemasını güncelledikten sonra
API'yi yeniden başlatın:

```bash
npm run db:migrate
npm run dev:all
```

MVP; Dashboard, kullanıcılar, aktarım özetleri, sistem logları ve değiştirilemez
admin audit kayıtlarını içerir. Kullanıcı askıya alma, banlama ve aylık özel limit
işlemleri backend'de permission kontrolünden geçer. Dosya adı, dosya içeriği,
şifreleme anahtarı ve QR verisi admin kayıtlarına yazılmaz.

## Önemli Sınırlar

Bu uygulama, dosyanın sunucuya yüklenmesini önlemeye ve içerik gizliliğini anahtarla korumaya odaklanır. Mesajlaşma platformları gönderim zamanı, taraflar, dosya boyutu gibi üst verileri yine görebilir. Ele geçirilmiş telefon veya bilgisayar için koruma sağlamaz.

### Aylık kota sınırı

Aylık bayt kotası, resmi uygulamayı kullanan hesaplar için kooperatif kullanım takibidir. Sunucu dosyayı görmediği için istemcinin bildirdiği ham boyutu esas alır; bu nedenle kötü niyetli değiştirilmiş istemciye karşı güvenilir bir bayt sınırı değildir. Bu sınır, dosya içeriğini veya anahtarı sunucuya yüklemeyen gizlilik yaklaşımını değiştirmez.

Daha ayrıntılı tehdit modeli için `docs/SECURITY.md` dosyasına bakın.

### Üretim güvenlik başlıkları

`public/_headers` dosyası, tarayıcının uygulamayı daha güvenli çalıştırması için
gerekli başlıkları tanımlar. Kullandığınız barındırma hizmeti bu dosya biçimini
desteklemiyorsa, aynı başlıkları hizmetin panelinden ekleyin. Yayını tamamlamadan
önce tarayıcı geliştirici araçlarında `Content-Security-Policy` yanıt başlığının
geldiğini doğrulayın.
