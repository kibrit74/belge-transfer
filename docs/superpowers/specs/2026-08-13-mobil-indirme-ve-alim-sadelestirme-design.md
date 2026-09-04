# Mobil indirme ve alım akışı sadeleştirmesi

## Amaç

Telefon ekranında indirme düğmelerinin kesilmeden, kolayca dokunulabilir görünmesini sağlamak ve alıcı tarafındaki artık önerilmeyen QR Video yolunu kaldırmak.

## Kapsam

- Al ekranında yalnız iki seçenek kalacak: **VaultDrop paketi** ve **Kameradan tara**.
- QR Video alım kartı ve bu kartın seçilmesiyle açılan ekran kullanıcıya gösterilmeyecek.
- QR Video üretim kodu, eski testler ve teknik altyapı bu değişiklikte silinmeyecek.
- Mobilde sonuç/indirme alanındaki düğmeler daralmayacak; 650 piksel ve altındaki ekranlarda alt alta, tam genişlikte yerleşecek.
- Uzun dosya adları, bekleme metinleri ve devre dışı düğmeler taşmayacak.

## Akış

1. Kullanıcı **Al** sekmesini açar.
2. Ya gelen `.vdrop` paketini seçer ya da yanındaki Canlı QR’ı kamerayla tarar.
3. Doğrulanmış sonuç geldiğinde indirme düğmesi görünür ve mobil ekranda tam genişlikte kalır.

## Hata ve uyumluluk

- Daha önce tarayıcıda seçilmiş QR Video alım durumu varsa, uygulama varsayılan güvenli alım yöntemine döner.
- QR Video gönderim tarafı ve eski teknik testler etkilenmez.
- Otomatik indirme engellenirse görünür yedek indirme düğmesi kullanılabilir kalır.

## Testler

- Alıcı seçiminde QR Video kartının görünmediği ve seçilemediği doğrulanacak.
- QR Video alım panelinin Transfer sayfasından açılmadığı doğrulanacak.
- Dar mobil genişlikte sonuç indirme düğmesinin alanı aşmadan tam genişlikte kaldığı doğrulanacak.
