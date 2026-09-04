# VaultDrop giriş faydaları — premium glass tasarımı

## Amaç

Giriş sayfasının sağındaki üç fayda kartını mevcut düz siyah görünümden çıkarıp VaultDrop'un açık zemin, koyu antrasit ve mercan vurgu diline uygun premium bir cam yüzeye dönüştürmek.

## Görsel yön

- Ana panel: yarı saydam füme yüzey, arka plan bulanıklığı ve içeriden gelen ince beyaz kenar parlaması.
- Atmosfer: panelin sağ üstünde mercan, sol altında düşük yoğunluklu morumsu ışık geçişi.
- Kartlar: ana panelden bir ton açık, yarı saydam yüzey; ince beyaz kenar ve yumuşak iç gölge.
- Tipografi: başlıklar yüksek kontrastlı beyaz, açıklamalar daha okunaklı açık gri.
- İkonlar: dosya yığını, işlem geçmişi ve cihaz güvenliği anlamlarını taşıyan sade çizgi ikonları.

## Etkileşim

- Hover sırasında kart en fazla 3 piksel yükselir.
- Kenar ve ikon vurgusu mercan tonuna yumuşak geçiş yapar.
- Hareket azaltma tercihi etkinse geçişler devre dışı kalır.

## Yerleşim

- Üç kart masaüstünde dikey kalır.
- Mobilde panel tam genişliğe iner; iç boşluk ve kart yüksekliği azaltılır.
- Mevcut giriş formu ve sayfa ızgarası değiştirilmez.

## Kabul ölçütleri

- Panel cam etkisini destekleyen tarayıcılarda `backdrop-filter` kullanır ve desteklemeyenlerde okunaklı koyu zemin gösterir.
- Metin kontrastı korunur.
- Kartlar taşma yapmaz ve 760 piksel altındaki tek sütun düzenini bozmaz.
- Giriş akışı ve Google butonu davranışı değişmez.
