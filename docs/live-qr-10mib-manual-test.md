# Canlı QR 10 MiB Manuel Kabul Formu

Bu form kontrollü ışıkta gerçek cihazlarla doldurulmadan `VITE_ENABLE_LIVE_QR_10MIB=true` üretimde açılmaz.

## Ortak kontrol listesi

- Gönderilen dosya: tek ZIP veya tek dosya, tam 10 MiB.
- Gönderici: Dengeli profil, iki siyah-beyaz QR.
- Ekran parlaklığı yüksek, QR grubu tam ekran.
- Alıcıda gerçek kamera FPS değeri kaydedildi.
- Dosya adı, MIME türü, byte boyutu ve SHA-256 kaynakla aynı.
- SHA tamamlanmadan indirme düğmesi görünmedi.
- Yarım dosya, donan ekran veya yanlış başarı oluşmadı.

## Zorunlu cihaz matrisi

| Gönderici → Alıcı | Hedef | Deneme 1 | Deneme 2 | Deneme 3 | Deneme 4 | Deneme 5 | Sonuç |
|---|---|---|---|---|---|---|---|
| Windows Chrome → Android Chrome | 5/5, her biri ≤90 sn |  |  |  |  |  |  |
| Windows Chrome → iPhone Safari | ≥4/5, her biri ≤120 sn |  |  |  |  |  |  |
| macOS Safari → iPhone Safari | ≥4/5, her biri ≤120 sn |  |  |  |  |  |  |
| Telefon → telefon Dengeli | ≥4/5, her biri ≤150 sn |  |  |  |  |  |  |

Her deneme hücresine `PASS/FAIL · süre · gerçek FPS · SHA eşleşti/eşleşmedi` yazılır.

## Negatif kontroller

| Senaryo | Beklenen | Sonuç |
|---|---|---|
| Kamera 60 FPS'i reddediyor | 30 FPS ile tarama sürer |  |
| Render worker kullanılamıyor | Ana thread yedeğiyle QR akışı sürer |  |
| Hazır kuyruk geçici boşalıyor | Beyaz ekran yerine son geçerli grup görünür |  |
| Farklı aktarım kimliği görülüyor | Kare reddedilir, aktif aktarım bozulmaz |  |
| Paket SHA uyuşmuyor | Dosya indirmeye açılmaz |  |
| Yeni dosya/reset | Eski worker, zamanlayıcı ve hazır rasterler temizlenir |  |

## 25 MiB deneysel kapı

25 MiB bu sürümde kullanıcıya açık değildir. Daha sonra açılması için aynı matrisin her satırında en az 4/5 başarı, en fazla 180 saniye, doğru SHA ve kabul edilebilir bellek kullanımı zorunludur.
