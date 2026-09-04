import { describe, expect, it } from "vitest";
import { TRANSFER_METHODS, getTransferMethod, recommendTransferMethod } from "../transfer/method-registry.js";

const MIB = 1024 * 1024;

describe("üç yöntemli aktarım kayıt defteri", () => {
  it("yalnız Canlı QR, Yakındaki Cihazlar ve VaultDrop yöntemlerini taşır", () => {
    expect(TRANSFER_METHODS.map((method) => method.id)).toEqual(["live", "nearby", "package"]);
    expect(JSON.stringify(TRANSFER_METHODS)).not.toMatch(/qr_video|color/i);
    expect(getTransferMethod("live").maxBytes).toBe(2 * 1024 * 1024);
    expect(getTransferMethod("nearby").maxBytes).toBe(100 * MIB);
    expect(getTransferMethod("package").maxBytes).toBe(50 * MIB);
    expect(getTransferMethod("unknown")).toBeNull();
    expect(Object.isFrozen(TRANSFER_METHODS)).toBe(true);
  });

  it("yan yana ve kameralı küçük dosyada Canlı QR önerir", () => {
    expect(recommendTransferMethod({
      proximity: "near", sameNetwork: false, sensitive: false,
      sizeBytes: 400 * 1024, cameraAvailable: true,
    })).toMatchObject({ primary: "live", fallback: "package" });
  });

  it("hassas veya uzak dosyada VaultDrop önerir", () => {
    expect(recommendTransferMethod({
      proximity: "remote", sameNetwork: false, sensitive: true,
      sizeBytes: 2 * MIB, cameraAvailable: false,
    })).toMatchObject({ primary: "package", fallback: null });
  });

  it("aynı ağdaki kamerasız 80 MiB dosyada Yakındaki Cihazlar önerir", () => {
    expect(recommendTransferMethod({
      proximity: "near", sameNetwork: true, sensitive: false,
      sizeBytes: 80 * MIB, cameraAvailable: false,
    })).toMatchObject({ primary: "nearby", fallback: "package" });
  });
});
