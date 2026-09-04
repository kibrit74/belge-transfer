# VaultDrop Kimlik Doğrulama, Neon ve Profil Dashboard Tasarımı

## Amaç

VaultDrop'a Google ile giriş, güvenli sunucu oturumu, Neon üzerinde kullanıcı ve transfer geçmişi, misafir kullanım sınırları, çoklu dosya aktarımı ve kullanıcı profil dashboardu eklemek.

## Onaylanan ürün kuralları

- Misafir kullanıcı aktarım yapabilir.
- Misafir kullanıcı tek seferde yalnız bir dosya ve en fazla 10 MiB kullanabilir.
- Misafir kullanıcı seri/çoklu aktarım ve geçmiş özelliğini kullanamaz.
- Google ile giriş yapan kullanıcı dosya başına 50 MiB ve en fazla 15 dosyalık seri aktarım kullanabilir.
- Canlı QR tek dosyalı kalır.
- Şifreli Paket üyeler için en fazla 15 dosyayı tek şifreli arşiv olarak aktarır.
- QR Video tüm kullanıcılar için en fazla 15 dosyayı tek şifreli arşiv olarak aktarır; toplam veri 15 MiB ile sınırlıdır.
- Transfer geçmişi 90 gün saklanır.
- Dosya adı, dosya içeriği, şifreleme anahtarı, QR kareleri ve paket dosyası veritabanına yazılmaz.

## Mimari

Mevcut Vite/React istemcisi `localhost:5173` üzerinde çalışmaya devam eder. Yeni Express API `localhost:5704` üzerinde çalışır. Geliştirme sırasında Vite `/api` isteklerini Express'e yönlendirir; üretimde istemci ve API aynı origin altında yayınlanır.

Google OAuth akışı Express tarafından yürütülür. OAuth `state` ve PKCE doğrulaması yapılır. Başarılı girişten sonra rastgele üretilen oturum kimliğinin yalnız hash'i Neon'a yazılır; ham değer `HttpOnly`, `SameSite=Lax` çerezinde tutulur. Üretimde HTTPS varsa `Secure` işareti etkinleşir.

Neon uygulama sorguları havuzlanmış `DATABASE_URL` ile, migration işlemleri doğrudan `DATABASE_DIRECT_URL` ile çalışır. Tüm SQL sorguları parametreli olur.

## Veritabanı şeması

### `users`

- UUID birincil anahtar
- Benzersiz Google subject değeri
- Benzersiz e-posta
- Görünen ad ve profil fotoğrafı
- Hesap türü
- Oluşturulma ve son giriş zamanı

### `sessions`

- UUID birincil anahtar
- Kullanıcı ilişkisi
- Benzersiz oturum token hash'i
- Oluşturulma, son görülme, sona erme ve iptal zamanı

### `transfer_batches`

- UUID birincil anahtar
- Kullanıcı ilişkisi
- Yöntem: `live_qr`, `secure_package`, `qr_video`
- Yön: `send`, `receive`
- Durum: `started`, `completed`, `failed`
- Dosya sayısı ve toplam byte
- Başlangıç ve tamamlanma zamanı

### `transfer_items`

- UUID birincil anahtar
- Transfer ilişkisi
- Sıra numarası
- Küçük harfe dönüştürülmüş uzantı veya `unknown`
- Dosya boyutu
- Dosya adı bulunmaz

## API sözleşmesi

- `GET /api/health`: API ve veritabanı durumu
- `GET /api/auth/google/start`: Google girişini başlatır
- `GET /api/auth/google/callback`: Google dönüşünü doğrular ve oturum açar
- `GET /api/auth/session`: Aktif kullanıcıyı ve limitlerini döndürür
- `POST /api/auth/logout`: Oturumu iptal eder
- `POST /api/transfers`: Başlatılan/tamamlanan/başarısız transfer özetini kaydeder
- `GET /api/profile/summary`: Dashboard özet metriklerini döndürür
- `GET /api/profile/transfers`: Sayfalı ve filtrelenebilir geçmiş döndürür

Durum değiştiren cookie-auth API istekleri aynı origin ve `X-VaultDrop-Request` başlığı ile korunur. Giriş ve API rotalarında oran sınırlama uygulanır. İstek gövdeleri Zod ile doğrulanır.

## Çoklu dosya akışı

Kullanıcı birden fazla dosya seçtiğinde dosyalar tarayıcıda ZIP arşivine dönüştürülür. ZIP daha sonra mevcut AES-256-GCM akışına girer. Sunucu yalnız dosya sayısı, toplam boyut ve uzantıları kaydeder. Alıcı şifre çözme sonunda ZIP dosyasını indirir.

Şifreli Paket için giriş yapan kullanıcı en fazla 15 dosya seçebilir; misafir kullanıcıda çoklu seçim reddedilir. QR Video tüm kullanıcılar için en fazla 15 dosya seçimine izin verir ancak toplam ham dosya boyutu 15 MiB'ı aşamaz.

## Arayüz

### Navbar

- Misafirde `Giriş Yap` butonu
- Giriş yapan kullanıcıda küçük profil fotoğrafı ve `Profilim`
- Profil alanında güvenli `Çıkış Yap`

### Giriş sayfası

- VaultDrop tasarım diliyle kısa güven açıklaması
- Tek ana eylem: `Google ile devam et`
- Misafir kullanımına dönüş bağlantısı
- Google giriş hatası için sade hata durumu

### Profil dashboardu

- Bugünkü transfer sayısı
- Son 30 günlük transfer sayısı
- Aktarılan toplam veri
- Başarı oranı
- Aktarım yöntemlerine göre dağılım
- Tarih, saat, yöntem, yön, dosya sayısı, toplam boyut ve durum tablosu
- Tarih aralığı ve yöntem filtresi
- Boş, yükleniyor ve hata durumları

## Gizlilik ve güvenlik

- Google istemci sırrı, Neon bağlantı adresleri, oturum sırrı ve otomasyon anahtarı repoya yazılmaz.
- İstemciye veritabanı bağlantı adresi verilmez.
- Ham oturum kimliği veritabanında tutulmaz.
- OAuth state ve PKCE doğrulanır.
- Oturum girişte yenilenir, çıkışta iptal edilir ve 30 gün sonra sona erer.
- Dashboard sorgularında her kayıt aktif kullanıcı kimliğiyle sınırlandırılır.
- 90 günden eski transfer kayıtları migration içindeki temizleme fonksiyonu ve zamanlanabilir bakım komutuyla silinir.
- IMAP bilgileri bu özellikte kullanılmaz; e-posta okuma ayrı bir sistemdir.
- Paylaşılan Google istemci sırrı ve otomasyon anahtarı görünür olduğu için yenilenmelidir.

## Hata davranışı

- Backend veya Neon geçici olarak erişilemiyorsa misafir tekli aktarım çalışmaya devam eder.
- Giriş gerektiren geçmiş ve çoklu aktarım özellikleri güvenli şekilde durur ve kullanıcıya yeniden deneme mesajı gösterir.
- Transfer geçmişinin kaydedilememesi şifreli dosyayı bozmaz; kullanıcıya geçmiş kaydının başarısız olduğu bildirilir.
- OAuth hataları iç ayrıntı sızdırmadan giriş sayfasına güvenli hata koduyla döner.

## Test yaklaşımı

- Veritabanı şeması kısıtları ve repository sorguları
- OAuth state/PKCE, oturum çerezi ve çıkış
- Kimlik doğrulama ve CSRF korumalı API rotaları
- Misafir ve giriş yapan kullanıcı limitleri
- Çoklu dosya ZIP oluşturma ve QR Video toplam boyut sınırı
- Navbar giriş/profil durumları
- Dashboard metrikleri, filtreler, boş ve hata durumları
- Mevcut transfer protokolü regresyon testleri

## Dağıtım notu

Neon MCP aracı bu oturumda çağrılabilir bir veritabanı işlemi sunmadığı için migration dosyaları projede hazırlanacaktır. Gerçek `sweet-thunder-75637926` projesine uygulama, döndürülmüş güvenli kimlik bilgileriyle `DATABASE_DIRECT_URL` sağlandığında migration komutuyla yapılacaktır.
