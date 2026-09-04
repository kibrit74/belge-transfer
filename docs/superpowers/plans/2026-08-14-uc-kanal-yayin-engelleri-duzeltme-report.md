# Üç Kanal Yayın Engelleri Düzeltme Raporu

Tarih: 14 Ağustos 2026

## Sonuç

Otomatik testlerle kanıtlanabilen kritik ve önemli yayın engelleri kapatıldı. VaultDrop stabil ana yöntem olarak korunuyor. Yakındaki Cihazlar ve Canlı QR 10 MiB özellikleri gerçek cihaz kabul formları tamamlanana kadar üretim örneğinde kapalıdır.

## Uygulanan düzeltmeler

- QRL2 tek ve çoklu kamera sonuçları Canlı QR alıcı worker'ına yönlendirildi.
- QRL1 eski 1 MiB sınırı korunurken QRL2 güncel 10 MiB paket sınırına bağlandı.
- Gerçek 10 MiB paket için 1,5 kat aday, %20 kayıp, SHA-256 ve 30 saniye kapısı eklendi.
- Azami QRL2 metni tek, iki ve dört QR yerleşiminde gerçek QR okuyucuyla doğrulandı.
- Yakındaki Cihazlar yerel/uzak ICE adayları, SDP hazır olana kadar güvenli kuyrukta tutuldu.
- Veri kanalı açıldıktan sonra iki uç `READY/ACK` el sıkışması yapıyor; sinyalleşme sorgusu hemen duruyor ve odayı yalnız host hazır olma kanıtından sonra kapatıyor.
- Geç gelen yinelenmiş `READY/ACK` mesajlarının dosya alıcısını kapatması engellendi.
- Süresi dolan oda ve sinyaller başlangıçta ve düzenli aralıkla temizleniyor; yavaş temizlikler üst üste binmiyor; sunucu kapanınca zamanlayıcı duruyor.
- Eski QRT3 QR Video alım/decrypt ve anahtar arayüzü aktif Canlı QR alıcısından kaldırıldı.
- Gerçek TransferPage yöntem değişiminde önceki ağır panelin kapandığı sınandı.
- Güvenli özellik bayrağı örneği, yanlış bayrak yazımı, README ve üç yöntem kabul belgesi düzeltildi.

## Taze doğrulama

- Geniş hedef paketi: 19 test dosyası, 76/76 test geçti.
- Tam test takımı: 120 test dosyası geçti, 1 dosya atlandı; 766 test geçti, 1 test atlandı.
- Kod kalitesi: çıkış kodu 0; yalnız önceden var olan 8 uyarı.
- Üretim derlemesi: çıkış kodu 0; 380 modül başarıyla derlendi.
- Bağımsız son inceleme: yeni kritik veya önemli bulgu yok.

## Bilinen uyarılar ve manuel kapılar

- Gerçek PostgreSQL entegrasyon testi `TEST_DATABASE_URL` olmadığında atlanır.
- Windows/Android, Windows/iPhone, macOS/iPhone Canlı QR 10 MiB matrisi henüz doldurulmadı.
- Windows/Edge, Windows/macOS ve macOS/Safari Yakındaki Cihazlar matrisi henüz doldurulmadı.
- Misafir Wi-Fi ve kurumsal ağ izolasyonu gerçek cihazlarda ayrıca denenmelidir.
- Lint uyarıları eski renkli QR modülü, kontrol karakteri desenleri ve AuthContext hızlı yenileme düzeniyle ilgilidir; yeni hata yoktur.

## Yayın kararı

- VaultDrop: otomatik tarafta ana stabil yöntem.
- Canlı QR 1 MiB güvenli düşüş: otomatik tarafta hazır; gerçek kamera denemesi önerilir.
- Canlı QR 10 MiB: otomatik motor kapısı geçti, gerçek cihaz formu tamamlanana kadar üretimde kapalı.
- Yakındaki Cihazlar: otomatik bağlantı/güvenlik kapıları geçti, gerçek ağ/cihaz formu tamamlanana kadar üretimde kapalı.
