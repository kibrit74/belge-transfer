# VaultDrop Aylık Paket Kotaları Tasarımı

## Amaç

Profildeki dosya sayısı göstergesini gerçek aylık veri kullanımına dönüştürmek ve üyelik paketlerini sunucu tarafından izlenen aylık kotalarla ayırmak.

Bu çalışma iki farklı sınırı açıkça ayırır:

- **Aylık paket kotası:** Kullanıcının bir takvim ayında gönderebileceği toplam veri.
- **İşlem başına teknik sınır:** Aktarım yönteminin tarayıcı ve QR üretimi nedeniyle desteklediği dosya sayısı ve boyut.

QR Video için toplam 15 MiB sınırı aylık üyelik kotası değildir ve teknik yöntem sınırı olarak korunur.

## Paketler

| Paket | Aylık gönderim kotası | Veritabanı değeri |
|---|---:|---|
| Standart | 50 MiB | `standard` |
| Plus | 250 MiB | `plus` |
| Kurumsal | 1 GiB | `corporate` |

Mevcut `member` kullanıcıları veri göçü sırasında `standard` paketine taşınır. Misafir kullanıcılar hesap kotasına sahip olmaz; mevcut tek dosya ve 10 MiB kuralı devam eder.

İlk sürümde ödeme ve paket yükseltme ekranı eklenmez. Kullanıcı paketi veritabanından veya daha sonra bağlanacak ödeme sistemi tarafından atanır.

## Kota Dönemi ve Sayım Kuralları

- Dönem UTC takvim ayıdır; ayın ilk günü 00:00 UTC’de başlar ve sonraki ayın ilk günü yenilenir.
- Yalnızca `direction = send` olan gönderimler kotadan düşer.
- Tamamlanan gönderimler ve süresi dolmamış bekleyen rezervasyonlar kota hesabına katılır.
- Alınan dosyalar ve başarısız gönderimler aylık kotadan düşmez.
- Kota devretmez; kullanılmayan miktar sonraki aya aktarılmaz.
- Byte değerleri tam sayı olarak saklanır. Arayüzde MiB/GiB biçiminde gösterilir.

## Teknik Sınırlar

Aylık paket kotası artsa bile mevcut işlem güvenliği korunur:

- Canlı QR: tek dosya.
- Şifreli Paket: en fazla 15 dosya, dosya başına en fazla 50 MiB.
- QR Video: en fazla 15 dosya, toplam en fazla 15 MiB.
- Misafir Şifreli Paket: tek dosya, en fazla 10 MiB.

Örneğin Plus kullanıcısı aylık 250 MiB hakkını tek bir 250 MiB dosyada kullanamaz; Şifreli Paket’in dosya başına 50 MiB teknik sınırına uymalıdır.

## Veri Modeli

Yeni bir `002_monthly_plan_quotas.sql` göçü oluşturulur:

- `users.plan` kontrolü `standard`, `plus`, `corporate` değerlerini kabul edecek şekilde yenilenir.
- Var olan `member` değerleri `standard` olarak değiştirilir.
- `transfer_batches.status` kontrolüne `pending` eklenir.
- Bekleyen rezervasyonların sona ermesini izlemek için `reservation_expires_at TIMESTAMPTZ` eklenir.
- Aylık kullanım sorgusunu hızlandırmak için kullanıcı, yön, durum ve oluşturulma tarihini kapsayan indeks eklenir.

Ayrı bir aylık sayaç tablosu tutulmaz. `transfer_batches` kaynak kayıt olmaya devam eder; böylece sayaç ile işlem geçmişinin birbirinden kopması engellenir.

## Sunucu Akışı

### Profil özeti

`GET /api/profile/summary` mevcut 90 günlük istatistiklere ek olarak şunları döndürür:

```json
{
  "plan": "standard",
  "monthly_used_bytes": 19398656,
  "monthly_limit_bytes": 52428800,
  "monthly_remaining_bytes": 33030144,
  "period_start": "2026-08-01T00:00:00.000Z",
  "period_end": "2026-09-01T00:00:00.000Z"
}
```

`monthly_used_bytes`, tamamlanan gönderimler ile henüz süresi dolmamış rezervasyonları kapsar. Sonuç hiçbir zaman aylık limitin üzerinde gösterilmez.

### Gönderim rezervasyonu

Gönderim başlamadan önce istemci `POST /api/transfers/reservations` çağrısı yapar. İstek yalnızca yöntem, başlangıç zamanı, dosya uzantıları ve byte boyutlarını içerir; dosya adı veya içerik sunucuya gönderilmez.

Sunucu tek bir atomik SQL işlemiyle:

1. Kullanıcının paketini ve aylık limitini belirler.
2. Tamamlanan gönderimler ile aktif rezervasyonların toplamını hesaplar.
3. Yeni aktarım kalan kotaya sığıyorsa `pending` kayıt oluşturur.
4. Sığmıyorsa `409` ve `MONTHLY_QUOTA_EXCEEDED` kodunu döndürür.

Rezervasyon 30 dakika geçerlidir. Bu süre içinde tamamlanmayan kayıt kota hesabından otomatik olarak çıkar; fiziksel silme işlemi daha sonra günlük temizlik göreviyle yapılabilir.

### Tamamlama

Aktarım başarıyla üretildiğinde istemci `PATCH /api/transfers/:id` ile durumu `completed` yapar. İşlem hata verirse `failed` yapılır. Tamamlama isteği yalnızca rezervasyonu oluşturan kullanıcı tarafından değiştirilebilir.

Alım işlemleri aylık kotaya girmediği için mevcut aktivite kaydıyla doğrudan `completed` olarak yazılabilir.

## İstemci Akışı

- Giriş yapmış kullanıcı gönderimi başlattığında önce rezervasyon alınır.
- Kota yetersizse şifreleme veya QR Video üretimi başlamaz.
- Kullanıcıya `Bu aktarım için 12,4 MiB gerekiyor; aylık kotanda 8,1 MiB kaldı.` biçiminde anlaşılır hata gösterilir.
- Rezervasyon ağ hatası nedeniyle alınamazsa ücretli kota atlanmaz; işlem başlatılmaz ve tekrar deneme mesajı gösterilir.
- Misafir akışı sunucu rezervasyonu kullanmaz ve mevcut yerel sınırlarla çalışır.

## Profil Arayüzü

Profildeki koyu limit kartı şu yapıya dönüşür:

- Üst etiket: `AYLIK KULLANIM · STANDART`, `PLUS` veya `KURUMSAL`.
- Ana değer: `18,5 MiB / 50 MiB`.
- Yardımcı metin: `1 Eylül’de yenilenir`.
- Progress bar byte kullanım yüzdesini gösterir.
- `aria-valuenow`, `aria-valuemax` ve `aria-valuetext` byte tabanlı aylık değerleri yansıtır.
- Kota dolduğunda CTA devre dışı görünmek yerine paket yükseltme altyapısı henüz olmadığı için `Yeni aktarım` bağlantısı korunur; transfer ekranı kota hatasını açıkça gösterir.

QR Video’nun 15 MiB teknik sınırı bu karttan çıkarılır. Bu bilgi yalnızca QR Video dosya seçim alanında ve SSS’de yöntem sınırı olarak kalır.

## Paket Tanımları

Paket limitleri hem istemci hem sunucu tarafından kullanılan bağımsız sabitlerde tanımlanır. Sunucu nihai otoritedir. Bilinmeyen veya eski bir paket değeri güvenli varsayılan olarak `standard` kabul edilir; sınırsız kullanım verilmez.

## Hata ve Yarış Durumları

- İki sekme aynı anda gönderim başlatırsa atomik rezervasyon sorgusu toplam kotanın aşılmasını engeller.
- Süresi dolmuş rezervasyonlar aylık kullanıma dahil edilmez.
- Başarısız aktarım `failed` yapılarak kotayı serbest bırakır.
- İstemci tamamlama çağrısını yapamazsa rezervasyon en fazla 30 dakika kotada kalır.
- Profil özeti yüklenemezse yanlış `0 / limit` gösterilmez; kartta `Kullanım bilgisi alınamadı` durumu görünür.

## Testler

- Paket adlarının doğru byte limitlerine eşlendiği birim testleri.
- Eski `member` değerinin `standard` olarak ele alındığı geriye uyumluluk testi.
- Aylık kullanımın yalnız başarılı gönderimler ve aktif rezervasyonlardan hesaplandığı repository testleri.
- Aynı anda yapılan rezervasyonlarda kotanın aşılmadığını doğrulayan API testi.
- Kota aşımında `409` ve güvenli hata gövdesi testi.
- Profil kartında paket adı, byte kullanımı, yenilenme tarihi ve erişilebilir progress bar testi.
- QR Video 15 MiB ve işlem başına 15 dosya sınırlarının değişmediğini doğrulayan mevcut testler.
- Misafir akışının rezervasyon istemediğini doğrulayan test.

## Kapsam Dışı

- Fiyatlandırma ve ödeme alma.
- Kullanıcının kendi paketini yükseltmesi veya düşürmesi.
- Kullanılmayan kotanın sonraki aya devri.
- Yönetim paneli.
- E-posta kota uyarıları.
