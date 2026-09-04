# Üç Yöntem Yayın Kabul Formu

Yayın durumu: **BEKLEMEDE**

Gerçek cihaz matrisleri tamamlanmadan Yakındaki Cihazlar ve Canlı QR 10 MiB kapıları üretimde açılmaz. Otomatik testlerin geçmesi gerekli, fakat tek başına yeterli değildir.

Yakındaki Cihazlar için davet bağlantısı ana akış, kısa kod yedek akıştır. Davet tek kullanımlık ve 5 dakika geçerlidir. Link otomatik katılmaz; alıcı açıkça `Bağlan` der. Dosya mesajlaşma kanalından veya tanıştırma API'sinden geçmez; WebRTC veri kanalı üzerinden doğrudan aktarılır. Aynı ağ/WebRTC bağlantısı kurulamazsa VaultDrop stabil yedek olarak kullanılır. QR Video ve renkli QR aktif ürün yöntemi değildir.

## Ürün yönlendirmesi

| Kullanıcı durumu | Ana yöntem | Güvenli yedek | Otomatik kanıt |
|---|---|---|---|
| Yan yana, kamera var, dosya 10 MiB veya daha küçük | Canlı QR | VaultDrop | QRL2 yönlendirme, %20 kayıp, SHA-256 |
| Aynı Wi-Fi/yerel ağ, iki tarayıcı, tek dosya 100 MiB veya daha küçük | Yakındaki Cihazlar | VaultDrop | WebRTC veri kanalı, oda/ICE yaşam döngüsü, SHA-256 |
| Farklı ağ/şehir veya hassas dosya | VaultDrop | Dosyayı bölme/uygun mevcut kanal | AES-256-GCM, `.vdrop`, anahtar ayrılığı |

## Otomatik kabul kapıları

- [x] QRL1 geriye uyumluluğu korunuyor.
- [x] QRL2 tek ve çoklu kamera çıktısı doğru alıcıya yönleniyor.
- [x] 10 MiB QRL2, 1,5 kat aday ve %20 sembol kaybıyla 30 saniye içinde doğrulanıyor.
- [x] Eksik veya SHA-256 değeri yanlış aktarım dosya indirmesi üretmiyor.
- [x] Yakındaki Cihazlar dosya baytlarını HTTP tanıştırma API'sine göndermiyor.
- [x] ICE adayları teklif/cevap açıklamasından önce uygulanmıyor.
- [x] Veri kanalı açılınca sinyalleşme odası kapatılıyor; veri kanalı açık kalıyor.
- [x] Süresi dolan oda ve bağlantı mesajları düzenli temizleniyor.
- [x] Aktif ürün kaydında yalnız Canlı QR, Yakındaki Cihazlar ve VaultDrop var.

## Gerçek cihaz kapıları

- [ ] `docs/live-qr-10mib-manual-test.md` içindeki tüm zorunlu satırlar hedef başarı oranında tamamlandı.
- [ ] `docs/nearby-devices-manual-test.md` içindeki Windows/Edge, Windows/macOS ve macOS/Safari satırları tamamlandı.
- [ ] Misafir Wi-Fi, kurumsal ağ ve bağlantı kesilmesi negatif senaryoları doğrulandı.
- [ ] Mobilde kamera izni, ekran döndürme, arka plana alma ve indirme düğmesi kontrol edildi.

## Yayın kararı

- `VITE_ENABLE_NEARBY=true`: **HAYIR — gerçek cihaz matrisi bekleniyor**
- Üretim ortamı: `VITE_ENABLE_NEARBY=false`
- `VITE_ENABLE_LIVE_QR_10MIB=true`: **HAYIR — gerçek cihaz matrisi bekleniyor**
- `VITE_ENABLE_LIVE_QR_FAST=true`: **HAYIR — ayrı hız profili kabulü yok**
- VaultDrop: **Mevcut otomatik güvenlik ve uyumluluk testleriyle ana stabil yöntem**
- Yakındaki Cihazlar yedeği: **VaultDrop stabil yedek**

Gerçek cihaz sonuçları forma işlendiğinde tarih, tarayıcı sürümü, süre, SHA-256 sonucu ve onaylayan kişi eklenerek bu karar güncellenir.
