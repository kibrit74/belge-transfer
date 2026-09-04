# Canlı QR cihaz kabul formu

Bu form, sürüm yayınlanmadan önce kontrollü iç mekân ışığında doldurulur. Her denemede dosya adı, MIME türü ve SHA-256 özeti gönderenle alıcı arasında karşılaştırılır. Düşük ışık sonucu gözlemdir; yayın kararını tek başına değiştirmez.

| Yön | Dosya | Deneme | Gerekli başarı | Süre hedefi | QR sayısı | Not |
|---|---:|---:|---|---:|---:|---|
| Masaüstü → Android | 100 KiB | 1–5 | 5/5 |  |  |  |
| Masaüstü → iPhone Safari | 1 MiB ZIP | 1–5 | 5/5 | Ortanca ≤ 60 sn |  |  |
| Android → Android | 1 MiB ZIP | 1–5 | 5/5 | Ortanca ≤ 90 sn |  |  |
| iPhone → Android | 1 MiB ZIP | 1–5 | 5/5 | Ortanca ≤ 90 sn |  |  |

## Yayın kapısı

- Tablodaki zorunlu satırlardan biri geçmezse kullanıcıya gösterilen Canlı QR sınırı **512 KiB** yapılır.
- 1 MiB için pazarlama hızı, bu form gerçek cihazlarda dolmadan yazılmaz.
- Kamera odağı, ekran parlaklığı, mesafe ve yansıma her denemede not edilir.
- Büyük, çoklu veya uzaktaki dosyalar için sonuç ne olursa olsun VaultDrop önerilir.
