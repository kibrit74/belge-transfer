# VaultDrop Admin Paneli MVP Tasarımı

## Amaç

VaultDrop operasyon ekibinin kullanıcıları ve aktarım özetlerini güvenli biçimde yönetebileceği; sistem durumunu ve logları izleyebileceği bir admin paneli oluşturmak. Yetkiler yalnız arayüzde değil, her admin API isteğinde sunucu tarafından zorunlu olarak denetlenir.

## Mevcut Mimari

- Arayüz: React 19, Vite, düz CSS ve mevcut VaultDrop tasarım tokenları.
- API: Express 5; oturum çerezi veya Neon JWT ile kullanıcı bağlama.
- Veri: Neon/PostgreSQL; sıralı SQL migration dosyaları ve repository katmanı.
- Test: Vitest, Testing Library ve Supertest.

## MVP Kapsamı

- Dashboard: kullanıcı, aktarım, hata ve kısıtlama özetleri; son aktiviteler.
- Users: arama, durum/rol filtresi, kullanıcı detayı, askıya alma, ban kaldırma/uygulama ve kullanıcıya özel aylık limit.
- Transactions: özet aktarım kayıtlarını filtreleme ve detay görüntüleme.
- Logs: uygulama logları ile silinemez admin audit kayıtlarını görüntüleme.
- RBAC: `super_admin`, `admin`, `support`, `analyst` rolleri ve açık permission listesi.
- Backend enforcement: admin rotalarında `401` oturum, `403` yetki reddi; normal aktarım rotalarında ban, askı ve salt-okunur/işlem engeli uygulanması.

## Veri Modeli

`users` tablosuna rol, durum, kısıtlama süresi/sebebi, işlem engeli ve kullanıcıya özel aylık limit eklenir. `admin_audit_logs` yalnız eklenen ve uygulama API'sinden silinemeyen denetim kaydıdır. `system_logs` operatörlerin filtreleyebildiği olay kaydıdır. Mevcut `transfer_batches` içerik veya dosya adı taşımadan işlem özetinin kaynağı olmaya devam eder.

İlk super admin, migration sonrasında `VAULTDROP_SUPER_ADMIN_EMAILS` ortam değişkenindeki e-posta listesi üzerinden sunucu tarafında yetkilendirilir. Veritabanındaki rol ataması sonraki yönetim için kaynak kabul edilir; ortam değişkeni güvenli kurtarma/ilk kurulum yoludur.

## Yetki Sözleşmesi

- `dashboard.view`: Dashboard verileri.
- `users.view`: Kullanıcı listesi ve detayı.
- `users.suspend`: Askıya alma ve askıyı kaldırma.
- `users.ban`: Banlama ve ban kaldırma.
- `users.limits`: Kullanıcı özel limitini değiştirme.
- `transactions.view`: Tüm aktarım özetlerini görme.
- `logs.view`: Sistem loglarını görme.
- `audit.view`: Admin audit loglarını görme.

`super_admin` tüm izinlere; `admin` MVP izinlerinin tamamına; `support` kullanıcı, aktarım ve log görüntüleme ile askıya alma iznine; `analyst` yalnız dashboard ve aktarım görüntüleme iznine sahiptir. Kullanıcı kendi durumunu değiştiremez. `super_admin` banlanamaz veya askıya alınamaz.

## İstek ve Veri Akışı

Kimlik doğrulama middleware'i kullanıcıyı rol ve kısıtlama alanlarıyla yükler. Admin rotası önce oturumu, sonra gereken permission'ı doğrular. Mutasyon servisi hedef kullanıcıyı kilitli işlem içinde günceller ve aynı işlemde audit kaydı ekler. Normal transfer oluşturma/rezervasyon uçları, kullanıcının aktif durumunu ve özel limitini sunucuda kontrol eder.

## Hata ve Güvenlik Davranışı

- Oturumsuz istek: `401 AUTH_REQUIRED`.
- Eksik yetki: `403 FORBIDDEN`.
- Banlı hesap: `403 ACCOUNT_BANNED`.
- Süresi dolmamış askı: `403 ACCOUNT_SUSPENDED`.
- İşlem oluşturma engeli: `403 TRANSFERS_BLOCKED`.
- Geçersiz admin girdisi: `400 VALIDATION_ERROR`.
- Mutasyonlar CSRF kaynak/özel başlık korumasından geçer.
- Audit kaydı; aktör, eylem, hedef, gerekçe ve eski/yeni değerleri tutar; dosya içeriği veya anahtar tutmaz.

## Arayüz

`/admin` altında tek bir responsive kabuk kullanılır. Sol menü geniş ekranda sabit, dar ekranda yatay/katlanabilir yapıdadır. Mevcut kırık beyaz, mercan vurgu ve koyu metin dili korunur. Her ekran loading, error, empty ve yetkisiz durumlarını açıkça gösterir.

## Test Stratejisi

- RBAC ve hesap kısıtları saf fonksiyon testleri.
- Admin API için Supertest ile 401/403/başarı/audit atomikliği sözleşmeleri.
- Repository SQL parametreleri ve migration şeması testleri.
- Route, admin erişim kapısı ve kritik kullanıcı işlemleri için Testing Library testleri.
- Son kapıda tüm `npm test`, `npm run lint`, `npm run build` komutları ve gerçek tarayıcıda admin sayfası kontrolü.

## Kapsam Dışı

MVP'de plan yönetimi, bildirim merkezi, feature flags, impersonation, otomatik risk skoru, IP blacklist ve gerçek zamanlı log akışı yoktur.
