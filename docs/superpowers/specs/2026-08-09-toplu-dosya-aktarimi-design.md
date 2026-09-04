# Toplu Dosya Aktarımı Tasarımı

## Amaç

Şifreli Paket ve QR Video yöntemlerinde kullanıcı tek seferde en fazla 15 dosya seçebilecek. Tek dosyalı mevcut akış korunacak; birden fazla dosya seçildiğinde dosyalar tarayıcı içinde ZIP arşivine çevrilerek mevcut şifreleme ve aktarım sistemine verilecek.

## Kapsam

- Şifreli Paket oluşturma alanı çoklu dosya seçimini destekler.
- QR Video oluşturma alanı çoklu dosya seçimini destekler.
- Her iki yöntemde seçim başına en fazla 15 dosya kabul edilir.
- QR Video için seçilen özgün dosyaların toplam boyutu en fazla 15 MB olabilir.
- Şifreli Paket için mevcut 50 MiB aktarım sınırı korunur.
- Alma tarafında çoklu aktarım, özgün adları içeren tek bir ZIP dosyası olarak indirilir.
- Canlı QR yöntemi bu değişikliğin dışındadır.

## Teknik Yaklaşım

Yeni bir aktarım protokolü oluşturulmayacak. Ortak bir toplu dosya yardımcı modülü seçimi doğrulayacak, toplam boyutu hesaplayacak ve birden fazla dosyayı `fflate` ile ZIP'e çevirecek. Tek dosyada aynı `File` nesnesi kullanılacak; böylece mevcut dosya adı, türü ve alma davranışı değişmeyecek.

ZIP içindeki aynı adlı dosyalar veri kaybını önlemek için `dosya (2).uzantı` biçiminde benzersizleştirilecek. Arşiv adı tarih ve saat içeren güvenli bir ad olacak.

## Arayüz Davranışı

- Seçicilerde `multiple` etkinleştirilir ve açıklama en fazla 15 dosyayı belirtir.
- Seçilen dosyalar ad ve boyutlarıyla listelenir; toplam dosya sayısı ve boyutu gösterilir.
- Kullanıcı bir dosyayı listeden kaldırabilir.
- 15 dosya sınırı veya yöntemin boyut sınırı aşılırsa işlem başlatılmaz ve açık hata gösterilir.
- Birden fazla dosyada SHA-256 özeti, oluşturulan ZIP hazırlandıktan sonra hesaplanır.
- İşlem düğmeleri hazırlama, özet çıkarma veya video üretme sürerken devre dışı kalır.

## Uyumluluk ve Güvenlik

- Mevcut BTA1 şifreli kapsayıcı ve QRT3 QR kare protokolü değişmez.
- ZIP yerel tarayıcı belleğinde hazırlanır; sunucuya dosya yüklenmez.
- Anahtarın ayrı kanaldan iletilmesi kuralı değişmez.
- Eski tek dosyalık `.bta` paketleri ve QR videoları açılmaya devam eder.

## Doğrulama

- Toplu yardımcı fonksiyonlar; tek dosya, çoklu ZIP, aynı ad ve sınır aşımı senaryolarıyla test edilir.
- Her iki panel; `multiple` seçimi, 15 dosya sınırı, listeleme, kaldırma ve doğru aktarım dosyasının alt işleve verilmesi açısından test edilir.
- QR Video 15 MB toplam sınırı test edilir.
- Tüm testler, kod kontrolü ve üretim derlemesi çalıştırılır.
