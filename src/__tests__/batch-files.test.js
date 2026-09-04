import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  getMaximumArchiveBytes,
  MAX_BATCH_FILES,
  MAX_ARCHIVE_OVERHEAD_BYTES,
  getTotalFileSize,
  prepareTransferFile,
  validateBatchFiles,
} from "../transfer/batch-files.js";
import { buildVaultDropPackage } from "../transfer/build-vaultdrop-package.js";
import { decryptContainer, MAX_ENCRYPTED_INPUT_BYTES } from "../crypto/encrypted-container.js";
import { MAX_INPUT_BYTES } from "../protocol/frame-v3.js";

describe("toplu dosya hazırlama", () => {
  it("tek dosyayı değiştirmeden aktarır", async () => {
    const file = new File(["delil"], "delil.txt", { type: "text/plain" });

    await expect(prepareTransferFile([file])).resolves.toBe(file);
  });

  it("15 dosyadan fazlasını reddeder", () => {
    const files = Array.from(
      { length: MAX_BATCH_FILES + 1 },
      (_, index) => new File([String(index)], `dosya-${index}.txt`),
    );

    expect(() => validateBatchFiles(files)).toThrow("En fazla 15 dosya seçebilirsiniz.");
  });

  it("dosyaların toplam boyutunu sınırlar", () => {
    const files = [new File(["1234"], "bir.txt"), new File(["5678"], "iki.txt")];

    expect(getTotalFileSize(files)).toBe(8);
    expect(() => validateBatchFiles(files, { maxBytes: 7 })).toThrow(
      "Seçilen dosyaların toplam boyutu izin verilen sınırı aşıyor.",
    );
  });

  it("birden fazla dosyayı özgün içerikleriyle ZIP arşivine dönüştürür", async () => {
    const files = [
      new File(["birinci içerik"], "bir.txt", { type: "text/plain" }),
      new File(["ikinci içerik"], "iki.txt", { type: "text/plain" }),
    ];

    const result = await prepareTransferFile(files, { archiveName: "toplu-aktarim.zip" });
    const entries = unzipSync(new Uint8Array(await result.arrayBuffer()));

    expect(result.name).toBe("toplu-aktarim.zip");
    expect(result.type).toBe("application/zip");
    expect(strFromU8(entries["bir.txt"])).toBe("birinci içerik");
    expect(strFromU8(entries["iki.txt"])).toBe("ikinci içerik");
  });

  it("çoklu dosyayı ZIP olarak şifreleyip güvenli paket içinden açar", async () => {
    const files = [
      new File(["ilk"], "../a.txt", { type: "text/plain" }),
      new File(["ikinci"], "..\\a.txt", { type: "text/plain" }),
    ];

    const packaged = await buildVaultDropPackage(files);
    const opened = await decryptContainer(
      await packaged.blob.arrayBuffer(),
      packaged.keyText,
    );

    expect(opened.file.type).toBe("application/zip");
    expect(opened.file.name).toMatch(/^toplu-aktarim-\d{8}-\d{4}\.zip$/);
    const entries = unzipSync(new Uint8Array(await opened.file.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual([".._a (2).txt", ".._a.txt"]);
    expect(strFromU8(entries[".._a.txt"])).toBe("ilk");
    expect(strFromU8(entries[".._a (2).txt"])).toBe("ikinci");
  });

  it("aynı adlı dosyaların üzerine yazmak yerine adlarını benzersizleştirir", async () => {
    const files = [new File(["ilk"], "belge.pdf"), new File(["ikinci"], "belge.pdf")];

    const result = await prepareTransferFile(files, { archiveName: "toplu.zip" });
    const entries = unzipSync(new Uint8Array(await result.arrayBuffer()));

    expect(strFromU8(entries["belge.pdf"])).toBe("ilk");
    expect(strFromU8(entries["belge (2).pdf"])).toBe("ikinci");
  });

  it("ham toplam 50 MiB olduğunda sınırlı ZIP üst yükü için yer ayırır", () => {
    expect(getMaximumArchiveBytes(MAX_INPUT_BYTES)).toBe(MAX_ENCRYPTED_INPUT_BYTES);
    expect(getMaximumArchiveBytes(MAX_INPUT_BYTES + 1)).toBe(MAX_ENCRYPTED_INPUT_BYTES);
    expect(getMaximumArchiveBytes(1024)).toBe(1024 + MAX_ARCHIVE_OVERHEAD_BYTES);
  });
});
