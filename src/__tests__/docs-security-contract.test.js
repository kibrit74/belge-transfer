import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RETIREMENT_LANGUAGE =
  /(?:artık|eski|kaldır|emekli|tarihsel|arşiv|uygulanma|kullanılma|oluşturulama|açılamaz|saklamaz|gönderilmez|reddet|silin|desteklenmiyor|yasak|değiştirir|bulunmaması|gone)/i;
const ACTIVE_SECURE_LINK =
  /(?:güvenli bağlantı|secure link).{0,160}(?:seç|oluştur|paylaş|yükle|kullan|sakla|sunucu|api)/i;
const SERVER_CIPHERTEXT_UPLOAD = [
  /(?:şifreli içerik|ciphertext).{0,160}(?:sunucuya|sunucuda|sunucu).{0,100}(?:yüklen|saklan|tutul|kabul)/i,
  /(?:sunucuya|sunucuda|sunucu).{0,160}(?:şifreli içerik|ciphertext).{0,100}(?:yüklen|saklan|tutul|kabul)/i,
];

async function listMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listMarkdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  }));
  return paths.flat();
}

describe("dokümantasyon güvenlik sözleşmesi", () => {
  it("Secure Link veya sunucuya şifreli içerik yüklemeyi aktif talimat olarak sunmaz", async () => {
    const docsRoot = resolve(process.cwd(), "docs");
    const files = await listMarkdownFiles(docsRoot);
    const violations = [];

    for (const file of files) {
      const lines = (await readFile(file, "utf8")).split(/\r?\n/);
      lines.forEach((line, index) => {
        const describesActiveSecureLink = ACTIVE_SECURE_LINK.test(line);
        const describesServerUpload = SERVER_CIPHERTEXT_UPLOAD.some((pattern) => pattern.test(line));
        if ((describesActiveSecureLink || describesServerUpload) && !RETIREMENT_LANGUAGE.test(line)) {
          violations.push(`${file.slice(docsRoot.length + 1)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("üç aktif yöntemin güvenlik ve ağ izolasyonu sözlerini açıklar", async () => {
    const security = await readFile(resolve(process.cwd(), "docs", "SECURITY.md"), "utf8");

    expect(security).toContain("AES-256-GCM");
    expect(security).toContain("rastgele 256 bit anahtar");
    expect(security).toContain("96 bit IV");
    expect(security).toContain("BTA1 ve BTA2");
    expect(security).toContain("güvenli indirme adı");
    expect(security).toContain("Bozuk pakette indirme bağlantısı oluşturulmaz.");
    expect(security).toContain("Paket, içerik ve anahtar VaultDrop sunucusuna yüklenmez.");
    expect(security).toContain("Anahtar ayrı bir kanaldan paylaşılır.");
    expect(security).toContain("Gönderen ve alıcı SHA-256 değerini karşılaştırabilir.");
    expect(security).toContain("Yeni paketler `.vdrop` olarak oluşturulur ve AES-256-GCM ile cihazda şifrelenir.");
    expect(security).toContain("eski `.bta` paketleri yalnız açma uyumluluğu için desteklenir.");
    expect(security).toContain("Canlı QR şifreli değildir");
    expect(security).toContain("WebRTC veri kanalı DTLS ile şifrelenir");
    expect(security).toContain("Dosya içeriği tanıştırma sunucusuna yüklenmez");
    expect(security).toContain("QR Video ve renkli QR aktif ürün yöntemi değildir");
    expect(security).not.toContain("QR video dosya eki olarak");
  });
});
