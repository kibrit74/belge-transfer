# VaultDrop Landing Page ve Transfer Arayüzü Tasarımı

## Amaç

Mevcut belge aktarım işlevlerini koruyarak uygulamayı VaultDrop markası altında üç sayfalı bir yapıya dönüştürmek:

- `/`: Tanıtım ve ürün anlatımı içeren landing page.
- `/transfer`: Mevcut Gönder/Al uygulamasının yeni görsel sistemle sunulduğu çalışma sayfası.
- `/sss`: Arama ve kategori filtreleri bulunan ayrıntılı SSS sayfası.

Geliştirme sunucusu Vite üzerinden `http://localhost:5173` adresinde çalışacak.

## Teknik Yaklaşım

Üç sabit sayfa için yeni bir yönlendirme paketi eklenmeyecek. Kök uygulama `window.location.pathname` değerine göre ilgili sayfa bileşenini gösterecek. Sayfalar arası geçişlerde normal bağlantılar kullanılacak. Bu çözüm mevcut küçük uygulama için daha az bağımlılık içerir ve daha stabildir.

Sayfa eşleşmeleri:

- `/` → `LandingPage`
- `/transfer` → `TransferPage`
- `/sss` → `FaqPage`
- Bilinmeyen yollar → ana sayfaya dönüş bağlantısı içeren sade bir bulunamadı görünümü

## Ortak Görsel Sistem

Tüm sayfalar aynı tasarım değişkenlerini kullanacak:

- Arka plan: `#FBFAF7`
- Yüzey: `#FFFFFF`
- Ana metin: `#171717`
- İkincil metin: `#6F6F6F`
- Vurgu: `#FF493D`
- Açık çerçeve: `#DDD7D0`
- Koyu yüzey: `#171717`
- Köşe yapısı: kartlarda 18–28 px, butonlarda kapsül biçimi
- Yazı ailesi: önce `Inter`, ardından sistem sans-serif yazı tipleri

Başlıklar kalın, sıkı harf aralıklı ve yüksek kontrastlı olacak. Açıklamalar daha küçük, rahat satır aralıklı ve gri renkte gösterilecek.

VaultDrop logosu `public/brand/vaultdrop-mark.png` dosyasından kullanılacak. Navigasyon, transfer sayfası ve footer aynı logo/kelime işaretini paylaşacak.

## Landing Page

Landing page şu bölümleri içerecek:

1. Sabit ve kaydırmada küçülen navigasyon.
2. Ana değer önerisi, CTA butonları ve ürün arayüzü mockup’ı bulunan hero.
3. Güven göstergeleri.
4. Aynı alanda sırayla çalışan Canlı QR ve Şifreli Paket demoları.
5. Üç adımlı kullanım anlatımı.
6. Desteklenen dosya türleri.
7. Güvenlik ve ürün özellikleri.
8. Kullanım senaryoları.
9. Kısa SSS alanı.
10. Ayrıntılı footer ve `/transfer` CTA bağlantıları.

Desteklenen dosya türleri alanı PDF, Word, Excel, PowerPoint, görsel, arşiv, metin, UYAP UDF ve diğer dosyaları gösterecek. Metin, bu örneklerin sınırlayıcı olmadığını ve genel sınırın 50 MiB olduğunu açıkça belirtecek.

## Hareket ve Etkileşim

- Sayfa içi bağlantılarda yumuşak kaydırma.
- Hero metni ve mockup için yumuşak giriş.
- Bölüm ve kartlarda görünür alana girdikçe aşağıdan belirme.
- Navigasyonun kaydırmada küçülüp kapsül biçimine geçmesi.
- Kaydırmada beliren hızlı erişim kapsülü.
- Sol tarafta Canlı QR demosuna götüren hareketli öğe.
- Sağ altta yukarı çıkma düğmesi.
- Menü, kart ve butonlarda hafif hover hareketleri.
- Canlı QR ve Şifreli Paket demoları aynı alanda yumuşak çapraz geçişle sırayla oynatılacak.

`prefers-reduced-motion: reduce` etkin olduğunda hareketler kapanacak; içerik opaklığı sıfırda kalmayacak. Canlı QR mockup’ı statik olarak görünür olacak.

## Transfer Sayfası

Mevcut aktarım mantığı ve bileşen davranışları korunacak. Yalnızca sayfa kabuğu ve görsel stiller değiştirilecek.

- Üst alanda VaultDrop logosu, “Ana sayfa” bağlantısı ve kısa güven açıklaması.
- Gönder/Al seçimi açık yüzey üzerinde kapsül sekmelerle sunulacak.
- Yöntem kartları beyaz zemin, açık çerçeve ve mercan vurgu kullanacak.
- Dosya bırakma alanları daha geniş, açıklayıcı ve yüksek kontrastlı olacak.
- İlerleme, durum, hata ve başarı mesajları yeni renk değişkenlerini kullanacak.
- Kamera, QR, şifreli paket ve video akışlarının işlevsel koduna dokunulmayacak.
- Mobil görünüm tek sütunlu olacak; dokunma hedefleri en az 44 px tutulacak.

## SSS Sayfası

`/sss` sayfası şu özelliklere sahip olacak:

- VaultDrop başlığı ve ana sayfaya dönüş bağlantısı.
- Sorularda anlık arama.
- Genel, Güvenlik, Kullanım ve Teknik kategori filtreleri.
- Açılır-kapanır soru kartları.
- Sonuç bulunamadığında açıklayıcı boş durum.
- Transfer sayfasına CTA.

## Veri ve Durum Akışı

Landing page ve SSS içerikleri yerel sabit veri dizilerinden üretilecek. Ağ isteği yapılmayacak. Transfer sayfası mevcut React durumunu ve tarayıcı API’lerini kullanmaya devam edecek.

Animasyonlar yalnızca sunum katmanında çalışacak; dosya aktarım durumuna veya şifreleme akışına müdahale etmeyecek.

## Hata ve Sınır Durumları

- JavaScript animasyon desteği olmasa bile tüm içerikler görünür kalacak.
- Hareket azaltma tercihinde mockup kaybolmayacak.
- Bilinmeyen URL yollarında kullanıcı ana sayfaya yönlendirilecek.
- SSS aramasında sonuç yoksa boş durum gösterilecek.
- Logo yüklenemezse VaultDrop yazı işareti görünmeye devam edecek.
- Mevcut dosya boyutu, kamera izni ve şifre çözme hataları korunacak; yalnızca görsel sunumları yenilenecek.

## Test ve Doğrulama

- `/`, `/transfer` ve `/sss` yollarının doğru sayfayı göstermesi.
- Tüm CTA ve navigasyon bağlantılarının doğru hedefe gitmesi.
- UDF kartının ve 50 MiB açıklamasının görünmesi.
- Canlı QR mockup’ının normal ve azaltılmış hareket modunda görünmesi.
- Demo geçişlerinin aynı alanda sırayla çalışması.
- SSS arama, filtreleme ve açılır soru davranışları.
- Mevcut aktarım testlerinin değişmeden geçmesi.
- Mobil ve masaüstü görünüm kontrolleri.
- `npm test`, `npm run lint` ve `npm run build` doğrulaması.

## Kapsam Dışı

- Aktarım protokolünü veya şifreleme biçimini değiştirmek.
- Sunucu, hesap sistemi veya bulut depolama eklemek.
- Yeni bir yönlendirme ya da animasyon paketi eklemek.
- QR Video sınırlarını değiştirmek.
