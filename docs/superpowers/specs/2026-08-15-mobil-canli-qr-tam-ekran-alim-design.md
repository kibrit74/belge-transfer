# Mobil Canlı QR Tam Ekran Alım Tasarımı

Tarih: 15 Ağustos 2026  
Durum: Kullanıcı tarafından onaylandı

## Amaç

Telefonla Canlı QR alınırken kamerayı mümkün olan en geniş alanda göstermek, kullanıcının aktarımın ne kadar ilerlediğini açıkça görmesini sağlamak ve tarama kayıplarını azaltmak.

Bu değişiklik yalnız **Al → Canlı QR** alıcı akışını kapsar. Gönderici QR ekranı, VaultDrop, Yakındaki Cihazlar ve eski QR Video davranışları bu çalışmanın dışındadır.

## Seçilen yaklaşım

Hibrit tam ekran kullanılacak:

1. Mobil alıcıda tarayıcı yüzeyi CSS ile ekranın tamamını kaplayan sabit bir katmana dönüşür. Bu davranış iPhone ve Android'de temel ve güvenilir yoldur.
2. Tarayıcı destekliyorsa kullanıcı dokunuşuyla gerçek tarayıcı tam ekranına geçmek için ayrıca bir düğme sunulur.
3. Gerçek tam ekran isteği desteklenmez veya reddedilirse alım kesilmez; uygulama içi tam ekran devam eder.

Bu tercih gereklidir çünkü `requestFullscreen()` geçici kullanıcı etkileşimi ister ve bütün yaygın mobil tarayıcılarda aynı şekilde çalışmaz: <https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen>

## Arayüz düzeni

Mobil alıcı tarama yüzeyi dört bölümden oluşur:

- **Üst çubuk:** “Canlı QR alınıyor” başlığı, kısa durum metni ve taramadan çıkma düğmesi.
- **Kamera alanı:** Ekranın kalan büyük bölümünü kaplayan kamera görüntüsü. Görüntü taşmadan alanı doldurur. Ortada dikkat dağıtmayan bir hizalama kılavuzu bulunur.
- **İlerleme alanı:** Büyük yüzde, kalın ilerleme çubuğu ve `Alınan / toplam parça` bilgisi.
- **Alt eylemler:** Kamerayı çevir ve destekleniyorsa gerçek tam ekran düğmeleri. Düğmeler güvenli ekran boşluklarına uygun ve tek elle kullanılabilir boyutta olur.

Mobil olmayan geniş ekranlarda mevcut kart içi kamera düzeni korunur.

## Alım durumları

Arayüz aşağıdaki durumları açıkça gösterir:

1. **Kamera hazırlanıyor:** Kamera izni ve görüntü beklenir.
2. **QR bekleniyor:** Henüz geçerli aktarım bilgisi alınmadığı için hareketli, belirsiz ilerleme gösterilir.
3. **Alınıyor:** İlk geçerli QR'dan sonra toplam parça sayısı sabitlenir. Büyük yüzde, ilerleme çubuğu ve `420 / 1.000 parça` gibi sayaç gösterilir.
4. **Doğrulanıyor:** Gerekli parçalar tamamlanınca dosya bütünlüğü kontrol edilir. Bu sırada indirme sunulmaz.
5. **Tamamlandı:** Kamera durdurulur, tam ekran tarama katmanı kapanır ve doğrulanmış dosya için belirgin `Dosyayı indir` eylemi gösterilir.
6. **Hata:** Bozuk veya tamamlanamayan dosya indirilmez. Güvenli hata metniyle `Tekrar dene` ve `Taramadan çık` eylemleri sunulur.

## İlerleme hesabı

- Yüzde, alıcı motorunun bildirdiği benzersiz ve çözümlenmiş parça sayısından hesaplanır.
- Tekrar okunan QR'lar ilerlemeyi artırmaz.
- Değer `0–100` arasında sınırlandırılır ve arayüzde tam sayı olarak gösterilir.
- Toplam sayı bilinmiyorsa sahte yüzde gösterilmez; `QR bekleniyor…` durumu kullanılır.
- Dosya doğrulanmadan “hazır” veya indirilebilir olarak işaretlenmez.
- Yeni aktarım, yöntem değişimi, hata sonrası sıfırlama ve bileşenin kapanması eski ilerlemeyi temizler.

## Tam ekran davranışı

- Uygulama içi mobil tam ekran, tarama aktifken `position: fixed` ve dinamik ekran yüksekliğiyle görünür.
- Çentik, durum çubuğu ve alt hareket alanı için `safe-area-inset-*` boşlukları kullanılır.
- Sayfa arkada kaydırılmaz.
- Gerçek tam ekran yalnız kullanıcının düğmeye dokunmasıyla istenir.
- Gerçek tam ekran hatası alımı durdurmaz ve ham tarayıcı hata metni kullanıcıya gösterilmez.
- Kullanıcı taramadan çıkınca varsa gerçek tam ekrandan güvenli biçimde çıkılır.

## Erişilebilirlik ve hareket

- İlerleme alanı anlamlı bir `progressbar` olarak okunabilir.
- Durum değişimleri ekran okuyucuya ölçülü biçimde bildirilir.
- Düğmeler en az 44×44 piksel dokunma alanına sahip olur.
- Metinler kamera görüntüsünden bağımsız, yüksek kontrastlı koyu bir yüzeyde gösterilir.
- Azaltılmış hareket tercihi olan cihazlarda gereksiz animasyonlar kapatılır.

## Hız beklentisi

Tam ekran doğrudan çözümleme hızını iki katına çıkarmaz. QR'ın daha büyük ve düzgün hizalanmasını sağlayarak başarısız okumaları ve tekrar beklemeyi azaltır. Kazanç, özellikle küçük ekranlı veya orta seviye telefonlarda daha kararlı gerçek aktarım süresidir.

## Test ve kabul ölçütleri

Otomatik testler şunları kanıtlar:

- Mobil görünümde aktif alıcı sabit tam ekran tarama katmanını açar.
- Masaüstünde mevcut kart görünümü korunur.
- Toplam bilinmeden belirsiz durum gösterilir.
- Geçerli ilerlemede yüzde ve alınan/toplam değerleri doğrudur; değer taşmaz.
- Tekrarlanan veya eski ilerleme yeni aktarımda kalmaz.
- Gerçek tam ekran desteklenirse yalnız kullanıcı eylemiyle çağrılır.
- Gerçek tam ekran reddedilirse kamera ve alım çalışmaya devam eder.
- Başarıda kamera kapanır ve yalnız doğrulanmış dosya indirilir.
- Hata, sıfırlama ve bileşen kapanışında kamera/tam ekran/ilerleme temizlenir.
- Mevcut standart QR ve çoklu Canlı QR alım testleri gerilemez.

Manuel cihaz matrisi:

- Android Chrome: dikey ve yatay görünüm.
- iPhone Safari: dikey ve yatay görünüm.
- Kamera izni reddi ve sonradan yeniden deneme.
- Tarayıcı gerçek tam ekranı destekleyen ve desteklemeyen cihaz.
- Çentikli ekranlarda üst/alt düğmelerin tamamen görünmesi.

## Kapsam dışı

- Gönderici QR ekranının yeniden tasarlanması.
- QR kodlarının veri kapasitesinin veya kamera tarama hızının değiştirilmesi.
- Ekran uyanıklığı kilidi.
- QR Video, renkli QR, VaultDrop veya Yakındaki Cihazlar değişiklikleri.
