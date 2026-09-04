import { describe, expect, it } from "vitest";
import { decryptContainer, encryptFile } from "../crypto/encrypted-container.js";
import { encodeFramesV3 } from "../protocol/frame-v3.js";
import { parseFrame } from "../protocol/index.js";
import { createReceiveSession } from "../transfer/receive-session.js";

describe("uçtan uca güvenli aktarım", () => {
  it("şifreleme ve QR aktarımı sonunda özgün byte'ları verir", async () => {
    const original = crypto.getRandomValues(new Uint8Array(32 * 1024));
    const file = new File([original], "örnek-delil.pdf", { type: "application/pdf" });

    const encrypted = await encryptFile(file);
    const encoded = await encodeFramesV3({
      bytes: new Uint8Array(await encrypted.blob.arrayBuffer()),
      transferId: encrypted.transferId,
    });

    const session = createReceiveSession();
    for (const text of [...encoded.frames].reverse()) {
      session.accept(parseFrame(text));
    }

    const assembled = session.assemble();
    expect(assembled?.bytes).toBeInstanceOf(Uint8Array);

    const decrypted = await decryptContainer(assembled.bytes, encrypted.keyText);
    expect(decrypted.file.name).toBe(file.name);
    expect(decrypted.file.type).toBe(file.type);
    expect(Array.from(new Uint8Array(await decrypted.file.arrayBuffer()))).toEqual(
      Array.from(original),
    );
    expect(decrypted.sha256).toBe(encrypted.sha256);
  });
});
