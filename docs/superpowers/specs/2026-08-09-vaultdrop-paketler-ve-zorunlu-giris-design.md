# VaultDrop Paketler ve Zorunlu Giriş Tasarımı

## Amaç

VaultDrop paketlerini ayrı ve herkese açık bir sayfada göstermek; Free paket dahil tüm aktarım işlemlerini oturum açmış kullanıcılarla sınırlamak.

## Ürün Kuralları

- `/paketler` herkes tarafından görülebilir.
- `/transfer` yalnız giriş yapmış kullanıcı tarafından görülebilir.
- Oturumu olmayan kullanıcı `/transfer` isteğinde `/giris?returnTo=/transfer` adresine yönlendirilir; aktarım arayüzü kısa süreliğine dahi gösterilmez.
- Google girişinden sonra yalnız güvenli, uygulama içi dönüş adresleri kabul edilir. Bu kapsamda `/transfer` ve `/profil` desteklenir; diğer değerler `/profil` olarak ele alınır.
- Yeni kullanıcılar `free` planıyla başlar. Mevcut `standard`, `plus` ve `corporate` kullanıcılar korunur.
- Aylık kotalar: Free 10 MiB, Standart 50 MiB, Plus 250 MiB, Kurumsal 1 GiB.
- İşlem başına mevcut teknik sınırlar korunur: en fazla 15 dosya, dosya başına 50 MiB; QR Video toplam 15 MiB.
- Ödeme sistemi bu kapsamda değildir. Ücretli paketler açıklanır; satış varmış izlenimi verilmez.

## Arayüz

- Yeni paket sayfası mevcut sıcak, premium SaaS görsel dilini kullanır.
- Başlık altında dört paket kartı bulunur. Free kartında giriş/başlama çağrısı, Standart ve Plus kartlarında “Yakında”, Kurumsal kartında iletişim çağrısı yer alır.
- Navbar ve footer içine Paketler bağlantısı eklenir.
- Landing sayfasındaki “hesapsız kullanım” ifadeleri kaldırılır; ücretsiz hesap ve cihazda işleme vurgusu kullanılır.
- Mobilde kartlar tek sütuna düşer ve CTA'lar tam genişlikte kalır.

## Teknik Yaklaşım

- `App` seviyesinde bir `ProtectedTransferRoute` bileşeni oturum durumu yüklenirken nötr bir ekran, oturum yokken yönlendirme, oturum varken gerçek aktarım sayfasını gösterir.
- Dosya seçim politikası oturumsuz çağrıları ayrıca reddeder. Bu ikinci kontrol, aktarım bileşenlerinin yanlışlıkla koruma dışında kullanılmasına karşı güvenli varsayılandır.
- Paket değerleri `shared/plan-policy.js` içinde tek kaynak olarak tutulur ve hem bellek hem PostgreSQL kotası aynı değerleri uygular.
- Veritabanı göçü `free` değerini ve yeni kullanıcı varsayılanını ekler; mevcut planları değiştirmez.

## Kabul Ölçütleri

1. `/paketler` rotası dört planı ve doğru aylık kotaları gösterir.
2. Oturumsuz `/transfer` ziyaretçisi giriş sayfasına yönlendirilir ve aktarım başlığı görünmez.
3. Oturumlu kullanıcı `/transfer` içeriğini görür.
4. Giriş dönüş adresi güvenli biçimde korunur.
5. Oturumsuz dosya seçimi “Aktarım için giriş yapmalısınız.” hatası verir.
6. Yeni kullanıcı varsayılan planı Free olur; mevcut paketler korunur.
7. Navbar, footer, landing metinleri ve SSS yeni kuralla tutarlıdır.
8. Birim testleri, lint ve üretim derlemesi başarılıdır.
