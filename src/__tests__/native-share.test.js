import { afterEach, describe, expect, it, vi } from "vitest";
import { shareFile, shareLink } from "../transfer/native-share.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("telefon paylaşım menüsü", () => {
  it("bağlantı paylaşımı destekleniyorsa yerel menüyü açar", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });

    await expect(shareLink({ title: "VaultDrop", text: "Güvenli dosya", url: "https://vault.test/al/1" }))
      .resolves.toEqual({ shared: true });
    expect(share).toHaveBeenCalledWith({
      title: "VaultDrop",
      text: "Güvenli dosya",
      url: "https://vault.test/al/1",
    });
  });

  it("dosya paylaşımı desteklenmiyorsa güvenli yedek sonucu döndürür", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn() });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    const file = new File(["x"], "vaultdrop.bta");

    await expect(shareFile({ file, title: "VaultDrop" }))
      .resolves.toEqual({ shared: false, reason: "unsupported" });
  });

  it("tarayıcı paylaşım iznini reddederse indirme yedeğine düşer", async () => {
    const permissionError = new DOMException("Permission denied", "NotAllowedError");
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(permissionError),
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    const file = new File(["video"], "vaultdrop.webm", { type: "video/webm" });

    await expect(shareFile({ file, title: "VaultDrop QR Video" }))
      .resolves.toEqual({ shared: false, reason: "denied" });
  });
});
