import { describe, expect, it } from "vitest";
import {
  assertContainerSize,
  assertEncryptableInputSize,
  decryptContainer,
  encryptFile,
  encryptPreparedFile,
  MAX_CONTAINER_BYTES,
  MAX_ENCRYPTED_INPUT_BYTES,
} from "../crypto/encrypted-container.js";
import { fromBase64Url, toBase64Url } from "../protocol/base64url.js";
import { MAX_INPUT_BYTES } from "../protocol/frame-v3.js";
import { sha256Base64Url } from "../protocol/hash.js";
import { prepareTransferPayload } from "../transfer/payload-compression.js";

const MAGIC = new TextEncoder().encode("BTA1");
const VERSION = 1;
const HEADER_BYTES = 17;
const itWithResizableArrayBuffer =
  typeof ArrayBuffer.prototype.resize === "function" ? it : it.skip;

describe("BTA1 şifreli paket", () => {
  it("Unicode dosya adını, türünü ve byte'ları değiştirmeden geri açar", async () => {
    const original = crypto.getRandomValues(new Uint8Array(4096));
    const file = new File([original], "İstanbul-çözüm-📄.txt", {
      type: "text/plain;charset=utf-8",
    });

    const encrypted = await encryptFile(file);
    const decrypted = await decryptContainer(
      await encrypted.blob.arrayBuffer(),
      encrypted.keyText,
    );

    expect(decrypted.file.name).toBe(file.name);
    expect(decrypted.file.type).toBe(file.type);
    expect(Array.from(new Uint8Array(await decrypted.file.arrayBuffer()))).toEqual(
      Array.from(original),
    );
    expect(decrypted.sha256).toBe(encrypted.sha256);
  });

  it("BTA1 dış başlığını ve güvenli paylaşım alanlarını üretir", async () => {
    const file = new File(["çok gizli belge"], "dava-dosyası.txt", { type: "text/plain" });
    const encrypted = await encryptFile(file);
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer());

    expect(Array.from(bytes.slice(0, 4))).toEqual(Array.from(MAGIC));
    expect(bytes[4]).toBe(VERSION);
    expect(bytes.length).toBeGreaterThan(HEADER_BYTES + file.size);
    expect(encrypted.blob.type).toBe("application/vnd.vaultdrop.package");
    expect(encrypted.keyText).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(encrypted.transferId).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(new TextDecoder().decode(bytes)).not.toContain(file.name);
  });

  itWithResizableArrayBuffer(
    "çağrı başladıktan sonra büyütülen ArrayBuffer'ın başlangıç boyutunu açar",
    async () => {
      const original = crypto.getRandomValues(new Uint8Array(256));
      const encrypted = await encryptFile(new File([original], "sabit.bin"));
      const encryptedBytes = new Uint8Array(await encrypted.blob.arrayBuffer());
      const initialLength = encryptedBytes.byteLength;
      const resizableBuffer = new ArrayBuffer(initialLength, {
        maxByteLength: initialLength + 1,
      });
      new Uint8Array(resizableBuffer).set(encryptedBytes);

      const decryption = decryptContainer(resizableBuffer, encrypted.keyText);
      resizableBuffer.resize(initialLength + 1);
      new Uint8Array(resizableBuffer)[initialLength] = 0xff;
      const decrypted = await decryption;

      expect(Array.from(new Uint8Array(await decrypted.file.arrayBuffer()))).toEqual(
        Array.from(original),
      );
    },
  );

  it("yanlış anahtarı ayrıntı sızdırmadan reddeder", async () => {
    const encrypted = await encryptFile(new File(["gizli"], "delil.txt"));
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));

    await expect(
      decryptContainer(await encrypted.blob.arrayBuffer(), toBase64Url(wrongKey)),
    ).rejects.toMatchObject({
      code: "INVALID_KEY",
      message: "Anahtar geçersiz veya paket bozuk.",
    });
  });

  it.each([
    ["bozuk biçim", "geçersiz!"],
    ["yanlış uzunluk", toBase64Url(new Uint8Array(31))],
    ["dolgulu base64url", `${toBase64Url(new Uint8Array(32))}=`],
  ])("%s anahtarı INVALID_KEY ile reddeder", async (_caseName, keyText) => {
    const encrypted = await encryptFile(new File(["gizli"], "delil.txt"));

    await expect(
      decryptContainer(await encrypted.blob.arrayBuffer(), keyText),
    ).rejects.toMatchObject({ code: "INVALID_KEY" });
  });

  it("ciphertext değiştirildiğinde yanlış anahtarla aynı hatayı verir", async () => {
    const encrypted = await encryptFile(new File(["gizli"], "delil.txt"));
    const tampered = new Uint8Array(await encrypted.blob.arrayBuffer());
    tampered[tampered.length - 1] ^= 1;

    await expect(decryptContainer(tampered, encrypted.keyText)).rejects.toMatchObject({
      code: "INVALID_KEY",
      message: "Anahtar geçersiz veya paket bozuk.",
    });
  });

  it("yanlış sihirli değeri INVALID_MAGIC ile reddeder", async () => {
    const encrypted = await encryptFile(new File(["gizli"], "delil.txt"));
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer());
    bytes[0] ^= 1;

    await expect(decryptContainer(bytes, encrypted.keyText)).rejects.toMatchObject({
      code: "INVALID_MAGIC",
    });
  });

  it("desteklenmeyen sürümü UNSUPPORTED_VERSION ile reddeder", async () => {
    const encrypted = await encryptFile(new File(["gizli"], "delil.txt"));
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer());
    bytes[4] = 3;

    await expect(decryptContainer(bytes, encrypted.keyText)).rejects.toMatchObject({
      code: "UNSUPPORTED_VERSION",
    });
  });

  it.each([new Uint8Array(), MAGIC, new Uint8Array(16)])(
    "kesilmiş yapıyı INVALID_MAGIC ile reddeder",
    async (truncated) => {
      await expect(
        decryptContainer(truncated, toBase64Url(new Uint8Array(32))),
      ).rejects.toMatchObject({ code: "INVALID_MAGIC" });
    },
  );

  it("sınırlı ZIP üst yükünü kabul eder, daha büyüğünü şifrelemeden reddeder", () => {
    expect(() => assertEncryptableInputSize(MAX_INPUT_BYTES + 1)).not.toThrow();
    expect(() => assertEncryptableInputSize(MAX_ENCRYPTED_INPUT_BYTES + 1)).toThrow(
      "Paket veya dosya izin verilen boyut sınırını aşıyor.",
    );
  });

  it("açma tarafında da sınırlı paket üst sınırını korur", () => {
    expect(() => assertContainerSize(MAX_CONTAINER_BYTES)).not.toThrow();
    expect(() => assertContainerSize(MAX_CONTAINER_BYTES + 1)).toThrow(
      "Paket veya dosya izin verilen boyut sınırını aşıyor.",
    );
  });

  it.each(["geçmiş-paket.bta", "geçmiş-paket.vdrop"])("dondurulmuş eski BTA1 örneğini %s adıyla açar", async (fileName) => {
    const packageFile = new File(
      [fromBase64Url("QlRBMQEgISIjJCUmJygpKivSOqYCF7p0b3cZYPTjdJGesSqVseHpG5oZhAk8PfIqK1mskX3-QBfgNokL6iwmb6SDQ4Ksth5eCLQHXSd9iyb_q06sOaOhx6ypOtBCiDhXI5PVUVTBv7ZxnyqzE1Qs1LJlG3EUvwXosvD-8TPpoKF0Pdf_LbOj7VkRwydjkODjS0XEG_dDmnbDABtkfdQQ73yBhENvXsYuGtk")],
      fileName,
      { type: "application/vnd.vaultdrop.package" },
    );
    const result = await decryptContainer(
      await packageFile.arrayBuffer(),
      "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
    );

    expect(result.file.name).toBe("legacy-fixture.txt");
    expect(result.file.type).toBe("text/plain");
    await expect(result.file.text()).resolves.toBe("BTA1 legacy fixture");
    expect(result.sha256).toBe("P9e3enBFBbPvD0oPeq9N0JngO_BwAvA9bU4JVlgMFpo");
  });

  it("BTA1 metadata içindeki yol adını güvenli File.name ile açar", async () => {
    const fileBytes = new Uint8Array([1, 2, 3]);
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const container = await makeContainer(
      {
        name: "..\\gizli.txt",
        type: "text/plain",
        size: fileBytes.length,
        sha256: await sha256Base64Url(fileBytes),
      },
      fileBytes,
      keyBytes,
    );

    const result = await decryptContainer(container, toBase64Url(keyBytes));

    expect(result.file.name).toBe("gizli.txt");
  });

  it("16 KiB üzerindeki metadata bildirimini dilimlemeden reddeder", async () => {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const container = await makeContainer(
      { name: "a", type: "text/plain", size: 0, sha256: await sha256Base64Url(new Uint8Array()) },
      new Uint8Array(),
      keyBytes,
      16 * 1024 + 1,
    );

    await expect(decryptContainer(container, toBase64Url(keyBytes))).rejects.toMatchObject({
      code: "SIZE_LIMIT",
    });
  });

  it("metadata boyutu gerçek dosya boyutuyla uyuşmazsa HASH_MISMATCH verir", async () => {
    const fileBytes = new Uint8Array([0x6b, 0x61, 0x6e, 0xc4, 0xb1, 0x74]);
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const container = await makeContainer(
      {
        name: "kanıt.txt",
        type: "text/plain",
        size: fileBytes.length + 1,
        sha256: await sha256Base64Url(fileBytes),
      },
      fileBytes,
      keyBytes,
    );

    await expect(decryptContainer(container, toBase64Url(keyBytes))).rejects.toMatchObject({
      code: "HASH_MISMATCH",
    });
  });

  it("metadata özeti gerçek dosya özetiyle uyuşmazsa HASH_MISMATCH verir", async () => {
    const fileBytes = new Uint8Array([0x6b, 0x61, 0x6e, 0xc4, 0xb1, 0x74]);
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const container = await makeContainer(
      {
        name: "kanıt.txt",
        type: "text/plain",
        size: fileBytes.length,
        sha256: toBase64Url(new Uint8Array(32)),
      },
      fileBytes,
      keyBytes,
    );

    await expect(decryptContainer(container, toBase64Url(keyBytes))).rejects.toMatchObject({
      code: "HASH_MISMATCH",
    });
  });
});

describe("BTA2 sıkıştırılmış şifreli paket", () => {
  it("tekrarlı not.txt verisini BTA2 olarak şifreleyip özgün metinle açar", async () => {
    const originalText = "Gizli not. ".repeat(2048);
    const file = new File([originalText], "not.txt", { type: "text/plain" });
    const originalBytes = Uint8Array.from(originalText, (character) => character.charCodeAt(0));
    const prepared = await prepareTransferPayload(originalBytes, {
      mimeType: file.type,
      fileName: file.name,
    });

    const encrypted = await encryptPreparedFile(file, prepared);
    const container = new Uint8Array(await encrypted.blob.arrayBuffer());
    const opened = await decryptContainer(container, encrypted.keyText);

    expect(container[4]).toBe(2);
    await expect(opened.file.text()).resolves.toBe(originalText);
  });

  it("sıkıştırılmış veriyi özgün ad, tür ve içerikle açar", async () => {
    const original = new Uint8Array(100 * 1024).fill(65);
    const file = new File([original], "İstanbul-belgesi.txt", { type: "text/plain" });
    const prepared = await prepareTransferPayload(original);

    const encrypted = await encryptPreparedFile(file, prepared);
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer());
    const opened = await decryptContainer(bytes, encrypted.keyText);

    expect(bytes[4]).toBe(2);
    expect(encrypted.blob.type).toBe("application/vnd.vaultdrop.package");
    expect(opened.file.name).toBe(file.name);
    expect(opened.file.type).toBe(file.type);
    expect(new Uint8Array(await opened.file.arrayBuffer())).toEqual(original);
    expect(opened.sha256).toBe(prepared.originalSha256);
    expect(opened.compression).toBe("zlib");
  });

  it("BTA2 metadata içindeki ayrılmış adı güvenli File.name ile açar", async () => {
    const fileBytes = new Uint8Array([4, 5, 6]);
    const sha256 = await sha256Base64Url(fileBytes);
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const container = await makeContainer(
      {
        name: "aux.pdf",
        type: "application/pdf",
        compression: "none",
        originalSize: fileBytes.length,
        storedSize: fileBytes.length,
        originalSha256: sha256,
        storedSha256: sha256,
      },
      fileBytes,
      keyBytes,
      undefined,
      2,
    );

    const result = await decryptContainer(container, toBase64Url(keyBytes));

    expect(result.file.name).toBe("indirilen-dosya.pdf");
  });

  it("encryptFile varsayılan olarak BTA1 üretmeye devam eder", async () => {
    const encrypted = await encryptFile(new File(["legacy"], "legacy.txt"));
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer());

    expect(bytes[4]).toBe(1);
  });

  it("saklanan veri özeti uyuşmazsa dosya üretmez", async () => {
    const original = new Uint8Array(4096).fill(9);
    const file = new File([original], "kanıt.bin");
    const prepared = await prepareTransferPayload(original);
    const encrypted = await encryptPreparedFile(file, {
      ...prepared,
      storedSha256: "A".repeat(43),
    });

    await expect(
      decryptContainer(await encrypted.blob.arrayBuffer(), encrypted.keyText),
    ).rejects.toMatchObject({ code: "HASH_MISMATCH" });
  });

  it("özgün veri özeti uyuşmazsa açılmış dosyayı döndürmez", async () => {
    const original = new Uint8Array(4096).fill(7);
    const file = new File([original], "delil.bin");
    const prepared = await prepareTransferPayload(original);
    const encrypted = await encryptPreparedFile(file, {
      ...prepared,
      originalSha256: "A".repeat(43),
    });

    await expect(
      decryptContainer(await encrypted.blob.arrayBuffer(), encrypted.keyText),
    ).rejects.toMatchObject({ code: "HASH_MISMATCH" });
  });

  it("beklenmeyen metadata alanı içeren doğrulanmış BTA2 paketini açmaz", async () => {
    const storedBytes = new Uint8Array([1, 2, 3, 4]);
    const sha256 = await sha256Base64Url(storedBytes);
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const container = await makeContainer(
      {
        name: "delil.bin",
        type: "application/octet-stream",
        compression: "none",
        originalSize: storedBytes.length,
        storedSize: storedBytes.length,
        originalSha256: sha256,
        storedSha256: sha256,
        unexpected: true,
      },
      storedBytes,
      keyBytes,
      undefined,
      2,
    );

    await expect(decryptContainer(container, toBase64Url(keyBytes))).rejects.toMatchObject({
      code: "INVALID_MAGIC",
    });
  });

  it.each([
    ["dosya boyutu", (prepared) => ({ ...prepared, originalSize: prepared.originalSize + 1 })],
    ["saklanan veri boyutu", (prepared) => ({ ...prepared, storedSize: prepared.storedSize + 1 })],
    ["sıkıştırma türü", (prepared) => ({ ...prepared, compression: "gzip" })],
    ["özgün veri özeti", (prepared) => ({ ...prepared, originalSha256: "A".repeat(42) })],
    ["saklanan veri özeti", (prepared) => ({ ...prepared, storedSha256: "A".repeat(42) })],
  ])("geçersiz %s ile hazırlanmış veriyi şifrelemez", async (_caseName, mutate) => {
    const original = new Uint8Array(128).fill(5);
    const file = new File([original], "hazır.bin");
    const prepared = await prepareTransferPayload(original);

    await expect(encryptPreparedFile(file, mutate(prepared))).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});

async function makeContainer(
  metadata,
  fileBytes,
  keyBytes,
  declaredMetadataLength,
  version = VERSION,
) {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const plaintext = new Uint8Array(4 + metadataBytes.length + fileBytes.length);
  new DataView(plaintext.buffer).setUint32(
    0,
    declaredMetadataLength ?? metadataBytes.length,
    false,
  );
  plaintext.set(metadataBytes, 4);
  plaintext.set(fileBytes, 4 + metadataBytes.length);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  const container = new Uint8Array(HEADER_BYTES + ciphertext.length);
  container.set(MAGIC, 0);
  container[4] = version;
  container.set(iv, 5);
  container.set(ciphertext, HEADER_BYTES);
  return container;
}
