import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("README kullanım sınırları", () => {
  it("VaultDrop paket sınırını üye ve misafir için ayrı açıklar", async () => {
    const readme = await readFile(resolve(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("Giriş yapan üyeler: tek işlemde en fazla 15 dosya, toplam 50 MiB");
    expect(readme).toContain("misafirler: tek dosya, toplam 10 MiB");
  });

  it("VaultDrop paketinin uzantısını, eski paket desteğini ve anahtar paylaşımını açıklar", async () => {
    const readme = await readFile(resolve(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("Yeni paketler `.vdrop` uzantısıyla oluşturulur.");
    expect(readme).toContain("Eski `.bta` paketleri yalnız açma uyumluluğu için desteklenir.");
    expect(readme).toContain("Anahtar ayrı bir kanaldan gönderilir.");
    expect(readme).toContain("Gönderen ve alıcı, ekranda gösterilen SHA-256 değerini karşılaştırabilir.");
  });

  it("Canlı QR ve Yakındaki Cihazlar sınırlarını ayrı doğru değerlerle açıklar", async () => {
    const readme = await readFile(resolve(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain(
      "Canlı QR'ın 2 MiB ve Yakındaki Cihazlar'ın 100 MiB sınırları gerçek cihaz kabul kapılarıdır.",
    );
    expect(readme).not.toContain("Yakındaki Cihazlar ve Canlı QR'ın 10 MiB sınırı");
  });
});
