import { describe, expect, it } from "vitest";
import { sanitizeDownloadName } from "../transfer/safe-download-name.js";

describe("güvenli indirme adı", () => {
  it.each([
    ["../gizli.txt", "gizli.txt"],
    ["..\\gizli.txt", "gizli.txt"],
    ["CON", "indirilen-dosya"],
    ["aux.pdf", "indirilen-dosya.pdf"],
    ["rapor. ", "rapor"],
    ["a\u0000b.txt", "ab.txt"],
    ["rapor<2026>:?*.pdf", "rapor2026.pdf"],
  ])("%j metadata adını %j olarak güvenli hale getirir", (name, expected) => {
    expect(sanitizeDownloadName(name)).toBe(expected);
  });

  it("boş ad için verilen yedek adı kullanır", () => {
    expect(sanitizeDownloadName(" / ", "indirilen-dosya")).toBe("indirilen-dosya");
  });

  it("tüm geçersiz karakterlerden oluşan ad için indirilen-dosya adını kullanır", () => {
    expect(sanitizeDownloadName('<>:"|?*')).toBe("indirilen-dosya");
  });

  it("çok uzun adları uzantıyı koruyarak makul uzunluğa indirir", () => {
    const result = sanitizeDownloadName(`${"a".repeat(400)}.pdf`);

    expect(result).toHaveLength(180);
    expect(result.endsWith(".pdf")).toBe(true);
  });
});
