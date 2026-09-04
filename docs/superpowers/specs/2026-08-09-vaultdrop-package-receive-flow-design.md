# VaultDrop Şifreli Paket Alım Akışı Tasarımı

## Amaç

Şifreli paket oluşturma ve açma işlemlerini kullanıcının ana niyetine göre ayırmak:

- **Gönder > Şifreli paket:** Yalnızca `.bta` paketi oluşturur.
- **Al > Şifreli paket:** `.bta` dosyasını ve ayrı kanaldan gelen anahtarı kullanarak paketi açar.

## Değerlendirilen Yaklaşımlar

1. **Önerilen ve onaylanan:** Al sekmesine üç yöntem eklemek; Şifreli paket, QR video ve Kameradan tara. Şifreli paket varsayılan olur.
   - En anlaşılır ve en az tıklama gerektiren akış.
   - Gönder ve Al sorumlulukları net ayrılır.
2. Al sekmesinde QR videoyu varsayılan bırakmak, şifreli paketi ek seçenek yapmak.
   - Mevcut varsayılanı korur ancak yaygın `.bta` alımını geri plana iter.
3. Ayrı bir “Paket aç” üst sekmesi oluşturmak.
   - Görünürlüğü artırır fakat ana işlem yapısını gereksiz yere üçe böler.

## Bileşen Davranışı

- `TransferPage`, Gönder tarafında `SecurePackagePanel view="create"` kullanır.
- `ReceiveMethodSelector`, `package`, `video` ve `camera` yöntemlerini sunar.
- Al sekmesinin başlangıç yöntemi `package` olur.
- Al tarafında `package` seçilince `SecurePackagePanel view="open"` gösterilir.
- QR video ve kamera akışlarının mevcut davranışı korunur.

## Görsel Düzen

Yeni seçenek mevcut VaultDrop kart, renk, tipografi ve aktif durum kurallarını kullanır. Al yöntemleri masaüstünde üç sütun, dar ekranda mevcut responsive düzenle alt alta görünür. Yeni bir görsel dil eklenmez.

## Testler

- Gönder > Şifreli paket ekranında `.bta` açma alanı bulunmamalı.
- Al sekmesi açıldığında Şifreli paket varsayılan ve aktif olmalı.
- Al > Şifreli paket ekranında paket dosyası ve anahtar alanı bulunmalı; paket oluşturma alanı bulunmamalı.
- QR video ve kamera seçenekleri çalışmaya devam etmeli.

## Kapsam Dışı

Şifreleme algoritması, dosya biçimi, QR protokolü ve landing page bu değişiklikte değiştirilmez.
