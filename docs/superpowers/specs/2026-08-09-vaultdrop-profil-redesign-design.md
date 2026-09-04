# VaultDrop Profil Sayfası Yenileme Tasarımı

## Amaç

Profil sayfasını mevcut VaultDrop tasarım diliyle uyumlu, premium ve kolay taranabilir bir üye paneline dönüştürmek. Veri çekme, oturum, çıkış ve işlem geçmişi işlevleri değişmeden kalacak.

## Görsel Yön

Sayfa; sıcak açık arka plan, yarı saydam beyaz yüzeyler, ince açık sınırlar ve yumuşak gölgeler kullanan frosted-glass bir dashboard görünümüne sahip olacak. Kırmızı VaultDrop vurgu rengi yalnızca önemli aksiyonlarda, ikonlarda ve progress barında kullanılacak.

## Profil Alanı

- Profil başlığı tek bir cam yüzeyli kart içinde sunulacak.
- Avatar, ince gradient halka ve yumuşak dış gölgeyle vurgulanacak.
- Kullanıcı adı güçlü başlık, e-posta daha küçük ve yumuşak yardımcı metin olacak.
- Çıkış düğmesi ikincil ve sakin görünecek; klavye odağı belirgin olacak.

## Üye Limiti ve Ana Aksiyon

- Limit alanı kompakt bir cam kart olacak.
- Metin hiyerarşisi limit başlığı, kullanım açıklaması ve progress bar şeklinde kurulacak.
- Mevcut özet verisindeki dosya sayısı, 15 dosyalık üye limitine oranlanarak progress bar üzerinde gösterilecek; veri yüklenmeden önce sıfır kabul edilecek.
- “Yeni aktarım” bağlantısı yüksek kontrastlı, gölgeli ana CTA olarak öne çıkacak.
- Progress değeri yüzde 0–100 aralığında sınırlandırılacak.

## İstatistik Kartları

- Toplam aktarım, aktarılan dosya ve toplam boyut için üç kart korunacak.
- Her karta anlamlı, erişilebilirlik açısından dekoratif olarak işaretlenmiş bir SVG ikon eklenecek.
- Rakamlar büyük ve kalın, etiketler daha küçük ve soft olacak.
- Hover sırasında kart birkaç piksel yükselecek; sınır ve gölge hafifçe güçlenecek.
- Hareket azaltma tercihi olan kullanıcılarda animasyon kapatılacak.

## İşlem Geçmişi

- Geçmiş alanı frosted-glass ana kart olarak düzenlenecek.
- Boş durumda dosya/aktarım ikonu, “Henüz aktarım yok” başlığı, davetkâr kısa açıklama ve yeni aktarım bağlantısı gösterilecek.
- Dolu listedeki satırların mevcut verileri ve durum gösterimi korunacak; satır aralıkları ve mobil kırılım iyileştirilecek.

## Responsive Davranış

- Geniş ekranda istatistik kartları üç sütun olacak.
- Dar ekranda profil kartı, limit bilgisi ve aksiyonlar doğal sırayla alt alta inecek.
- İşlem geçmişi satırları mobilde iki sütunlu, okunabilir bir yapıya dönüşecek.
- Tüm etkileşimli alanlar en az 44 piksel yüksekliğe ve görünür klavye odağına sahip olacak.

## Teknik Sınırlar

- Yeni UI kütüphanesi veya ikon paketi eklenmeyecek.
- İkonlar küçük, yerel SVG bileşenleriyle oluşturulacak.
- Mevcut `ProfilePage.jsx` veri akışı korunacak.
- Stil değişiklikleri `MemberPages.css` içinde mevcut sınıf düzenini takip edecek.
- UTF-8 Türkçe metinler korunacak.

## Doğrulama

- Profil başlığı, limit göstergesi, istatistik ikonları, progress bar, CTA ve boş durum UI testleriyle doğrulanacak.
- Mevcut üyelik testleri korunacak.
- Kod kontrolü ve üretim derlemesi çalıştırılacak.
- Masaüstü ve mobil görünüm tarayıcıda görsel olarak kontrol edilecek.
