# Üç Kanal Yayın Engelleri Düzeltme Uygulama Planı

> **Codex notu:** Bu plan, görevler sırayla uygulanırken test odaklı geliştirme ve her aşamada doğrulama gerektirir.

**Amaç:** Canlı QR, Yakındaki Cihazlar ve VaultDrop yöntemlerini üretime uygun biçimde birbirinden ayırmak; Canlı QR QRL2 alım kopukluğunu ve Yakındaki Cihazlar yaşam döngüsü açıklarını kapatmak; 10 MiB sınırını yalnız gerçek otomatik ve manuel kabul kanıtlarıyla açılabilir hâle getirmek.

**Yaklaşım:** Mevcut protokolleri yeniden yazmak yerine kopuk entegrasyon noktaları düzeltilecek. Canlı QR'da QRL1 geriye uyumluluğu korunurken QRL2 doğru alıcı oturumuna yönlendirilecek. Yakındaki Cihazlar'da WebRTC veri kanalı korunacak; yalnız sinyalleşme sıralaması, oda kapatma ve süresi dolan kayıtların temizliği sağlamlaştırılacak. VaultDrop davranışı değiştirilmeden üç yöntemin yönlendirme ve güvenlik sözleşmeleri birlikte test edilecek.

**Teknolojiler:** React, Vitest, Web Worker, WebRTC DataChannel, Node.js sunucu katmanı, PostgreSQL/bellek deposu.

**Çalışma alanı notu:** Bu klasörde Git deposu bulunmadığı için commit adımları yoktur. Her görev test çıktısı ve görev raporuyla kontrol noktası oluşturur.

---

## Görev 1: Canlı QR QRL2 alıcı kopukluğunu kapat

**Dosyalar:**
- Değiştir: `src/ReceivePanel.jsx`
- Değiştir: `src/live-qr/receive-session.js`
- Değiştir veya ekle: `src/__tests__/live-qr-multi-ui.test.jsx`
- Değiştir: `src/__tests__/live-qr-receive-session.test.js`

1. QRL2 tek kare ve çoklu tarama metinlerinin Canlı QR istemcisine yönlendirildiğini gösteren iki test yaz.
2. Geçerli 2 MiB ve üst sınıra yakın QRL2 meta verisinin `invalid-frame` ile reddedildiğini gösteren oturum testi yaz.
3. Testleri çalıştır ve eski davranışta beklenen RED sonucunu kaydet.
4. `ReceivePanel` içinde QRL1/QRL2 ayrımını tek yardımcı üzerinden yap; eski standart QR ayrıştırıcısını yalnız canlı protokol olmayan metinlerde kullan.
5. Alıcı oturumunda QRL1 için eski, QRL2 için güncel kaynak sayısı ve blok boyutu sınırlarını kullan.
6. Dar testleri tekrar çalıştır; QRL1 geriye uyumluluğunu da doğrula.

## Görev 2: 10 MiB otomatik yayın kapısını gerçekçi hâle getir

**Dosyalar:**
- Ekle: `src/__tests__/live-qr-10mib-performance.test.js`
- Değiştir: `src/__tests__/live-qr-qrl2-render-scan-roundtrip.test.js`
- Gerekirse değiştir: `src/live-qr/fountain.js`
- Gerekirse değiştir: `src/live-qr/layout.js`

1. 10 MiB QRL2 paketini, 1,5 kat aday sembolü ve her beşinci sembol kaybını kullanan bağlayıcı performans testi yaz.
2. Hash eşleşmesi, tamamlanma ve 30 saniye üst sınırını test et; önce RED/GREEN durumunu ölç.
3. Bir, iki ve dört QR düzeninde sessiz alan dahil gerçek piksel hücre sınırını test et.
4. Testler kırılırsa yalnız kök nedeni düzelten küçük motor veya yerleşim değişikliğini uygula.
5. 1 MiB ve 5 MiB regresyonlarını birlikte çalıştır.

## Görev 3: Yakındaki Cihazlar bağlantı sırasını ve yaşam döngüsünü sağlamlaştır

**Dosyalar:**
- Değiştir: `src/nearby/peer-session.js`
- Değiştir: `src/__tests__/nearby-peer-session.test.js`
- Gerekirse değiştir: `src/nearby/signaling-client.js`

1. Teklif yayınlanmadan ICE adayının gelmesi ve uzak bağlantı açıklaması kurulmadan aday alınması yarışlarını testle üret.
2. Veri kanalı açılınca sinyalleşme sorgulamasının durduğunu ve odanın kapatıldığını, veri kanalının ise açık kaldığını test et.
3. Eski uygulamada beklenen RED sonucunu al.
4. Uzak açıklama hazır olana kadar ICE adaylarını kuyrukta tut; sonra sırayla uygula.
5. Kanal açıldığında yalnız sinyalleşme yaşam döngüsünü bitir; dosya veri kanalını kapatma.
6. Gönderme, alma, iptal ve hata regresyonlarını çalıştır.

## Görev 4: Süresi dolan Yakındaki Cihazlar odalarını gerçekten temizle

**Dosyalar:**
- Ekle: `server/nearby-cleanup.js`
- Değiştir: `server/index.js`
- Ekle: `server/__tests__/nearby-cleanup.test.js`
- Değiştir: `server/__tests__/repositories.test.js` veya ilgili depo testi

1. Başlangıçta ve düzenli aralıkla `deleteExpiredNearbyRooms` çağrılmasını sahte zamanlayıcıyla test et.
2. Zamanlayıcı durdurulduğunda yeni çağrı yapılmadığını test et.
3. Eski sunucuda temizleyici bulunmadığı için RED sonucunu al.
4. Sunucudan bağımsız, küçük ve test edilebilir temizleme zamanlayıcısı ekle.
5. Sunucu açılış/kapanışına bağla; temizleme hatasının sunucuyu düşürmemesini sağla.
6. Bellek ve PostgreSQL depo davranışlarını mümkün olan ölçüde doğrula; gerçek PostgreSQL yoksa bunu açıkça raporla.

## Görev 5: Üç yöntem kabul sözleşmesini ve belgeleri tamamla

**Dosyalar:**
- Ekle: `src/__tests__/three-method-routing.test.jsx`
- Ekle: `src/__tests__/three-method-security-contract.test.jsx`
- Ekle: `docs/three-method-acceptance-test.md`
- Değiştir: `docs/live-qr-10mib-manual-test.md`
- Değiştir: `docs/nearby-devices-manual-test.md`
- Değiştir: `.env.example`
- Değiştir: ilgili README/özellik bayrağı belgeleri

1. Yan yana cihazın Canlı QR'a, aynı ağdaki iki tarayıcının Yakındaki Cihazlar'a, uzak aktarımın VaultDrop'a yönlendirildiğini test et.
2. VaultDrop dışında HTTP üzerinden dosya baytı gönderilmediğini ve Yakındaki Cihazlar sinyalleşmesinde yalnız bağlantı verisi bulunduğunu test et.
3. Özellik bayrağı adındaki `VITE_ENABLE_LIVE_QR_10MIB` yazımını tüm belgelerde eşitle.
4. `.env.example` içine güvenli varsayılanları ekle; deneysel yöntemler varsayılan kapalı kalsın.
5. Manuel formları sahte başarıyla doldurma; cihaz testi gereken satırları açık bırak ve yayın ön koşulu olarak işaretle.
6. Eski QR Video/renkli QR'ın etkin ürün yönlendirmelerinde bulunmadığını doğrula.

## Görev 6: Yayın öncesi doğrulama

1. Görev bazlı tüm hedef testleri çalıştır.
2. Tam test takımını çalıştır; atlanan testleri ve nedenlerini kaydet.
3. Kod kalitesi ve üretim derlemesini çalıştır.
4. Ürün kodunda kalan QRL1/QRL2, özellik bayrağı ve eski yöntem metinlerini tarayıp sınıflandır.
5. Son incelemede kritik/önemli bulgu kalırsa yayın onayı verme; düzeltip testleri yeniden çalıştır.
6. Sonuç raporunda otomatik olarak kanıtlananlarla gerçek cihazda hâlâ denenmesi gerekenleri ayrı yaz.
