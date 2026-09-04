# VaultDrop QR Video Önizleme Tasarımı

## Amaç

Oluşturulan QR videonun doğal çözünürlüğüyle karttan taşmasını önlemek ve sonucu okunaklı, responsive bir önizleme alanında göstermek.

## Kök Neden

`VideoTransferPanel` sonuç videosuna `video-preview` sınıfı verir ancak bu sınıf için CSS kuralı yoktur. Tarayıcı videoyu doğal ölçüsüyle gösterdiği için QR kareleri transfer kartının dışına taşar.

## Onaylanan Çözüm

- Video sonucu ortalanmış bir önizleme kartında gösterilir.
- Kart maksimum `560px` genişliğinde ve `16 / 9` oranındadır.
- Video alanı koyu arka plan üzerinde `object-fit: contain` kullanır.
- Mobilde önizleme mevcut kart genişliğinin tamamına uyum sağlar.
- İndirme ve anahtar kopyalama butonları videonun altında taşmadan yerleşir.
- Video üretme, indirme ve anahtar işlevleri değiştirilmez.

## Testler

- Oluşturulan sonuç `video-result-card` içinde görünür.
- Video `video-preview` sınıfını korur.
- Mevcut QR video üretme ve indirme testleri geçmeye devam eder.

## Kapsam Dışı

QR kare üretimi, video çözünürlüğü, codec seçimi ve şifreleme protokolü değiştirilmez.
