import { describe, expect, it } from "vitest";
import { buildVaultDropPackage } from "../transfer/build-vaultdrop-package.js";

describe("VaultDrop paket kurucusu", () => {
  it("tek dosyayı bir kez okuyup aşamaları sırayla bildirir", async () => {
    const file = new File(["rapor içeriği ".repeat(128)], "rapor.txt", { type: "text/plain" });
    const originalArrayBuffer = file.arrayBuffer.bind(file);
    let readCount = 0;
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => {
        readCount += 1;
        return originalArrayBuffer();
      },
    });
    const progress = [];

    const result = await buildVaultDropPackage([file], {
      onProgress: ({ stage, percent }) => progress.push({ stage, percent }),
    });

    expect(readCount).toBe(1);
    expect(progress).toEqual([
      { stage: "archive", percent: 5 },
      { stage: "read", percent: 20 },
      { stage: "compress", percent: 35 },
      { stage: "encrypt", percent: 70 },
      { stage: "complete", percent: 100 },
    ]);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.keyText).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.transferId).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(result.sha256).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.compression).toBe("zlib");
    expect(result.originalSize).toBe(file.size);
    expect(result.storedSize).toBeLessThan(result.originalSize);
    expect(result.savedPercent).toBeGreaterThan(0);
  });
});
