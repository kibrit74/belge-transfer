# VaultDrop Mobilden Mobile Güvenli Paylaşım Tasarımı — Tarihsel Arşiv

> **EMEKLİ — Bu tasarım uygulanmamalıdır.** Burada değerlendirilen sunucu destekli
> Güvenli Bağlantı yöntemi kaldırılmıştır. Güncel güvenlik ve veri akışı için
> [VaultDrop Sunucusuz Güvenlik Temeli](./2026-08-09-vaultdrop-sunucusuz-guvenlik-temeli-design.md)
> belgesini esas alın.

## Tarihsel bağlam

Bu belge, telefondan telefona aktarım için geçici bağlantı ve QR Video
seçeneklerinin birlikte değerlendirildiği eski tasarım çalışmasını kaydeder.
Bağlantı süresi, indirme sayısı, erişim kodu ve sunucuda geçici şifreli veri
tutma fikirleri bu çalışmada incelenmişti.

Bu yaklaşım daha sonra sunucusuz gizlilik hedefiyle uyumsuz bulundu. İlgili
oluşturma, açma ve saklama yolları kaldırıldı; eski bağlantılar içerik vermeden
emeklilik bilgisi gösterir.

## Güncel karşılık

- Uzak gönderimde Şifreli Paket kullanılır. `.bta` dosyası ve anahtar farklı
  kanallardan iletilir.
- QR Video deneysel, cihazdan cihaza bir alternatiftir ve anahtar videoya
  eklenmez.
- Alıcı Şifreli Paket veya QR Video içeriğini kendi cihazında açar.
- VaultDrop sunucusu dosyayı, `.bta` paketini, anahtarı veya QR içeriğini kabul
  etmez ve saklamaz.

Bu arşiv yeni özellik geliştirmek, API oluşturmak veya sunucuda dosya tutmak
için kaynak değildir.
