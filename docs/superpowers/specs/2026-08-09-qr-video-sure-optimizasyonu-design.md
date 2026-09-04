# QR Video Süre Optimizasyonu Tasarımı

## Amaç

291,2 KB girdide yaklaşık beş dakikaya çıkan QR Video süresini okunabilirliği koruyarak yaklaşık 85–95 saniye bandına indirmek.

## Kök Neden

- 700 baytlık 427 QR parçası, `repeatCount: 2` ve `holdFrames: 2` nedeniyle 1.708 video karesine dönüşüyor; 10 FPS'de teorik süre 171 saniye.
- Her yeni QR çizimi beklendikten sonra ayrıca 100 ms zamanlayıcı başlatılıyor. Çizim süresi bu beklemeye eklenerek gerçek kayıt süresini yaklaşık beş dakikaya uzatıyor.

## Çözüm

- Varsayılan tekrar sayısı 1 olacak; her QR iki kare boyunca tutulmaya devam edecek.
- Kare zamanlayıcısı bir önceki işlemin bitimine değil, kaydın başlangıcındaki mutlak hedef zamana bağlanacak.
- QR çizimi gecikse bile sonraki bekleme süresi kısalacak ve gecikme birikmeyecek.
- 700 bayt parça, 10 FPS ve iki kare tutma değeri korunacak; QR yoğunluğu ve tarama örnekleme aralığı değişmeyecek.

## Kabul Ölçütleri

1. 291,2 KB için tahmini süre 90 saniyeyi aşmaz.
2. Yapay QR çizim gecikmesi toplam kayıt süresine kare başına eklenmez.
3. Her QR iki video karesi boyunca çizilmeye devam eder.
4. Oluşturma, çözme ve arayüz testleri geçer.
