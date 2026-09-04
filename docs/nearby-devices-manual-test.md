# Yakındaki Cihazlar Gerçek Cihaz Test Formu

Yayın durumu: **BEKLİYOR**

Bu form doldurulmadan özellik üretimde açılmaz. Gerçek cihaz matrisi tamamlanana kadar `VITE_ENABLE_NEARBY=false` kalır ve VaultDrop stabil yedek olarak kullanılır. Otomatik test sonuçları gerçek cihaz kanıtı yerine geçmez.

Davet bağlantısı ana akış, kısa kod yedek akıştır. Davet tek kullanımlık ve 5 dakika geçerlidir. Bağlantıyı açmak otomatik katılmaz; alıcı kodu kontrol edip `Bağlan` düğmesine basar. Dosya mesajlaşma kanalından veya tanıştırma API'sinden geçmez; yalnız WebRTC veri kanalı üzerinden doğrudan aktarılır. Aynı ağda doğrudan WebRTC bağlantısı kurulamazsa VaultDrop kullanılır. QR Video ve renkli QR aktif ürün yöntemi değildir.

Her denemede iki tarayıcı aynı Wi‑Fi veya yerel ağda olmalıdır. Teams, WhatsApp Web ve E-posta yalnız davet bağlantısını taşır; dosya bu kanallara veya tanıştırma API'sine gönderilmez.

## Zorunlu test matrisi

Her satırda gerçek değerleri kaydedin. Oda kurulma süresi en fazla 15 saniye olmalıdır. İfade eşleşmesi iki ekranda görülen ifadenin aynı olup olmadığını, SHA sonucu ise alıcıdaki SHA-256 doğrulamasını belirtir.

| Gönderen → Alıcı | Davet kanalı | Dosya adı | Dosya boyutu | Oda kurulma süresi | İfade eşleşmesi | Aktarım süresi | SHA sonucu | Sonuç |
|---|---|---|---:|---:|---|---:|---|---|
| Windows Chrome → Windows Edge | Teams | — | 1 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → Windows Edge | WhatsApp Web | — | 1 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → Windows Edge | E-posta | — | 1 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → Windows Edge | Teams | — | 25 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → Windows Edge | WhatsApp Web | — | 25 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → Windows Edge | E-posta | — | 25 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → Windows Edge | Teams | — | 100 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → Windows Edge | WhatsApp Web | — | 100 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → Windows Edge | E-posta | — | 100 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | Teams | — | 1 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | WhatsApp Web | — | 1 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | E-posta | — | 1 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | Teams | — | 25 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | WhatsApp Web | — | 25 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | E-posta | — | 25 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | Teams | — | 100 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | WhatsApp Web | — | 100 MiB | — | — | — | — | BEKLİYOR |
| Windows Chrome → macOS Safari | E-posta | — | 100 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | Teams | — | 1 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | WhatsApp Web | — | 1 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | E-posta | — | 1 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | Teams | — | 25 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | WhatsApp Web | — | 25 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | E-posta | — | 25 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | Teams | — | 100 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | WhatsApp Web | — | 100 MiB | — | — | — | — | BEKLİYOR |
| macOS Chrome → macOS Safari | E-posta | — | 100 MiB | — | — | — | — | BEKLİYOR |

## Negatif senaryolar

| Senaryo | Beklenen | Oda kurulma süresi | İfade eşleşmesi | Aktarım süresi | Dosya adı | Dosya boyutu | SHA sonucu | Sonuç | Not |
|---|---|---:|---|---:|---|---:|---|---|---|
| Misafir/istemci izolasyonlu Wi‑Fi | 15 saniye sonunda VaultDrop önerisi | — | — | — | — | — | — | BEKLİYOR | — |
| Kurumsal güvenlik duvarı doğrudan bağlantıyı kesiyor | Dosya baytı gitmez, VaultDrop önerilir | — | — | — | — | — | — | BEKLİYOR | — |
| İki ekrandaki ifade farklı | Kullanıcı devam etmez, aktarım başlamaz | — | FARKLI | — | — | — | — | BEKLİYOR | — |
| İkinci alıcı aynı koda girer | İkinci alıcı reddedilir | — | — | — | — | — | — | BEKLİYOR | — |
| Bağlantı ortada kesilir | Eksik dosya için indirme oluşmaz | — | — | — | — | — | — | BEKLİYOR | — |

## Yayın kararı

- Test tarihi: BEKLİYOR
- Tarayıcı sürümleri: BEKLİYOR
- Cihazlar: BEKLİYOR
- Kritik/önemli hata: BEKLİYOR
- `VITE_ENABLE_NEARBY=true` kararı: **HAYIR — matris tamamlanmadı**
- Üretim değeri: `VITE_ENABLE_NEARBY=false`
- Güvenli yedek: VaultDrop
- Onaylayan: BEKLİYOR
