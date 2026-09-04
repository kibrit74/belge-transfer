# VaultDrop SSS Sayfası Tasarımı

## Amaç

VaultDrop hakkında sık sorulan soruları ana sayfadan bağımsız, kolay taranabilen ve mobilde rahat kullanılabilen `/sss` sayfasında sunmak.

## Seçilen yaklaşım

Tek parça uzun liste yerine arama alanı, kategori filtreleri ve açılır cevaplardan oluşan dengeli yardım sayfası kullanılacak. Bu yapı basit bir listeye göre daha kolay bulunabilirlik sağlar; kapsamlı bir yardım merkezi altyapısına göre daha stabil ve bakımı daha pratiktir.

## Sayfa yapısı

- Üst alanda marka, ana sayfaya dönüş ve “Aktarıma Başla” bağlantısı bulunur.
- Başlık alanında sayfanın amacı açıklanır ve soru arama alanı sunulur.
- Sorular “Tümü”, “Genel”, “Güvenlik”, “Kullanım” ve “Teknik” kategorileriyle filtrelenir.
- Sonuçlar açılır-kapanır soru listesi olarak gösterilir.
- Eşleşme yoksa anlaşılır bir boş sonuç mesajı görünür.
- Alt bilgi alanı kullanıcıyı ana sayfaya geri yönlendirir.

## Davranış

Arama, soru ve cevap metninde Türkçe harf uyumlu olarak çalışır. Kategori ve arama birlikte uygulanır. Filtre değişiklikleri sayfayı yenilemez. İlk görünen soru açık gelir; diğer cevaplar kullanıcı tarafından açılır.

## Görsel ve erişilebilirlik kuralları

Sayfa mevcut krem, siyah ve kırmızı VaultDrop renklerini; yuvarlatılmış gezinme çubuğunu ve ortak yazı düzenini korur. Arama alanının görünür etiketi, filtrelerin seçili durumu ve klavye odak görünümü bulunur. Mobilde üst menü ve alt bilgi taşmadan tek sütuna uyarlanır.

## Doğrulama

Rota çözümleme, arama, kategori seçimi ve boş sonuç davranışı otomatik testlerle; üretim derlemesi ve tarayıcı görünümü de uygulama sonunda doğrulanır.
