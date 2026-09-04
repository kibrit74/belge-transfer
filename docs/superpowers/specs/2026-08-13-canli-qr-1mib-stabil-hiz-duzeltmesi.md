# Canlı QR: 1 MiB Stabil Hız Düzeltmesi

**Tarih:** 13 Ağustos 2026  
**Durum:** Kullanıcı kararı alındı; ayrıntılı uygulama onayı bekleniyor.  
**Bu belge**, `2026-08-13-vaultdrop-ve-hizli-canli-qr-design.md` içindeki Canlı QR için 5 MiB ürün sınırının yerine geçer.

## Neden değişiklik gerekiyor?

Canlı QR için önce hedeflenen 5 MiB sınırı, iki dakikanın altında ve farklı cihazlarda güvenilir aktarım hedefiyle uyuşmadı.

- 3 MiB ZIP, dört QR gösteren geniş bir ekranda yaklaşık 60–100 saniye sürebilir; iki QR'da iki dakikanın üstüne, tek QR'da ise yaklaşık dört dakikaya çıkar.
- 5 MiB testindeki yoğun matematiksel çözüm, tek aktarımda 134 saniyelik test zaman aşımına ulaştı. Bu yöntem kullanıcı için kabul edilemez.
- 1.400 byte taşıyan bir QR yaklaşık 141 hücre genişliğine çıkar. Küçük ekranda hücreler gereğinden fazla küçülürse tarama güvenilirliği düşer.

Bu nedenle Canlı QR, büyük dosya aktarım aracı değil; aynı ortamda hızlı küçük dosya aktarım aracı olarak kalacaktır.

## Ürün kararı

### Canlı QR

- Tek bir dosya gönderir; `.zip` de tek dosya kabul edilir.
- Kullanıcıya sunulan en büyük dosya boyutu **1 MiB**'dır.
- ZIP'in içindeki dosya sayısı için ayrı bir sınır yoktur; önemli olan ZIP dosyasının kendisinin 1 MiB veya altında olmasıdır.
- ZIP, PNG, JPEG, MP4 gibi zaten sıkıştırılmış türler tekrar sıkıştırılmaz.
- Canlı QR şifreli değildir. Ekranı gören başka bir kamera veriyi okuyabilir; arayüz bu uyarıyı açıkça gösterir.
- 1 MiB + 1 byte dosya, dosya okunmadan, paketlenmeden ve kota işlemi başlamadan reddedilir. Mesaj: “Canlı QR en fazla 1 MiB destekler. Daha büyük veya uzaktaki gönderimler için VaultDrop kullanın.” LQP1 üst bilgi ve başlık payı bu kullanıcı sınırına dahil değildir; yalnız paket ayrıştırma üst sınırında hesaba katılır.

### VaultDrop

- 1 MiB üzerindeki dosya veya ZIP için önerilen yöntemdir.
- Birden fazla dosya, uzak cihazlar ve şifreli paylaşım için kullanılmaya devam eder.
- Bu karar VaultDrop `.vdrop` ve eski `.bta` açma uyumluluğunu değiştirmez.

## Yeni teknik yaklaşım

Yoğun denklem çözümü kullanan mevcut fountain tasarımı kaldırılacaktır. Yerine **seyrek onarım sembolleri ve parça parça çözüm** kullanılacaktır.

1. Dosya önce doğrulanabilir LQP1 paketine dönüştürülür.
2. İlk kareler dosyanın doğrudan parçalarını taşır.
3. Sonraki onarım kareleri, en fazla 32 parçanın karışımını taşır. Karışımlar aktarım kimliğine bağlı olarak her iki uçta aynı biçimde üretilir.
4. Alıcı, tek parçaya indirgenen bir onarım karesini hemen çözer; bulunan parça diğer bekleyen karelerden çıkarılır. Bu işlem zincir halinde sürer.
5. Zincir sonunda en fazla 192 parça kalmışsa alıcı yalnız bu küçük kalanı çözer. 5 MiB motorundaki gibi bütün dosyayı kapsayan dev bir denklem çözümü yoktur; sınır aşılırsa aktarım tamamlanmaz ve dosya üretilmez.
6. Eksik veya bozuk kare, hiçbir zaman kısmi dosya veya indirme bağlantısı üretmez. LQP1 SHA-256 doğrulaması geçmeden aktarım tamamlanmış sayılmaz.

Bu yapı, QR kareleri kaçırıldığında başa dönmeyi önler; ancak kullanıcıya ölçülmemiş hız sözü vermez.

## Ekran ve hız kuralları

- Tüm kodlar standart siyah-beyaz QR olarak kalır; renkli QR ve QR Video kullanılmaz.
- Dar ekranda 1, yeterli ekranda 2, yalnız okunabilirlik testi geçen geniş masaüstünde en fazla 4 QR gösterilir.
- Her QR, gerçek ekran pikselinde en az 3 hücre pikselini hedefler. Bu sağlanamıyorsa QR sayısı veya karedeki veri miktarı düşürülür; okunabilirlik feda edilmez.
- Her tam QR grubu en az `1000 / 15` ms ekranda kalır. Görüntü yakalamayı atlatmak için sıfır süreli kare atımı yapılmaz.
- Kullanıcıya gösterilen hız tahmini kesin süre vaadi değildir.

## Kabul kapıları

Kod ancak aşağıdaki otomatik ve gerçek cihaz kontrolleri geçerse Canlı QR için yayınlanabilir sayılır:

1. **1 MiB paket:** 1,5 kat aday kare içinde; düzenli yüzde 20 kayıp ve en az iki sabit rastgele yüzde 20 kayıp deseninde eksiksiz çözülür.
2. Aynı testte çözüm işlemi 30 saniyenin altında tamamlanır; testin tamamı 60 saniyeyi geçmez.
3. Bozuk, yinelenen, başka aktarım kimliğine ait veya metadata'sı farklı kareler dosya üretmez.
4. Masaüstü → Android ve masaüstü → iPhone Safari senaryolarında 1 MiB için kontrollü ışıkta 5 denemenin 5'i tamamlanır.
5. Telefon → telefon senaryosunda 1 MiB için kontrollü ışıkta 5 denemenin 5'i tamamlanır.
6. Bu kapılardan biri geçmezse kullanıcıya açık canlı aktarım sınırı 512 KiB'a indirilir; hata gizlenmez ve VaultDrop önerilir.

## Kullanıcıya anlatım

Ana ekranda ayrım net olacaktır:

- **Canlı QR:** “Yanınızdaki cihaza, küçük dosya veya ZIP gönderin. En fazla 1 MiB.”
- **VaultDrop:** “Büyük, çoklu veya uzaktaki dosyaları şifreli paket olarak gönderin.”

Bu ayrım, WhatsApp veya e-posta yerine geçen yeni bir iletişim aracı iddiası taşımaz. VaultDrop paketi mevcut mesajlaşma/e-posta aracıyla ulaştırılır.

## Kapsam dışı

- Canlı QR'ı zorunlu şifrelemek
- Renkli QR veya QR Video'yu geri getirmek
- Dosya taşıyan bir sunucu eklemek
- 1 MiB üzerindeki Canlı QR dosyaları için hız vaadi vermek
