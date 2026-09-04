# Üç Kanallı Tarayıcı Dosya Aktarımı Tasarımı

**Tarih:** 13 Ağustos 2026  
**Durum:** Kullanıcı yönü onaylandı; uygulama planı öncesi son inceleme  
**Ürün yöntemleri:** Canlı QR, Yakındaki Cihazlar, VaultDrop

## 1. Amaç

BelgeAktar'ı masaüstü uygulaması gerektirmeden, üç gerçek kullanım durumunu doğru araçla çözen bir tarayıcı ürününe dönüştürmek:

1. **Canlı QR:** Yan yana bulunan, en az birinde kamera olan cihazlar arasında optik aktarım.
2. **Yakındaki Cihazlar:** Aynı Wi-Fi veya yerel ağdaki iki bilgisayar arasında doğrudan tarayıcıdan tarayıcıya aktarım.
3. **VaultDrop:** Farklı konum ve ağlardaki cihazlar arasında şifreli `.vdrop` paketiyle aktarım.

QR Video ve renkli QR aktif ürün yöntemi olmayacaktır. Masaüstü uygulaması geliştirilmeyecektir.

## 2. Kullanıcıya Sunulacak Karar

Gönderim ekranı kullanıcıya teknik terim sormak yerine **“Alıcı nerede?”** sorusunu sorar:

- **Yanımda, kamerasıyla okutacak** → Canlı QR
- **Aynı Wi-Fi'da / aynı ofiste** → Yakındaki Cihazlar
- **Uzakta / farklı ağda** → VaultDrop

Alım ekranında karşılık gelen üç giriş bulunur:

- Kameradan Canlı QR tara
- Yakındaki cihaz kodunu gir
- VaultDrop paketini aç

Her yöntemin kartında tek cümleyle sınırı gösterilir. Kullanıcı dosya seçtikten sonra yöntem uygun değilse işlem başlamadan daha doğru yöntem önerilir.

## 3. Ortak Güvenlik İlkeleri

- Dosya içeriği uygulamanın web veya tanıştırma sunucusuna yüklenmez.
- Canlı QR dışında bütün yöntemlerde aktarım şifreli olmak zorundadır.
- VaultDrop AES-256-GCM ile uygulama seviyesinde şifrelenir.
- Yakındaki Cihazlar WebRTC'nin DTLS şifrelemesini kullanır ve kullanıcıya iki uçta aynı kısa doğrulama ifadesini gösterir.
- Canlı QR ağ kullanmaz fakat şifreli değildir; ekrana bakan başka bir kamera veriyi okuyabilir. Hassas dosyada VaultDrop önerilir.
- Hiçbir dosya SHA-256 doğrulaması tamamlanmadan indirmeye açılmaz.
- Dosya adı ve MIME türü güvenilmeyen veri kabul edilir; indirme adı işletim sistemleri için temizlenir.
- Ham dosya, anahtar, QR payload'ı, WebRTC dosya parçaları ve SHA-256 sunucu günlüklerine yazılmaz.

## 4. Canlı QR: Orta Ölçekli Optik Aktarım

### 4.1. Ürün hedefi

- İlk yayın kullanıcı sınırı: **10 MiB, tek dosya veya tek ZIP**.
- İlk teknik tavan: **25 MiB**; kullanıcıya kapalı deneysel kapı.
- 25 MiB ancak kabul matrisi geçerse kullanıcıya açılır.
- 10 MiB üzerinde test edilmemiş cihazlarda VaultDrop veya Yakındaki Cihazlar önerilir.
- Canlı QR yalnız aynı ortamda, ekran ve kamera arasında çalışır.

### 4.2. Araştırma sonucu

DonanımHaber'in aktardığı Decimen Optical Transfer projesinin güncel kayıtları şunları göstermektedir:

- Masaüstü → güçlü telefon, 4 QR: 1 MiB / 2,45 saniye, 418,5 KiB/s.
- Telefon → telefon, 2 QR: 1 MiB / 5,14 saniye, 199,2 KiB/s.
- Her iki kayıtta kamera 60 FPS ve dört decode worker kullanılmıştır.
- Hızlı profilde QR başına yaklaşık 2.933 bayt ve düşük QR hata düzeltme seviyesi kullanılmıştır.
- Fountain katmanı yaklaşık yüzde 15–30 ek farklı kareyle aktarımı tamamlamıştır.
- Proje 64 MB kabul etse de yayımlanmış rekor kayıtları 1 MiB yük üzerindedir; 64 MB ürün güvencesi olarak alınmayacaktır.

Kaynaklar:

- https://www.donanimhaber.com/qr-kodlarla-internetsiz-dosya-aktarimi-yontemi-gelistirildi--208778
- https://github.com/bashalarmistalt/decimen-optical-transfer/
- https://github.com/bashalarmistalt/decimen-optical-transfer/blob/main/benchmarks/runs/2026-08-09T04-12-41-run.json
- https://github.com/bashalarmistalt/decimen-optical-transfer/blob/main/benchmarks/runs/2026-08-09T04-49-39-run.json

Decimen'in güncel sürümü AGPL-3.0-or-later lisanslıdır. Kaynak kod kopyalanmayacak; ölçüm, protokol yaklaşımı ve tarayıcı davranışları bağımsız uygulamamız için araştırma girdisi olacaktır.

### 4.3. Gönderici hazırlama kuyruğu

Mevcut oynatıcı her grubu gösterim sırasında hazırlamaktadır. Yeni oynatıcı sınırlı bir halka kuyruk kullanacaktır:

- Ekrandaki grup dışında sonraki **3 tam QR grubu** hazır tutulur.
- Her grup, aynı zaman adımına ait 1–4 QR rasterini birlikte taşır.
- Worker havuzu cihazın çekirdek sayısına göre 2–4 worker kullanır.
- Sunum saati hazır grubu sabit ritimle gösterir; geçmiş gecikmeyi telafi etmek için kareleri sıfır beklemeyle art arda göstermez.
- Kuyruk boşalırsa beyaz veya yarım kare göstermek yerine son geçerli grup kısa süre tekrar edilir.
- Worker hızı normale döndüğünde yeni sembol grubuyla devam edilir.
- Duraklatma, dosya değişimi ve sayfadan ayrılma kuyruktaki rasterleri, workerları ve zamanlayıcıları temizler.
- Kuyruk dinamik olarak büyümez; bellek kullanımı öngörülebilir kalır.

Bu kuyruk kamera kapasitesini artırmaz. Amacı QR değişimleri arasındaki boşluğu kaldırmak, hedef FPS'i sabitlemek ve gönderici PC kaynaklı kare kaybını azaltmaktır.

### 4.4. Gönderim profilleri

Üç profil bulunur:

| Profil | QR sayısı | Hedef FPS | Aday payload | Kullanım |
|---|---:|---:|---:|---|
| Uyumlu | 1 | 24 | 1.000 bayt | Küçük ekran, uzak kamera, zayıf cihaz |
| Dengeli | 2 | 30 | 1.465 bayta kadar | Varsayılan telefon/PC kullanımı |
| Hızlı | 4 | 60'a kadar | 2.933 bayta kadar | Büyük ekran, 120 Hz gönderici, güçlü 60 FPS kamera |

Bu değerler doğrudan yayın sabiti değildir; QR kapasite testi ve gerçek cihaz matrisiyle doğrulanır. Güvenli hücre boyutu sağlanmıyorsa QR sayısı veya payload otomatik düşer.

- Varsayılan profil **Dengeli** olur.
- Hızlı profil yalnız ekran geometrisi ve yenileme hızı uygunsa etkinleşir.
- Tek yönlü optik aktarımda gönderici alıcının kamera gücünü bilemez; bu nedenle sahte bir tam otomatik hız iddiası yapılmaz.
- Alıcı ilerlemiyorsa arayüz “Uyumlu moda geç” önerisi verir.
- Tam ekran gösterim, ekranı uyanık tutma ve parlaklık yönlendirmesi sunulur.

### 4.5. Fountain protokolü

- Semboller sıradan bağımsız ve kendini tanımlayan biçimde gönderilir.
- Sistematik ilk sembollerin ardından sağlam soliton dağılımlı onarım sembolleri akar.
- Dağılım hesabı V8 ve JavaScriptCore arasında bit düzeyinde aynı sonucu üretmelidir; platforma göre değişebilen kayan nokta sonuçlarına güvenilmez.
- Alıcı yaklaşık `K × 1,15` farklı sembol hedefiyle ilerler; yüzde kesinliği gerçek çözülmüş kaynak bloklarından alınır.
- Yinelenen, CRC'si bozuk, farklı aktarım kimlikli veya metadata'sı uyuşmayan sembol belleğe alınmaz.
- Çözüm yoğun tam matris yerine peeling ağırlıklı çalışır; küçük artık için sınırlı eliminasyon kullanılabilir.
- En fazla kaynak sembol, farklı sembol ve bellek sınırları dosya boyutundan önce doğrulanır.

### 4.6. Alıcı kamera ve decode hattı

- Kamera `requestVideoFrameCallback` ile gerçek kamera karelerine bağlanır.
- Önce 1280 genişlik ve 60 FPS denenir; gerçek `getSettings()` sonucu okunur.
- 60 FPS sağlanmazsa 30 FPS'e sessiz ve güvenli düşüş yapılır.
- Destekleyen Android kameralarda sürekli odak uygulanır; fener kullanılmaz çünkü ekran yansımasını artırabilir.
- İlk karelerde tam görüntü taranır; QR bölgeleri bulunduktan sonra takip edilen kırpımlar worker havuzuna gönderilir.
- 2–4 decode worker kullanılır. Bütün workerlar doluysa kamera kareleri kuyrukta birikmez; eski kare atılır ve en güncel kare tercih edilir.
- Takip kaybolursa belirli aralıkla tam görüntü taramasına dönülür.
- Aynı kamera karesindeki bütün geçerli QR'lar tek alım oturumuna eklenir.
- Tamamlanma anında kamera, workerlar ve geçici bellek kapatılır.

### 4.7. Canlı QR kabul kapıları

10 MiB yayını için kontrollü ışıkta aşağıdaki kapılar zorunludur:

- Windows/Chrome → Android/Chrome: 5 denemenin 5'i başarılı, her biri en fazla 90 saniye.
- Windows/Chrome → iPhone/Safari: 5 denemenin en az 4'ü başarılı, her biri en fazla 120 saniye.
- macOS/Safari → iPhone/Safari: 5 denemenin en az 4'ü başarılı, her biri en fazla 120 saniye.
- Telefon → telefon Dengeli profil: 5 denemenin en az 4'ü başarılı, en fazla 150 saniye.
- Her başarılı dosyanın adı, MIME türü, byte boyutu ve SHA-256 değeri özgünle aynı olmalıdır.
- Bellek taşması, donan arayüz, yarım indirme veya yanlış başarı bulunmamalıdır.

25 MiB kapısı ayrıca aynı matrisin en az 4/5 başarıyla ve en fazla 180 saniyede tamamlanmasını gerektirir. Kapı geçmezse teknik destek kalsa bile kullanıcı sınırı 10 MiB olarak kalır.

## 5. Yakındaki Cihazlar: Aynı Ağda Tarayıcıdan Tarayıcıya

### 5.1. Sınır

- Masaüstü uygulaması yoktur.
- Dosya içeriği web, tanıştırma veya TURN sunucusuna gönderilmez.
- İlk sürüm yalnız doğrudan WebRTC bağlantısını kullanır; TURN relay kullanılmaz.
- Doğrudan bağlantı 15 saniye içinde kurulamazsa kullanıcı VaultDrop'a yönlendirilir.
- İlk ürün sınırı: tek dosya, en fazla **100 MiB**.
- Büyük dosya ve çoklu dosya desteği gerçek tarayıcı bellek/stream testlerinden sonra genişletilir.

### 5.2. Eşleştirme

1. Gönderici “Yakındaki Cihazlar”ı seçer ve dosyasını belirler.
2. Tanıştırma hizmeti 6 karakterlik, kolay okunur ve tek kullanımlık kod üretir.
3. Kod 3 dakika geçerlidir; belirsiz `0/O/1/I` karakterleri kullanılmaz.
4. Alıcı aynı siteyi açar, kodu girer ve bağlantı teklifini alır.
5. Tarayıcılar WebRTC offer/answer ve ICE bilgisini tanıştırma hizmeti üzerinden değiştirir.
6. Bağlantı kurulunca sunucudaki oda hemen kapatılır.
7. İki ekranda bağlantı parmak izinden türetilen aynı kısa doğrulama ifadesi gösterilir.
8. Kullanıcılar ifadeyi karşılaştırır; alıcı dosyayı kabul edince aktarım başlar.

### 5.3. Tanıştırma hizmeti

Tanıştırma hizmeti yalnız şunları tutar:

- Tek kullanımlık oda kodu
- HTTPS üzerinden taşınan geçici WebRTC offer/answer ve ICE adayları
- Oluşturulma ve sona erme zamanı
- Oda durumu

Hizmet şunları kabul etmez:

- Dosya adı, MIME türü veya boyutu
- Dosya içeriği veya parçası
- VaultDrop anahtarı
- Canlı QR payload'ı
- Doğrulanmış dosya SHA-256 değeri

Oda kayıtları en geç 3 dakika sonra silinir. Kod denemeleri IP ve oturum bazında sınırlandırılır. Başarılı kod tek alıcı tarafından tüketilir; ikinci katılım reddedilir.

### 5.4. Dosya aktarım protokolü

- `RTCDataChannel` güvenilir ve sıralı çalışır.
- Dosya 32 KiB parçalar hâlinde gönderilir; karşı tarayıcının desteklediği mesaj sınırı aşılmaz.
- Gönderici `bufferedAmount` değerini izler; yüksek su seviyesinde durur, düşük su olayında devam eder.
- İlk kontrol mesajı protokol sürümü, güvenli dosya adı, boyut, MIME ve aktarım kimliği taşır.
- Alıcı kullanıcı onayı vermeden dosya byte'ları gönderilmez.
- Parçalar monoton sıra numarası ve toplam byte sayısıyla doğrulanır.
- Son mesaj SHA-256 özetini taşır; alıcı kendi hesapladığı değerle karşılaştırır.
- Doğrulama geçmeden Blob URL veya indirme düğmesi oluşturulmaz.
- Bağlantı koparsa ilk sürüm dosyayı sunmaz ve yeniden bağlanma/VaultDrop seçeneklerini gösterir. Yarım dosya indirilmez.

### 5.5. WebRTC hata davranışı

- Tarayıcı WebRTC desteklemiyorsa Yakındaki Cihazlar kartı yöntem açıklamasıyla devre dışı kalır.
- Kod yanlış veya süresi dolmuşsa yeni kod istenir.
- Aynı Wi-Fi'da istemci izolasyonu, kurumsal güvenlik duvarı veya tarayıcı politikası bağlantıyı engelleyebilir.
- 15 saniye bağlantı süresi aşılırsa otomatik dosya yükleme veya relay yapılmaz; VaultDrop önerilir.
- Bağlantı durumları kullanıcı dilinde gösterilir: “Kod bekleniyor”, “Cihaz bulundu”, “Bağlantı kuruluyor”, “Alıcı onayı bekleniyor”, “Gönderiliyor”, “Doğrulanıyor”, “Tamamlandı”.

## 6. VaultDrop: Uzak ve Şifreli Aktarım

### 6.1. Gönderici akışı

1. Kullanıcı bir veya birden fazla dosya seçer.
2. Dosyalar yerel worker içinde hazırlanır, uygun türlerde sıkıştırılır ve SHA-256 hesaplanır.
3. Paket AES-256-GCM ile şifrelenir.
4. `vaultdrop-<kimlik>.vdrop` dosyası indirilir.
5. Kullanıcı paketi e-posta, mesajlaşma, USB veya mevcut başka bir yöntemle gönderir.
6. Anahtar aynı mesajda değil, ayrı bir kanalda gönderilir.

### 6.2. Alıcı akışı

1. Alıcı `.vdrop` veya eski `.bta` dosyasını seçer.
2. Ayrı gelen anahtarı girer.
3. AES-GCM, metadata sınırları, saklanan/orijinal boyut ve SHA-256 doğrulanır.
4. Başarılıysa güvenli dosya adıyla indirme açılır.
5. Çoklu paket ZIP ise ZIP olarak indirilir; arşiv içi güvenli adlar korunur.

### 6.3. Platform uyumluluğu

- Windows → Windows
- Windows → macOS
- macOS → Windows
- macOS → macOS
- iPhone/Android → PC
- PC → iPhone/Android

Paket biçimi işletim sisteminden bağımsızdır. `.vdrop` içeriği tarayıcı Web Crypto ve mevcut BTA2 kapsayıcısıyla çalışır; uzantı yalnız kullanıcı sözleşmesidir.

## 7. Yöntemler Arası Yönlendirme

| Durum | Birincil yöntem | Yedek yöntem |
|---|---|---|
| Yan yana, kamera var, ≤10 MiB | Canlı QR | VaultDrop |
| Aynı Wi-Fi, iki PC, ≤100 MiB | Yakındaki Cihazlar | VaultDrop |
| Farklı ağ/şehir | VaultDrop | Yok; mevcut taşıma kanalı değiştirilir |
| Hassas dosya | VaultDrop | Yakındaki Cihazlar, doğrulama ifadesi kontrol edilerek |
| Canlı QR cihaz testi başarısız | VaultDrop | Yakındaki Cihazlar, aynı ağdaysa |
| WebRTC doğrudan bağlanamadı | VaultDrop | — |

Kullanıcı seçtiği yöntemi değiştirebilir. Otomatik yönlendirme hiçbir zaman seçilmiş dosyayı sunucuya yüklemez.

## 8. Arayüz Tasarımı

Gönder ekranındaki üç kart:

- **Canlı QR** — “Yanındaki telefona kamerayla gönder.”
- **Yakındaki Cihazlar** — “Aynı Wi-Fi'daki bilgisayara doğrudan gönder.”
- **VaultDrop** — “Uzak cihaza şifreli paket gönder.”

Al ekranındaki üç kart:

- **Kameradan tara**
- **Yakındaki cihaz kodunu gir**
- **VaultDrop paketini aç**

Bir işlem başlatıldıktan sonra diğer yöntemlerin ağır bileşenleri yüklenmez. Kamera, WebRTC ve paket workerları ayrı yaşam döngülerine sahiptir.

## 9. Modül Sınırları

### Canlı QR

- `live-qr/prefetch-player`: sınırlı hazır grup kuyruğu ve sunum saati
- `live-qr/profile-policy`: ekran ve kullanıcı tercihinden güvenli profil seçimi
- `live-qr/fountain`: bağımsız, deterministik encoder/decoder
- `live-qr/scan-pipeline`: kamera, bölge takibi ve worker yönetimi
- `SendPanel` / `ReceivePanel`: yalnız kullanıcı durumu ve yaşam döngüsü

### Yakındaki Cihazlar

- `nearby/signaling-client`: kısa kod odası ve geçici mesaj değişimi
- `nearby/peer-session`: WebRTC bağlantı yaşam döngüsü
- `nearby/file-protocol`: metadata, onay, parça, bitiş ve hata mesajları
- `nearby/send-controller`: backpressure ve SHA
- `nearby/receive-controller`: parça toplama, SHA ve indirme
- `NearbyTransferPanel`: kullanıcı akışı
- Sunucu `nearby-signaling`: TTL, tek kullanımlık oda ve rate limit

### VaultDrop

- Mevcut `SecurePackagePanel`, worker, BTA2 kapsayıcı ve güvenli dosya adı sınırları korunur.

## 10. Uygulama Sırası

Bu kapsam tek uygulama planına sıkıştırılmayacaktır. Üç bağımsız plan hazırlanacaktır:

1. **Canlı QR 10 MiB ve hazır kare kuyruğu**
2. **Yakındaki Cihazlar WebRTC doğrudan aktarım**
3. **Üç yöntemli ürün yönlendirmesi, VaultDrop entegrasyonu ve kabul matrisi**

Sıra şu şekilde olacaktır:

- Önce Canlı QR motoru ölçülebilir ve stabil hâle getirilir.
- Sonra Yakındaki Cihazlar protokolü ve tanıştırma hizmeti bağımsız test edilir.
- En son üç yöntem ana arayüzde birleştirilir ve uçtan uca cihaz matrisi çalıştırılır.

## 11. Test Stratejisi

### Otomatik testler

- Hazır QR kuyruğunun sıra, iptal, tekrar ve bellek sınırları
- Fountain yüzde 15–30 kayıp, sıra dışı, tekrar ve platform determinismi
- 1/2/4 QR render → gerçek decode turu
- Kamera worker havuzunda dolu kuyruk yerine güncel kare tercihi
- WebRTC protokolünde doğru sıra, backpressure, alıcı onayı ve SHA
- Süresi dolan/ikinci kez kullanılan/kaba kuvvet denenen oda kodları
- Tanıştırma API'sinin dosya byte'ı ve metadata kabul etmemesi
- WebRTC bağlantı hatasında VaultDrop yönlendirmesi
- VaultDrop BTA1/BTA2 geriye uyumluluğu
- Yeni dosya, iptal, sayfadan ayrılma ve geç sonuç yarışları
- Hiçbir yöntemde doğrulama öncesi indirme oluşmaması

### Manuel cihaz matrisi

- Windows Chrome/Edge
- macOS Safari/Chrome
- Android Chrome
- iPhone Safari
- 60 Hz ve 120 Hz gönderici ekranları
- 30 FPS ve 60 FPS kamera yolları
- Normal ve düşük ışık
- Aynı Wi-Fi ev yönlendiricisi ve istemci izolasyonlu kurumsal ağ
- Windows/macOS çapraz VaultDrop açma

Her testte dosya adı, MIME, byte sayısı, SHA-256, süre, başarı/deneme sayısı ve kullanılan profil kaydedilir.

## 12. Yayın ve Geri Dönüş Kuralları

- Canlı QR 10 MiB kabul kapısını geçmezse sınır mevcut güvenli değere döner; VaultDrop etkilenmez.
- Hızlı Canlı QR profili ayrı özellik anahtarıyla kapatılabilir; Dengeli/Uyumlu profil çalışmaya devam eder.
- Yakındaki Cihazlar sinyal hizmeti veya WebRTC problemi yaşarsa kart geçici olarak devre dışı bırakılır; VaultDrop ana uzak/yerel yedek olarak kalır.
- TURN relay sonradan eklenirse “dosya sunucudan geçmez” ürün sözü yeniden değerlendirilmeden açılmaz.
- Protokoller sürümlü olur; bilinmeyen sürüm güvenli hata verir.
- QR Video veya renkli QR bu planla geri getirilmez.
