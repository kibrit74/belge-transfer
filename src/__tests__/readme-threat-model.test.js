import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("README aylık kota tehdit modeli", () => {
  it("sunucusuz gizliliği korurken aylık bayt kotasının dürüst sınırını açıklar", async () => {
    const readme = await readFile(resolve(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("kooperatif kullanım takibi");
    expect(readme).toContain("kötü niyetli değiştirilmiş istemciye karşı");
    expect(readme).toContain("güvenilir bir bayt sınırı değildir");
  });

  it("paket ve anahtarın sunucuya gitmediğini, kayıp anahtarın kurtarılamadığını açıklar", async () => {
    const readme = await readFile(resolve(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("Paket ve anahtar VaultDrop sunucusuna yüklenmez.");
    expect(readme).toContain("Anahtar kaybolursa paket kurtarılamaz.");
  });
});
