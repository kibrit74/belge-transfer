# Standart QR Video Performans Testi

Bu kontrol, siyah-beyaz `Dengeli` QR Video alıcısının gerçek telefondaki hızını ölçmek içindir. Renkli QR laboratuvarı bu testin kapsamı dışındadır.

## Bağlayıcı gönderici kabulü

2,36 MB sıkıştırılamayan dosyada `QR video oluştur` düğmesine basıldığında kronometreyi başlatın. İndirilebilir video hazır olduğunda süreyi durdurun.

| Cihaz/Tarayıcı | Dosya | Beklenen video | Üretim süresi | SHA-256 | Sonuç |
|---|---:|---:|---:|---|---|
| Orta seviye Android / Chrome — gönderici | 2,36 MB sıkıştırılamayan | Yaklaşık 56 sn | ___ sn üretim | Aynı/Farklı | Geçti/Kaldı |

Gönderici satırının geçme koşulu üretimin 120 saniye veya altında bitmesi, çıkan videonun yaklaşık 56 saniye olması, alıcıdan açılan dosyanın SHA-256 değerinin aynı kalması ve telefonun işlem sırasında kullanılabilir olmasıdır. Fiziksel cihaz sonucu yazılmadan bu hedef doğrulanmış sayılmaz.

## Hazırlık

1. 5 MiB büyüklüğünde sıkıştırılamayan bir dosya seçin.
2. Gönderici cihazda dosya adı, MIME türü, boyutu ve SHA-256 değerini not edin.
3. `Dengeli` profil ile QR Video oluşturun.
4. Videoyu galeriden değil, mesajlaşma uygulamasında **Belge / Dosya** olarak alıcıya gönderin.

## Bağlayıcı Android kabulü

Android Chrome'da videoyu seçin, **QR videoyu tara** düğmesine basın ve süreyi başlatın. Dosya indirilmeye hazır olduğunda süreyi durdurun. Çıktının SHA-256 değeri gönderen dosyayla aynı olmalıdır.

| Cihaz/Tarayıcı | Dosya | Video süresi | Tarama süresi | SHA-256 | Sonuç |
|---|---:|---:|---:|---|---|
| Orta seviye Android / Chrome | 5 MiB sıkıştırılamayan | ___ sn | ___ sn | Aynı/Farklı | Geçti/Kaldı |
| iPhone / Safari | 5 MiB sıkıştırılamayan | ___ sn | ___ sn | Aynı/Farklı | Gözlem |
| Windows / Chrome veya Edge | 5 MiB sıkıştırılamayan | ___ sn | ___ sn | Aynı/Farklı | Regresyon |

Android satırının geçme koşulları:

- Tarama süresi 180 saniye veya altı.
- Çıktının dosya adı, MIME türü ve boyutu aynı.
- SHA-256 aynı.
- Tarayıcı sekmesi kapanmıyor, telefon aşırı ısınmıyor ve işlem sırasında cihaz kullanılabilir kalıyor.

90–150 saniye tercih edilen aralıktır. 180 saniyenin üzerindeki sonuç, bu cihazda QR Video yerine Şifreli Paket yönteminin daha pratik olduğuna işaret eder; uygulama taramayı otomatik durdurmaz.
