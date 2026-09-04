import { describe, expect, it } from "vitest";
import { validateTransferSelection } from "../transfer/usage-policy.js";

const member = { id: "user-1", plan: "member" };
const file = (size, name = "belge.pdf") => new File([new Uint8Array(size)], name);

describe("VaultDrop kullanım limitleri", () => {
  it("oturumu olmayan kullanıcının Şifreli Paket dışındaki aktarım seçimini reddeder", () => {
    expect(() => validateTransferSelection([file(1)], { method: "qr_video", user: null }))
      .toThrow("Aktarım için giriş yapmalısınız.");
  });

  it("üyeye en fazla 15 dosya ve toplam 50 MiB verir", () => {
    const files = [file(30 * 1024 * 1024), file(20 * 1024 * 1024)];
    expect(validateTransferSelection(files, {
      method: "secure_package",
      user: member,
    })).toHaveLength(2);
  });

  it("üyenin toplam 50 MiB aşımını reddeder", () => {
    const files = [file(30 * 1024 * 1024), file(20 * 1024 * 1024 + 1)];
    expect(() => validateTransferSelection(files, {
      method: "secure_package",
      user: member,
    })).toThrow("VaultDrop paketi için toplam boyut en fazla 50 MiB olabilir.");
  });

  it("misafire tek dosya ve toplam 10 MiB verir", () => {
    expect(validateTransferSelection([file(10 * 1024 * 1024)], {
      method: "secure_package",
      user: null,
    })).toHaveLength(1);
  });

  it("misafirin ikinci dosyasını ve 10 MiB aşımını reddeder", () => {
    expect(() => validateTransferSelection([file(1), file(1)], {
      method: "secure_package",
      user: null,
    })).toThrow("Misafir kullanımında tek dosya");
    expect(() => validateTransferSelection([file(10 * 1024 * 1024 + 1)], {
      method: "secure_package",
      user: null,
    })).toThrow("en fazla 10 MiB");
  });

  it("QR Video toplamını 15 MiB ile sınırlar", () => {
    expect(() => validateTransferSelection([file(8 * 1024 * 1024), file(7 * 1024 * 1024 + 1)], { method: "qr_video", user: member }))
      .toThrow("QR Video için toplam boyut en fazla 15 MiB olabilir.");
  });

  it("QR Video seçimini de oturum olmadan reddeder", () => {
    expect(() => validateTransferSelection([file(1), file(1)], { method: "qr_video", user: null }))
      .toThrow("Aktarım için giriş yapmalısınız.");
  });

  it("Canlı QR yönteminde üyeler için de tek dosya zorunludur", () => {
    expect(() => validateTransferSelection([file(1), file(1)], { method: "live_qr", user: member }))
      .toThrow("Canlı QR yalnızca tek dosya destekler.");
  });

  it("Canlı QR için 2 MiB dosyayı kabul eder", () => {
    expect(validateTransferSelection([file(2 * 1024 * 1024)], {
      method: "live_qr",
      user: member,
    })).toHaveLength(1);
  });

  it("Canlı QR için 2 MiB + 1 byte dosyayı alternatif önerisiyle reddeder", () => {
    expect(() => validateTransferSelection([file((2 * 1024 * 1024) + 1)], {
      method: "live_qr",
      user: member,
    })).toThrow("Canlı QR en fazla 2 MiB destekler. Daha büyük dosyalar için Yakındaki Cihazlar veya VaultDrop kullanın.");
  });
});

describe("Yakındaki Cihazlar kullanım limitleri", () => {
  it("tek dosyada 100 MiB kabul eder", () => {
    expect(validateTransferSelection([{ size: 100 * 1024 * 1024 }], {
      method: "nearby", user: member,
    })).toHaveLength(1);
  });

  it("ikinci dosyayı ve 100 MiB aşımını reddeder", () => {
    expect(() => validateTransferSelection([{ size: 1 }, { size: 1 }], {
      method: "nearby", user: member,
    })).toThrow("Yakındaki Cihazlar yalnızca tek dosya destekler.");
    expect(() => validateTransferSelection([{ size: 100 * 1024 * 1024 + 1 }], {
      method: "nearby", user: member,
    })).toThrow("Yakındaki Cihazlar en fazla 100 MiB destekler.");
  });
});
