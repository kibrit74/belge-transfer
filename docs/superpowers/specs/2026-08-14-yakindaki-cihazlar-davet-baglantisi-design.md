# Yakındaki Cihazlar Davet Bağlantısı Tasarımı

**Tarih:** 14 Ağustos 2026  
**Durum:** Kullanıcı tarafından onaylandı  
**Kapsam:** Tarayıcıdan tarayıcıya Yakındaki Cihazlar eşleştirmesini kısa kodun yanında tek tık davet bağlantısıyla pratikleştirmek.

## 1. Amaç

Aynı Wi-Fi veya yerel ağda bulunan iki bilgisayar arasında dosya aktarırken kullanıcıların altı karakterli kodu sözlü olarak iletmesi ana akış olmayacaktır. Gönderici tek kullanımlık davet bağlantısını mevcut bir iletişim kanalıyla alıcıya yollar. Alıcı bağlantıya tıklar, kod otomatik doldurulur ve yalnız `Bağlan` düğmesine basar.

Dosya içeriği mesajlaşma kanalından veya VaultDrop tanıştırma sunucusundan geçmez. Davet bağlantısı yalnız eşleştirmeyi kolaylaştırır; gerçek dosya aktarımı mevcut WebRTC veri kanalı üzerinden doğrudan devam eder.

## 2. Seçilen yaklaşım

Ana yöntem **davet bağlantısı + kısa kod yedeği** olacaktır.

- Birincil işlem: `Bağlantı davetini kopyala`
- Tarayıcı destekliyorsa: `Paylaş`
- Yedek yöntem: altı karakterli oda kodu
- Davet: tek kullanımlık ve beş dakika geçerli
- Alıcı: bağlantı açıldığında otomatik katılmaz; `Bağlan` düğmesiyle açık onay verir
- Üyelik: davet oluşturmak veya kullanmak için zorunlu değildir

Yerel ağdaki cihazları otomatik listeleme, tarayıcı gizlilik sınırları, Safari uyumu, misafir Wi-Fi izolasyonu ve kurumsal güvenlik duvarları nedeniyle seçilmemiştir. Yalnız kısa kod yaklaşımı ise fiziksel olarak uzak masalarda yetersiz kullanıcı deneyimi oluşturduğu için yedek olarak tutulmuştur.

## 3. Gönderici kullanıcı akışı

1. Kullanıcı `Gönder → Yakındaki Cihazlar` yöntemini seçer.
2. Tek dosyasını seçer.
3. Sistem sunucudan tek kullanımlık, beş dakikalık oda oluşturur.
4. Arayüzde aşağıdaki öğeler gösterilir:
   - `Bağlantı davetini kopyala`
   - Tarayıcı destekliyorsa `Paylaş`
   - Yedek altı karakterli kod
   - Kalan süre sayacı
   - `Daveti iptal et`
5. Kullanıcı davet bağlantısını Teams, Slack, WhatsApp, e-posta veya başka bir kanaldan yollar.
6. Alıcı bağlandığında göndericide doğrulama ifadesi görünür.
7. İki taraf ifadeyi onayladıktan sonra dosya teklifi gönderilir.
8. Alıcı dosyayı kabul edince aktarım başlar.

Gönderici sayfasında bağlantının tamamı sürekli gösterilmez. Arayüz `Davet hazır` durumunu ve kopyalama/paylaşma işlemlerini sunar. Kısa kod yedek bilgi olarak görünür kalır.

## 4. Alıcı kullanıcı akışı

1. Alıcı davet bağlantısına tıklar.
2. Uygulama `Al → Yakındaki Cihazlar` ekranını açar.
3. Bağlantıdaki oda kodu doğrulanarak alım alanına otomatik yazılır.
4. Uygulama `Yakındaki bir cihaz sana bağlantı daveti gönderdi` açıklamasını gösterir.
5. Bağlantı henüz tüketilmez ve ağ bağlantısı kendiliğinden başlamaz.
6. Alıcı `Bağlan` düğmesine basar.
7. Sunucu daveti bu alıcı için tek seferlik tüketir.
8. WebRTC bağlantısı kurulur ve iki ekranda aynı doğrulama ifadesi gösterilir.
9. Alıcı doğrulama ifadesini onaylar.
10. Dosya adı, türü ve boyutu yalnız doğrudan bağlantı üzerinden alıcıya gösterilir.
11. Alıcı dosyayı kabul eder veya reddeder.
12. Kabul sonrası aktarım, SHA-256 doğrulaması ve indirme gerçekleşir.

## 5. Davet bağlantısı

Davet bağlantısı aşağıdaki mantıksal biçimi kullanır:

```text
/transfer?nearby=ABC234
```

Bağlantı yalnız kullanıcıya gösterilmesi güvenli olan tek kullanımlık oda kodunu içerir. Aşağıdaki değerler bağlantıya yazılmaz:

- Host veya guest oda anahtarı
- Dosya adı
- MIME türü
- Dosya boyutu
- Dosya SHA-256 özeti
- Dosya içeriği
- WebRTC SDP veya ICE bilgileri
- Kullanıcı kimliği veya e-posta adresi

URL parametresi biçim, uzunluk ve izin verilen karakterler açısından doğrulanır. Geçersiz parametre bağlantı işlemi başlatmaz ve kullanıcıya güvenli hata gösterilir.

## 6. Oda yaşam döngüsü

- Oda oluşturulduğunda beş dakika geçerli olur.
- Bağlantının açılması odayı tüketmez.
- Oda yalnız alıcı `Bağlan` dediğinde katılım için kullanılır.
- İlk geçerli alıcıdan sonra ikinci alıcı reddedilir.
- İkinci alıcının denemesi mevcut bağlantıyı bozmaz.
- Gönderici `Daveti iptal et` dediğinde oda hemen kapatılır.
- Süre dolan odalar sunucudaki periyodik temizleyici tarafından silinir.
- WebRTC veri kanalı açıldığında sinyalleşme sorgusu durur.
- İki uç mevcut `READY/ACK` kontrolünü tamamladıktan sonra odayı yalnız host kapatır.
- Sayfa kapanışı, yöntem değişikliği veya yeni dosya seçimi mevcut bağlantıyı ve zamanlayıcıları temizler.

## 7. Güvenlik sınırları

- Dosya içeriği HTTP tanıştırma API'sine gönderilmez.
- WebRTC veri kanalı DTLS ile şifrelenir.
- İki uç aynı doğrulama ifadesini açıkça onaylamadan dosya gönderimi başlamaz.
- Doğrulama ifadeleri farklıysa bağlantı kapatılır.
- Eksik veya SHA-256 değeri yanlış dosya indirmeye açılmaz.
- Davet kodları tahmin denemelerine karşı istek sınırıyla korunur.
- Aynı istemcinin aşırı oda oluşturması sınırlandırılır.
- Davet tek kullanımlıdır ve kısa süre yaşar.
- Üyelik zorunlu değildir; üye işlem geçmişinde yalnız yöntem, yön, toplam boyut ve başarı durumu tutulabilir.
- Dosya adı, dosya içeriği, SHA-256 ve oda anahtarları işlem geçmişine yazılmaz.

## 8. Arayüz durumları

### Gönderici

- Davet hazırlanıyor
- Davet hazır · kalan süre
- Alıcının bağlanması bekleniyor
- Doğrulama bekleniyor
- Dosya onayı bekleniyor
- Aktarılıyor · yüzde
- Dosya teslim edildi
- Davet süresi doldu
- Bağlantı kurulamadı

### Alıcı

- Davet bulundu
- Bağlan
- Göndericiye bağlanılıyor
- Doğrulama ifadesini kontrol et
- Dosyayı kabul et veya reddet
- Dosya alınıyor · yüzde
- Dosya doğrulanıyor
- Dosyayı indir

Mobilde ana düğmeler tam genişlikte ve en az 44 piksel dokunma yüksekliğinde olur. Masaüstünde davet işlemleri aynı satırda gösterilebilir. Uzun bağlantı metni arayüzü taşırmaz; kullanıcıya durum ve işlem düğmeleri gösterilir.

## 9. Hata davranışları

| Durum | Kullanıcı davranışı |
|---|---|
| Davet süresi doldu | `Bu davetin süresi dolmuş. Göndericiden yeni davet iste.` |
| Davet daha önce kullanıldı | `Bu davet daha önce kullanılmış.` |
| Davet iptal edildi | `Gönderici bu daveti iptal etmiş.` |
| Geçersiz bağlantı parametresi | Bağlantı başlatılmaz; yeni kod veya davet istenir |
| İkinci alıcı | İkinci alıcı reddedilir, ilk bağlantı etkilenmez |
| Aynı ağda değil veya ağ engeli var | On beş saniye sonra VaultDrop önerilir |
| Doğrulama ifadeleri farklı | İki tarafta bağlantı kapatılır |
| Aktarım yarıda kesildi | Eksik dosya indirilmez |
| SHA-256 uyuşmadı | Dosya sunulmaz; aktarım başarısız görünür |
| Sayfa yenilendi | Eski oturum temizlenir; yeni davet istenir |
| Pano izni reddedildi | Bağlantı seçilebilir metin olarak gösterilir veya Paylaş önerilir |
| Web Share desteklenmiyor | Paylaş düğmesi gizlenir; kopyalama çalışır |

## 10. Bileşen sınırları

### Davet bağlantısı yardımcı modülü

- Güvenli göreli/aynı kaynak davet URL'si üretir.
- URL'den yalnız geçerli oda kodunu okur.
- Dosya veya oda anahtarı kabul etmez.

### Gönderici davet arayüzü

- Oda, kalan süre, kopyalama, paylaşma ve iptal işlemlerini yönetir.
- WebRTC dosya motorunu değiştirmez.
- Yeni davet oluşturulduğunda eski davetin kaynaklarını temizler.

### Alıcı yönlendirme katmanı

- URL kodunu okur.
- Al sekmesini ve Yakındaki Cihazlar yöntemini seçer.
- Kodu doldurur fakat otomatik `join` çağrısı yapmaz.
- Kullanıcının `Bağlan` onayını mevcut alıcı paneline iletir.

### Sunucu oda katmanı

- Oda süresini beş dakika uygular.
- Tek katılımcı kuralını atomik olarak korur.
- Süresi dolan ve iptal edilen odaları temizler.
- Dosya bilgisi veya dosya baytı kabul etmez.

## 11. Otomatik test planı

- Davet URL'sinde yalnız oda kodu bulunur.
- Dosya adı, içerik işareti, SHA-256 ve oda anahtarı URL/DOM/ağ isteğine sızmaz.
- Geçerli URL `Al → Yakındaki Cihazlar` ekranını seçer ve kodu doldurur.
- URL açılışı tek başına `joinRoom` çağırmaz.
- `Bağlan` düğmesi tek bir katılım çağrısı yapar.
- Kopyalama doğru, aynı kaynak davet bağlantısını panoya yazar.
- Web Share destekleniyorsa Paylaş çalışır; desteklenmiyorsa düğme gösterilmez.
- Beş dakikalık süre ve tek kullanımlılık sunucu zaman testleriyle doğrulanır.
- İki eşzamanlı katılım isteğinden yalnız biri başarılı olur.
- İkinci alıcı ilk WebRTC bağlantısını kapatmaz.
- Davet iptali oda ve sinyalleri kapatır.
- Yöntem değişikliği ve unmount bütün zamanlayıcı/peer/worker kaynaklarını kapatır.
- Eski davetten geç gelen sonuç yeni davetin durumunu değiştirmez.
- READY/ACK ve doğrulama tamamlanmadan dosya teklifi başlamaz.
- Eksik veya SHA-256 değeri yanlış dosyada indirme oluşmaz.
- Bağlantı zaman aşımında VaultDrop önerilir.
- QR Video ve renkli QR aktif yönteme geri dönmez.

## 12. Gerçek cihaz kabul planı

Zorunlu eşleşmeler:

- Windows Chrome → Windows Edge
- Windows Chrome → macOS Safari
- macOS Chrome → macOS Safari

Zorunlu ağlar:

- Normal aynı ofis ağı
- Misafir Wi-Fi
- Kurumsal güvenlik duvarlı ağ

Zorunlu boyutlar:

- 1 MiB
- 25 MiB
- 100 MiB

Davet bağlantısı en az Teams, WhatsApp Web ve e-posta üzerinden açılmalıdır. Normal ağda oda on beş saniye içinde kurulmalı; indirilen dosyanın adı, boyutu ve SHA-256 değeri kaynakla aynı olmalıdır. Yarım veya doğrulanmamış dosya hiçbir durumda indirilememelidir.

## 13. Yayın ve geri dönüş

- Özellik mevcut `VITE_ENABLE_NEARBY` kapısının arkasında kalır.
- Gerçek cihaz matrisi tamamlanmadan üretim örneğinde kapalıdır.
- Davet yönlendirmesinde hata olursa kullanıcı kısa kodu elle girebilir.
- WebRTC bağlantısı kurulmazsa VaultDrop ana yedektir.
- Davet bağlantısı özelliğinin kapatılması mevcut kısa kod ve VaultDrop akışını bozmaz.

## 14. Kapsam dışı

- Tarayıcıların yerel ağdaki cihazları otomatik keşfetmesi
- Masaüstü uygulaması
- Dosya içeriğinin sunucu üzerinden aktarılması
- İnternet üzerinden TURN aracılığıyla uzak dosya aktarımı
- Bir odaya birden fazla alıcı bağlanması
- QR Video veya renkli QR'ın geri getirilmesi
