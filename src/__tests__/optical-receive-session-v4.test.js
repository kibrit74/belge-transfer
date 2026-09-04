import { describe, expect, it } from "vitest";
import { createFountainEncoder } from "../optical/fountain.js";
import { createOpticalReceiveSession } from "../optical/receive-session-v4.js";

function bytes(length) {
  return Uint8Array.from({ length }, (_, index) => (index * 31) & 0xff);
}

function frame(metadata, symbol) {
  return {
    protocolVersion: "QRF1",
    ...metadata,
    ...symbol,
    payloadBytes: symbol.data.length,
    chunkCrc32: "00000000",
  };
}

describe("QRF1 alma oturumu", () => {
  it("kayıp ve tekrar içeren sembollerden SHA doğrulanmış baytları kurar", async () => {
    const input = bytes(32 * 1024);
    const encoder = await createFountainEncoder(input, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 256,
      emissionRatio: 1.5,
    });
    const session = createOpticalReceiveSession();
    const retained = encoder.symbols().filter((_, index) => index % 5 !== 0).reverse();

    for (const symbol of [...retained, retained[0]]) {
      session.accept(frame(encoder.metadata, symbol));
    }

    expect(session.getState()).toBe("complete");
    await expect(session.assemble()).resolves.toEqual({
      bytes: input,
      metadata: expect.objectContaining({
        protocolVersion: "QRF1",
        transferId: "Ab12Cd34Ef56",
      }),
    });
    expect(session.progress().duplicates).toBe(1);
  });

  it("başka aktarımı ve değişen üst bilgiyi kabul etmez", async () => {
    const encoder = await createFountainEncoder(bytes(1024), {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 256,
    });
    const session = createOpticalReceiveSession();
    const first = frame(encoder.metadata, encoder.symbol(0));

    expect(session.accept(first)).toEqual({ accepted: true });
    expect(session.accept({ ...first, transferId: "Zy98Xw76Vu54", symbolId: 1 })).toEqual({
      accepted: false,
      reason: "different-transfer",
    });
    expect(session.accept({ ...first, blockBytes: 700, symbolId: 1 })).toEqual({
      accepted: false,
      reason: "metadata-mismatch",
    });
  });

  it("yanlış bütünlük özetinde hiçbir bayt sunmaz", async () => {
    const input = bytes(1024);
    const encoder = await createFountainEncoder(input, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 256,
    });
    const session = createOpticalReceiveSession();

    for (const symbol of encoder.symbols()) {
      session.accept(frame({ ...encoder.metadata, sha256: "A".repeat(43) }, symbol));
    }

    await expect(session.assemble()).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
    expect(session.getState()).toBe("failed");
  });

  it("kurtarma dışa aktarımında anahtar ve dosya adı tutmaz", async () => {
    const encoder = await createFountainEncoder(bytes(1024), {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 256,
    });
    const session = createOpticalReceiveSession();
    session.accept(frame(encoder.metadata, encoder.symbol(0)));

    const serialized = JSON.stringify(session.exportRecovery());
    expect(serialized).not.toContain("keyText");
    expect(serialized).not.toContain("fileName");
    expect(serialized).not.toContain("mime");
  });
});
