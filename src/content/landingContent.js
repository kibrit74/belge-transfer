export const FILE_TYPES = [
  { extension: "PDF", title: "PDF Belgeleri", detail: ".pdf", tone: "pdf" },
  { extension: "DOC", title: "Word Belgeleri", detail: ".doc · .docx", tone: "word" },
  { extension: "XLS", title: "Hesap Tabloları", detail: ".xls · .xlsx · .csv", tone: "sheet" },
  { extension: "PPT", title: "Sunumlar", detail: ".ppt · .pptx", tone: "slides" },
  { extension: "IMG", title: "Görseller", detail: ".jpg · .png · .webp", tone: "image" },
  { extension: "ZIP", title: "Arşiv Dosyaları", detail: ".zip · .rar · .7z", tone: "archive" },
  { extension: "TXT", title: "Metin Dosyaları", detail: ".txt · .md · .rtf", tone: "text" },
  { extension: "UDF", title: "UYAP Belgeleri", detail: ".udf", tone: "udf" },
  { extension: "•••", title: "Diğer Dosyalar", detail: "Tüm uzantılar", tone: "all" },
];

export const LANDING_FAQS = [
  {
    question: "VaultDrop dosyalarımı bir sunucuya yükler mi?",
    answer:
      "Hayır. Dosya seçme, şifreleme ve paket hazırlama işlemleri cihazındaki tarayıcıda gerçekleşir.",
  },
  {
    question: "Hangi dosya türlerini aktarabilirim?",
    answer: "Tüm dosya türlerini aktarabilirsin. Giriş yapan üyeler tek VaultDrop paketinde en fazla 15 dosyayı toplam 50 MiB'a kadar seçebilir. Misafirler tek dosya ve toplam 10 MiB ile kullanabilir.",
  },
  {
    question: "Uzak gönderim için hangi yöntemi seçmeliyim?",
    answer: "VaultDrop (şifreli paket), uzak gönderim için en stabil ve pratik seçenektir.",
  },
  {
    question: "Aynı Wi-Fi'daki iki bilgisayar nasıl aktarır?",
    answer: "Yakındaki Cihazlar, tek dosyayı en fazla 100 MiB olarak iki tarayıcı arasında doğrudan gönderir. Bağlantı kurulmazsa VaultDrop kullanılır.",
  },
  {
    question: "Anahtarı neden ayrı göndermeliyim?",
    answer: "Paket ve anahtarın farklı kanallardan gönderilmesi korumayı güçlendirir.",
  },
  {
    question: "Alıcının uygulama kurması gerekir mi?",
    answer: "Hayır. Güncel bir tarayıcı yeterlidir.",
  },
];
