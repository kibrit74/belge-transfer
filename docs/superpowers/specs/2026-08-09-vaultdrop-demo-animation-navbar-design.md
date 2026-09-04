# VaultDrop Demo Animasyonu ve Transfer Navbar Tasarımı

## Amaç

Landing page içindeki aktarım mockup’larının her tarayıcıda sırayla oynamasını sağlamak ve transfer sayfası navbar’ını landing page ile görsel olarak eşleştirmek.

## Kök Neden

Mevcut demo yalnızca CSS animasyonlarına bağlıdır. Global `prefers-reduced-motion` kuralı animasyon sürelerini `0.01ms` yapar; landing sayfasındaki ek kural da Şifreli Paket sahnesini gizler. Bu durumda kullanıcı yalnızca Canlı QR sahnesinin tek karesini görür.

## Değerlendirilen Yaklaşımlar

1. **Önerilen ve onaylanan: React kontrollü sahne döngüsü.** Sahne ve adım bilgisi React state ile yönetilir. İçerik ilerlemesi tarayıcının CSS animasyon tercihinden bağımsızdır.
2. CSS animasyonlarını `!important` ile zorlamak. Daha az kod gerektirir fakat erişilebilirlik ayarlarıyla çakışır ve kırılgandır.
3. Video veya GIF kullanmak. Tutarlı görünür ancak dosya boyutunu artırır ve mevcut erişilebilir HTML mockup’larını kullanışsız bırakır.

## Demo Davranışı

- Tek mockup sahnesi kullanılır.
- İlk sahne Canlı QR’dır: belge seçimi, QR oluşumu, telefon taraması ve başarı adımları sırayla görünür.
- İkinci sahne Şifreli Paket’tir: belge seçimi, `.bta` oluşturma, aktarım, anahtar girişi ve başarı adımları sırayla görünür.
- Sahne geçişleri yumuşak opacity ve transform efektleriyle yapılır.
- İki sahne tamamlanınca döngü otomatik yeniden başlar.
- Hareket azaltma tercihinde kayma/ölçek geçişleri azaltılır; sahne ve adım değişimleri devam eder. Böylece demo hiçbir zaman tek statik görsele dönüşmez.

## Transfer Navbar

- Landing navbar’ın yükseklik, kenarlık, kapsül, arka plan, logo ve orta menü kuralları paylaşılır.
- Orta menü bağlantıları: Nasıl Çalışır, Özellikler ve SSS. Transfer sayfasından landing bölümlerine `/#demo`, `/#features` ve `/#sss` adresleriyle gider.
- Sağ tarafta “Aktarıma Başla” butonu bulunmaz.
- En sağda erişilebilir etiketi `Ana sayfaya dön` olan dairesel ev ikonu bulunur ve `/` adresine gider.
- Dar ekranda orta menü gizlenir; logo ve ev ikonu görünür kalır.

## Testler

- Demo başlangıçta Canlı QR sahnesini gösterir.
- Zaman ilerleyince Şifreli Paket sahnesine geçer ve döngü yeniden başlar.
- Transfer navbar’ında landing bağlantıları ve ana sayfa ikonu bulunur.
- Transfer navbar’ında “Aktarıma Başla” butonu bulunmaz.
- Mevcut transfer işlevleri ve responsive düzen korunur.

## Kapsam Dışı

Şifreleme, QR protokolü, dosya aktarım işlevleri, landing metinleri ve diğer sayfa içerikleri değiştirilmez.
