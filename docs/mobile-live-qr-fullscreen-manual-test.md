# Mobil Canlı QR Tam Ekran Manuel Testi

Tarih: 15 Ağustos 2026  
Yayın durumu: **BEKLİYOR** — aşağıdaki gerçek cihaz kontrolleri tamamlanmadan mobil tam ekran için yayın onayı verilmez.

## Hazırlık

- Gönderici cihazda küçük bir test dosyasıyla Canlı QR gönderimini başlatın.
- Alıcı telefonda **Al → Canlı QR** alanını açın.
- Aynı dosyanın SHA-256 değerini gönderici ve alıcıda karşılaştırmak için kaydedin.

## Android Chrome

| Kontrol | Dikey | Yatay | Not |
|---|---|---|---|
| Kamera ekranı dolduruyor | ☐ | ☐ | |
| Kapatma ve alt düğmeler kesilmiyor | ☐ | ☐ | |
| İlk QR öncesi “QR bekleniyor…” görünüyor | ☐ | ☐ | |
| Yüzde ve parça sayısı geriye gitmiyor, %100'ü aşmıyor | ☐ | ☐ | |
| Gerçek tam ekran düğmesi çalışıyor veya güvenle görünmüyor | ☐ | ☐ | |
| Gerçek tam ekran reddedilirse tarama devam ediyor | ☐ | ☐ | |
| Kamera izni reddinde güvenli hata ve “Tekrar dene” çıkıyor | ☐ | ☐ | |
| Tamamlanmadan indirme bağlantısı görünmüyor | ☐ | ☐ | |
| Tamamlanınca dosya adı, boyutu ve SHA-256 doğru | ☐ | ☐ | |

## iPhone Safari

| Kontrol | Dikey | Yatay | Not |
|---|---|---|---|
| Kamera ekranı dolduruyor | ☐ | ☐ | |
| Çentik ve alt hareket alanı düğmeleri kesmiyor | ☐ | ☐ | |
| İlk QR öncesi “QR bekleniyor…” görünüyor | ☐ | ☐ | |
| Yüzde ve parça sayısı geriye gitmiyor, %100'ü aşmıyor | ☐ | ☐ | |
| Gerçek tam ekran desteklenmiyorsa uygulama içi tam ekran sürüyor | ☐ | ☐ | |
| Tarayıcı tam ekran isteğini reddederse alım kesilmiyor | ☐ | ☐ | |
| Kamera izni reddinde güvenli hata ve “Tekrar dene” çıkıyor | ☐ | ☐ | |
| Tamamlanmadan indirme bağlantısı görünmüyor | ☐ | ☐ | |
| Tamamlanınca dosya adı, boyutu ve SHA-256 doğru | ☐ | ☐ | |

## Temizlik ve yeniden başlama

- [ ] “Taramadan çık” sonrasında kamera kullanım göstergesi kapanıyor.
- [ ] “Taramayı yeniden aç” eski yüzdeyi ve eski parçaları göstermiyor.
- [ ] Başka aktarım yöntemine geçildiğinde kamera kapanıyor.
- [ ] Başarılı indirme sonrasında kamera kapanıyor.
- [ ] Hatalı veya eksik aktarımda bozuk dosya indirilmiyor.
