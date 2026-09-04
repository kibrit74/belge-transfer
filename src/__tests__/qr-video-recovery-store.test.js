import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import { describe, expect, it } from "vitest";
import { createQrVideoRecoveryStore } from "../video/qr-video-recovery-store.js";

const HOUR = 60 * 60 * 1000;

describe("QR Video yerel kurtarma deposu", () => {
  it("şifreli giden veriyi 24 saat saklar fakat anahtar ve dosya bilgisini yazmaz", async () => {
    const store = createQrVideoRecoveryStore(new FDBFactory());
    const encryptedBytes = new Uint8Array([1, 2, 3]);

    await store.saveOutgoing({
      id: "outgoing-transfer-1",
      transferId: "Ab12Cd34Ef56",
      protocolVersion: "QRF1",
      createdAt: 1_000,
      encryptedBytes,
      keyText: "yasak-anahtar",
      fileName: "gizli.pdf",
      mime: "application/pdf",
    });
    encryptedBytes[0] = 99;

    const saved = await store.get("outgoing-transfer-1", 1_000);
    expect(saved.encryptedBytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(saved.expiresAt).toBe(1_000 + (24 * HOUR));
    const serialized = JSON.stringify(saved);
    expect(serialized).not.toContain("yasak-anahtar");
    expect(serialized).not.toContain("gizli.pdf");
    expect(serialized).not.toContain("application/pdf");
  });

  it("gelen sembolleri kimliğine göre tekilleştirir ve byte dizilerini kopyalar", async () => {
    const store = createQrVideoRecoveryStore(new FDBFactory());
    const symbols = [
      { symbolId: 7, data: new Uint8Array([7, 7]) },
      { symbolId: 7, data: new Uint8Array([8, 8]) },
      { symbolId: 8, data: new Uint8Array([9, 9]) },
    ];

    await store.saveIncoming({
      id: "incoming-transfer-1",
      transferId: "Ab12Cd34Ef56",
      protocolVersion: "QRF1",
      createdAt: 2_000,
      metadata: { sourceCount: 2, blockBytes: 2, originalBytes: 4, sha256: "A".repeat(43) },
      symbols,
    });
    symbols[0].data[0] = 0;

    const saved = await store.get("incoming-transfer-1", 2_000);
    expect(saved.symbols).toEqual([
      { symbolId: 7, data: new Uint8Array([8, 8]) },
      { symbolId: 8, data: new Uint8Array([9, 9]) },
    ]);
  });

  it("süresi geçmiş kayıtları otomatik ve toplu olarak siler", async () => {
    const store = createQrVideoRecoveryStore(new FDBFactory());
    await store.saveOutgoing(baseOutgoing("expired", 1_000));
    await store.saveOutgoing(baseOutgoing("active", 25 * HOUR));

    expect(await store.get("expired", 24 * HOUR + 1_001)).toBeNull();
    expect(await store.deleteExpired(25 * HOUR + 1)).toBe(0);
    expect((await store.list(25 * HOUR + 1)).map((record) => record.id)).toEqual(["active"]);
    await store.delete("active");
    expect(await store.list(25 * HOUR + 1)).toEqual([]);
  });

  it("IndexedDB yoksa veya kotası doluysa RECOVERY_UNAVAILABLE hatası verir", async () => {
    const unavailable = createQrVideoRecoveryStore(null);
    await expect(unavailable.list()).rejects.toMatchObject({ code: "RECOVERY_UNAVAILABLE" });

    const quotaError = Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    const broken = createQrVideoRecoveryStore({ open() { throw quotaError; } });
    await expect(broken.saveOutgoing(baseOutgoing("x", 0))).rejects.toMatchObject({
      code: "RECOVERY_UNAVAILABLE",
    });
  });
});

function baseOutgoing(id, createdAt) {
  return {
    id,
    transferId: "Ab12Cd34Ef56",
    protocolVersion: "QRF1",
    createdAt,
    encryptedBytes: new Uint8Array([1]),
  };
}
