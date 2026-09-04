import { describe, expect, it } from "vitest";
import { encodeFileToFrames, parseFrame } from "../protocol";
import { MAX_FRAME_COUNT } from "../protocol/frame-v3";
import { createReceiveSession } from "../transfer/receive-session";

describe("alım oturumu", () => {
  it("tekrarlanan kareyi bir kez sayar", () => {
    const session = createReceiveSession();

    expect(session.accept(legacyFrame({ index: 0, total: 2 }))).toEqual({ accepted: true });
    expect(session.accept(legacyFrame({ index: 0, total: 2 }))).toEqual({
      accepted: false,
      reason: "duplicate",
    });
    expect(session.progress()).toEqual({ collected: 1, total: 2 });
  });

  it("aktif oturuma başka aktarımın karesini karıştırmaz", () => {
    const session = createReceiveSession();
    session.accept(legacyFrame({ transferId: "first", index: 0, total: 2 }));

    expect(
      session.accept(legacyFrame({ transferId: "second", index: 1, total: 2 })),
    ).toEqual({ accepted: false, reason: "different-transfer" });
    expect(session.progress()).toEqual({ collected: 1, total: 2 });
  });

  it.each([
    ["toplam kare", { total: 3 }],
    ["dosya adı", { name: "baska.txt" }],
    ["MIME türü", { mime: "application/octet-stream" }],
    ["dosya boyutu", { size: 99 }],
    ["sıkıştırma bilgisi", { isCompressed: true }],
  ])("aynı aktarımda çelişen %s bilgisini reddeder", (_label, conflictingFields) => {
    const session = createReceiveSession();
    session.accept(legacyFrame({ index: 0, total: 2 }));

    expect(session.accept(legacyFrame({ index: 1, total: 2, ...conflictingFields }))).toEqual({
      accepted: false,
      reason: "metadata-mismatch",
    });
    expect(session.progress()).toEqual({ collected: 1, total: 2 });
  });

  it("QRT3 parçalarını sıra dışı geliş sırasından bağımsız birleştirir", () => {
    const session = createReceiveSession();

    session.accept(v3Frame({ index: 2, total: 3, data: new Uint8Array([5, 6]) }));
    session.accept(v3Frame({ index: 0, total: 3, data: new Uint8Array([1, 2]) }));
    session.accept(v3Frame({ index: 1, total: 3, data: new Uint8Array([3, 4]) }));

    expect(session.getState()).toBe("complete");
    expect(session.assemble()).toEqual({
      bytes: new Uint8Array([1, 2, 3, 4, 5, 6]),
      metadata: {
        protocolVersion: "QRT3",
        transferId: "abc123def456",
        total: 3,
      },
    });
  });

  it("eksik parçalar varken birleştirme yapmaz", () => {
    const session = createReceiveSession();
    session.accept(legacyFrame({ index: 0, total: 2 }));

    expect(session.getState()).toBe("collecting");
    expect(session.assemble()).toBeNull();
  });

  it("güvenli sınırı aşan legacy toplam kare sayısıyla oturum başlatmaz", () => {
    const session = createReceiveSession();

    expect(
      session.accept(
        legacyFrame({
          total: MAX_FRAME_COUNT + 1,
          size: 0,
          data: new Uint8Array(),
        }),
      ),
    ).toEqual({ accepted: false, reason: "invalid-frame" });
    expect(session.getState()).toBe("idle");
    expect(session.progress()).toEqual({ collected: 0, total: 0 });
  });

  it("kabul edilen küçük view verisini backing buffer'dan bağımsız saklar", () => {
    const backing = new Uint8Array([5, 6, 7, 8]);
    const view = backing.subarray(1, 3);
    const session = createReceiveSession();

    expect(session.accept(v3Frame({ data: view }))).toEqual({ accepted: true });
    backing[1] = 99;
    backing[2] = 88;

    expect(session.assemble()?.bytes).toEqual(new Uint8Array([6, 7]));
  });

  it("metadata boyutu sınırı aşarsa kareyi eklemeden başarısız olur", () => {
    const session = createReceiveSession({ maxBytes: 3 });

    expect(session.accept(legacyFrame({ size: 4 }))).toEqual({
      accepted: false,
      reason: "size-limit",
    });
    expect(session.getState()).toBe("failed");
    expect(session.progress()).toEqual({ collected: 0, total: 0 });
  });

  it("toplanan parça verisi sınırı aşarsa son kareyi eklemeden başarısız olur", () => {
    const session = createReceiveSession({ maxBytes: 3 });
    expect(
      session.accept(
        v3Frame({ index: 0, total: 2, data: new Uint8Array([1, 2]) }),
      ),
    ).toEqual({ accepted: true });

    expect(
      session.accept(
        v3Frame({ index: 1, total: 2, data: new Uint8Array([3, 4]) }),
      ),
    ).toEqual({ accepted: false, reason: "size-limit" });
    expect(session.getState()).toBe("failed");
    expect(session.progress()).toEqual({ collected: 1, total: 2 });
    expect(session.assemble()).toBeNull();
    expect(session.accept(v3Frame({ index: 1, total: 2 }))).toEqual({
      accepted: false,
      reason: "session-failed",
    });
  });

  it("sıfırlama başarısız oturumu temizleyip yeni aktarıma izin verir", () => {
    const session = createReceiveSession({ maxBytes: 3 });
    session.accept(legacyFrame({ size: 4 }));

    session.reset();

    expect(session.getState()).toBe("idle");
    expect(session.getMetadata()).toBeNull();
    expect(session.progress()).toEqual({ collected: 0, total: 0 });
    expect(session.accept(legacyFrame({ size: 3 }))).toEqual({ accepted: true });
  });

  it.each([
    null,
    {},
    legacyFrame({ transferId: "" }),
    legacyFrame({ index: -1 }),
    legacyFrame({ index: 2, total: 2 }),
    legacyFrame({ total: 0 }),
    legacyFrame({ data: [1, 2] }),
    v3Frame({ payloadSize: 99 }),
  ])("bozuk kareyi reddedip boş oturumu başlatmaz", (malformedFrame) => {
    const session = createReceiveSession();

    expect(session.accept(malformedFrame)).toEqual({ accepted: false, reason: "invalid-frame" });
    expect(session.getState()).toBe("idle");
    expect(session.progress()).toEqual({ collected: 0, total: 0 });
  });

  it("sıkıştırılmış QRT2 karelerini özgün byte dizisine geri döndürür", () => {
    const original = new TextEncoder().encode("belge aktarımı ".repeat(100));
    const file = new File([original], "kanıt.txt", { type: "text/plain" });
    const encoded = encodeFileToFrames(file, original.buffer, { chunkBytes: 16 });
    const frames = encoded.frames.map(parseFrame);
    const session = createReceiveSession();

    expect(encoded.isCompressed).toBe(true);
    for (const parsedFrame of frames.reverse()) {
      expect(session.accept(parsedFrame)).toEqual({ accepted: true });
    }

    const assembled = session.assemble();
    expect(Array.from(assembled?.bytes ?? [])).toEqual(Array.from(original));
    expect(assembled?.metadata).toEqual({
      transferId: encoded.transferId,
      total: encoded.total,
      name: "kanıt.txt",
      mime: "text/plain",
      size: original.length,
      isCompressed: true,
    });
  });

  it("legacy çıktı boyutu metadata ile uyuşmazsa oturumu başarısız yapar", () => {
    const session = createReceiveSession();
    session.accept(legacyFrame({ size: 2, data: new Uint8Array([1]) }));

    expect(session.assemble()).toBeNull();
    expect(session.getState()).toBe("failed");
  });
});

function legacyFrame(overrides = {}) {
  return {
    transferId: "legacy-transfer",
    index: 0,
    total: 1,
    name: "belge.txt",
    mime: "text/plain",
    size: 1,
    isCompressed: false,
    data: new Uint8Array([1]),
    ...overrides,
  };
}

function v3Frame(overrides = {}) {
  const data = overrides.data ?? new Uint8Array([1]);
  return {
    protocolVersion: "QRT3",
    transferId: "abc123def456",
    index: 0,
    total: 1,
    payloadSize: data.length,
    chunkCrc32: "00000000",
    data,
    ...overrides,
  };
}
