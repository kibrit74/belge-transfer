import { afterEach, describe, expect, it, vi } from "vitest";
import { pureJsSha256, sha256Base64Url } from "../protocol/hash.js";

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("SHA-256 pure JS and WebCrypto compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("boş veri için doğru SHA-256 verir", () => {
    const bytes = new Uint8Array(0);
    const hex = toHex(pureJsSha256(bytes));
    expect(hex).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("'abc' metni için doğru SHA-256 verir", () => {
    const bytes = new TextEncoder().encode("abc");
    const hex = toHex(pureJsSha256(bytes));
    expect(hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("55 byte üzeri uzun metinler için doğru SHA-256 verir", async () => {
    const text = "abcdbcdecdefdefgefghfghighijhijkijklmklmnlmnomnopq364edfb4e56";
    const bytes = new TextEncoder().encode(text);
    const pureHex = toHex(pureJsSha256(bytes));
    const webCryptoBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const webCryptoHex = toHex(new Uint8Array(webCryptoBuffer));

    expect(pureHex).toBe(webCryptoHex);
  });

  it("rastgele 250 KB veri için WebCrypto ile pureJsSha256 birebir eşleşir", async () => {
    const bytes = new Uint8Array(250 * 1024);
    for (let i = 0; i < bytes.length; i += 65536) {
      const chunk = bytes.subarray(i, Math.min(i + 65536, bytes.length));
      crypto.getRandomValues(chunk);
    }
    const pureHex = toHex(pureJsSha256(bytes));

    const webCryptoBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const webCryptoHex = toHex(new Uint8Array(webCryptoBuffer));

    expect(pureHex).toBe(webCryptoHex);
  });

  it("WebCrypto yanıt vermediğinde saf JS hesabına geçer", async () => {
    const bytes = new Uint8Array([97, 98, 99]);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn(() => new Promise(() => {})),
      },
    });

    const result = await Promise.race([
      sha256Base64Url(bytes),
      new Promise((resolve) => setTimeout(() => resolve("zaman-aşımı"), 500)),
    ]);

    expect(result).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });
});
