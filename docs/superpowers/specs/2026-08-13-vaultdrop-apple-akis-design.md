# VaultDrop Apple Esintili Aktarım Akışı Tasarımı

## Amaç

Aktarım ekranını daha sakin, öngörülebilir ve telefonda kolay kullanılabilir hâle getirmek. Kullanıcı teknik yöntem adlarını ezberlemeden önce alıcının durumunu seçer; uygulama güvenilir yöntemi öne çıkarır.

## Kararlar

### Gönderim seçimi

Gönder sekmesi iki ana seçeneği gösterir:

1. **Uzakta / farklı şehirde** — Varsayılan ve `Önerilen` seçenektir. VaultDrop şifreli paketi oluşturur; cihaz ve şehir fark etmez.
2. **Yanında / aynı ortamda** — Canlı QR açılır; iki cihazın aynı yerde olması gerekir.

**QR Video** üçüncü, daha sakin bir seçenek olarak altta görünür. “Özel durum” etiketi taşır; uzak alıcıya QR video dosyasını Belge / Dosya olarak göndermek gerektiğini açıklar. Eski `mobile` yönlendirmesi ana akıştan kaldırılır; şifreli paket zaten bilgisayar ve telefon arasında çalışır.

### Alım seçimi

Al sekmesi “Elinde ne var?” sorusuyla başlar. VaultDrop paketi, QR video ve canlı QR kamera yolu açık adlarıyla listelenir. Paket varsayılandır.

### Hareket ve görünüm

- Ana aktarım kabuğu tek hafif saydam yüzeydir. İçerikte gereksiz iç içe kart görünümü azaltılır.
- Dokunulan düğme ve kart anında küçük basma tepkisi verir; seçili kart renk ve gölgeyle sakin biçimde belirginleşir.
- Ana sayfadaki aktarım demosu kendi kendine sürekli başlamaz. Kullanıcı “Animasyonu oynat” derse ilerler; durdurabilir ve iki senaryodan birini seçebilir.
- Sürekli dekoratif yüzdürme/bounce animasyonları kaldırılır.
- Hareket, saydamlık ve kontrast tercihleri için ayrı CSS kuralları eklenir.

### Mobil hız

Renkli QR deneme ekranı yalnız o rota açıldığında yüklenir; ana aktarım ekranı bu deneysel aracın kodunu beklemez.

## Kapsam dışı

- Dosya şifreleme, QR üretim hızı, kota ve ağ davranışı değişmez.
- Sürükleyerek açılan yeni bir menü sistemi veya ağır animasyon kütüphanesi eklenmez.
- Renkli QR deneme ekranının işlevsel davranışı değişmez.

## Doğrulama

- Gönder ekranı varsayılan olarak uzak alıcı/VaultDrop paketi yolunu açar.
- Canlı QR ve QR Video hâlâ seçilebilir; QR Video ikincil görünür.
- Ana sayfa demosu kullanıcı başlatmadan ilerlemez; kullanıcı başlattığında ilerler ve durdurulabilir.
- Hedef arayüz testleri, tüm test paketi, lint ve üretim derlemesi çalışır.

> Not: Bu çalışma alanında Git deposu bulunmadığı için doküman veya kod commit edilmez.
