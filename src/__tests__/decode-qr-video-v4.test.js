import { describe, expect, it, vi } from "vitest";
import { encodeFramesV3 } from "../protocol/frame-v3.js";
import { createFountainEncoder } from "../optical/fountain.js";
import { encodeFrameV4 } from "../optical/frame-v4.js";
import {
  FAST_SCAN_STEP_SECONDS,
  decodeQrVideo,
  getVideoQrRegions,
} from "../video/decode-qr-video.js";

describe("QRF1 video bölge seçimi", () => {
  it("24 FPS videonun her zaman dilimini tarar", () => {
    expect(FAST_SCAN_STEP_SECONDS).toBeCloseTo(1 / 24, 8);
  });

  it("1920x1080 videoda iki QR bölgesini ayrı tarar", () => {
    expect(getVideoQrRegions(1920, 1080)).toEqual([
      { x: 60, y: 90, width: 900, height: 900 },
      { x: 960, y: 90, width: 900, height: 900 },
    ]);
  });

  it("720p uyumlu videoda tek tam yükseklik bölgesi tarar", () => {
    expect(getVideoQrRegions(1280, 720)).toEqual([
      { x: 280, y: 0, width: 720, height: 720 },
    ]);
  });

  it("eksik QRF1 taramasını kaydeder ve sonraki denemede kaldığı yerden tamamlar", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const encoder = await createFountainEncoder(bytes, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 2,
      emissionRatio: 1,
    });
    const frames = encoder.symbols().map((symbol) => encodeFrameV4(encoder.metadata, symbol));
    let recoveryRecord;
    const recoveryStore = {
      saveIncoming: vi.fn(async (record) => { recoveryRecord = structuredClone(record); }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await expect(decodeQrVideo(new File(["video"], "eksik.webm"), {}, undefined, {
      frameTexts: [frames[0]],
      recoveryStore,
    })).rejects.toMatchObject({ code: "INCOMPLETE" });

    expect(recoveryRecord).toMatchObject({
      id: "incoming:Ab12Cd34Ef56",
      direction: "incoming",
      transferId: "Ab12Cd34Ef56",
    });
    expect(recoveryRecord.symbols).toHaveLength(1);
    const result = await decodeQrVideo(new File(["video"], "devam.webm"), {}, undefined, {
      frameTexts: frames.slice(1),
      recoveryStore,
      recoveryRecord,
    });

    expect(result).toEqual(bytes);
    expect(recoveryStore.delete).toHaveBeenCalledWith("incoming:Ab12Cd34Ef56");
  });
});

describe("renkli video profil yönlendirmesi", () => {
  it("CRF2 probu true ise standart QR decoder yerine renkli decoderı çağırır", async () => {
    const input = new Uint8Array(380).fill(6);
    const encoder = await createFountainEncoder(input, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 380,
      emissionRatio: 1.30,
    });
    const frame = {
      ...encoder.metadata,
      protocolVersion: "CRF2",
      symbolId: 0,
      data: encoder.symbol(0).data,
    };
    const standardDecodeImage = vi.fn();
    const colorWorkerClient = {
      decodeImage: vi.fn()
        .mockResolvedValueOnce({ frame: { protocolVersion: "CRF2" } })
        .mockResolvedValueOnce({ frame }),
      disposeSession: vi.fn(),
      terminate: vi.fn(),
    };
    const createColorWorkerClient = vi.fn(() => colorWorkerClient);
    const restoreDom = mockRoutingVideoDom();

    try {
      const bytes = await decodeQrVideo(new File(["video"], "renkli.webm"), {}, null, {
        decodeImage: standardDecodeImage,
        createColorWorkerClient,
        colorSessionId: "color-route",
      });

      expect(bytes).toEqual(input);
      expect(createColorWorkerClient).toHaveBeenCalledTimes(1);
      expect(standardDecodeImage).not.toHaveBeenCalled();
      expect(colorWorkerClient.disposeSession).toHaveBeenCalledWith("color-route");
      expect(colorWorkerClient.terminate).toHaveBeenCalledTimes(1);
    } finally {
      restoreDom();
    }
  });

  it("renk probu false ise workerı kapatıp yalnız standart çözücüyü çalıştırır", async () => {
    const standardBytes = new Uint8Array([1, 2, 3, 4]);
    const encoded = await encodeFramesV3({
      bytes: standardBytes,
      transferId: "Ab12Cd34Ef56",
      chunkBytes: 4,
    });
    const lifecycle = [];
    const colorWorkerClient = {
      decodeImage: vi.fn(async () => ({ frame: null })),
      disposeSession: vi.fn(() => lifecycle.push("dispose")),
      terminate: vi.fn(() => lifecycle.push("terminate")),
    };
    const standardDecodeImage = vi.fn(() => {
      lifecycle.push("standard");
      return encoded.frames[0];
    });
    const restoreDom = mockRoutingVideoDom({ duration: 1 });

    try {
      await expect(decodeQrVideo(new File(["video"], "standart.webm"), {}, null, {
        decodeImage: standardDecodeImage,
        createColorWorkerClient: () => colorWorkerClient,
        colorSessionId: "color-route",
      })).resolves.toEqual(standardBytes);

      expect(colorWorkerClient.decodeImage).toHaveBeenCalledTimes(6);
      expect(lifecycle.slice(0, 3)).toEqual(["dispose", "terminate", "standard"]);
    } finally {
      restoreDom();
    }
  });

  it("renk worker fabrikası SecurityError verirse standart çözücüyle devam eder", async () => {
    const standardBytes = new Uint8Array([4, 3, 2, 1]);
    const encoded = await encodeFramesV3({
      bytes: standardBytes,
      transferId: "Ab12Cd34Ef56",
      chunkBytes: 4,
    });
    const standardDecodeImage = vi.fn(() => encoded.frames[0]);
    const createColorWorkerClient = vi.fn(() => {
      throw new DOMException("Worker yüklenemedi.", "SecurityError");
    });
    const restoreDom = mockRoutingVideoDom();

    try {
      await expect(decodeQrVideo(new File(["video"], "standart.webm"), {}, null, {
        decodeImage: standardDecodeImage,
        createColorWorkerClient,
      })).resolves.toEqual(standardBytes);

      expect(createColorWorkerClient).toHaveBeenCalledTimes(1);
      expect(standardDecodeImage).toHaveBeenCalled();
    } finally {
      restoreDom();
    }
  });

  it.each(["ABORTED", "VIDEO_READ_ERROR"])(
    "renk worker fabrikası %s verirse hatayı korur ve standart çözücüyü başlatmaz",
    async (code) => {
      const factoryError = Object.assign(new Error(`Fabrika hatası: ${code}`), { code });
      const standardDecodeImage = vi.fn();
      const createColorWorkerClient = vi.fn(() => {
        throw factoryError;
      });
      const restoreDom = mockRoutingVideoDom();

      try {
        await expect(decodeQrVideo(new File(["video"], "aktarim.webm"), {}, null, {
          decodeImage: standardDecodeImage,
          createColorWorkerClient,
        })).rejects.toBe(factoryError);

        expect(standardDecodeImage).not.toHaveBeenCalled();
      } finally {
        restoreDom();
      }
    },
  );

  it("renk oturumu temizliği hata verse de sahip olunan workerı sonlandırır", async () => {
    const colorWorkerClient = {
      decodeImage: vi.fn(async () => ({ frame: null })),
      disposeSession: vi.fn(() => {
        throw new Error("Oturum temizlenemedi.");
      }),
      terminate: vi.fn(),
    };
    const restoreDom = mockRoutingVideoDom({ duration: 0.25 });

    try {
      await expect(decodeQrVideo(new File(["video"], "standart.webm"), {}, null, {
        decodeImage: vi.fn(() => null),
        createColorWorkerClient: () => colorWorkerClient,
        colorSessionId: "cleanup-session",
      })).rejects.toMatchObject({ code: "INCOMPLETE" });

      expect(colorWorkerClient.disposeSession).toHaveBeenCalledWith("cleanup-session");
      expect(colorWorkerClient.terminate).toHaveBeenCalledTimes(1);
    } finally {
      restoreDom();
    }
  });

  it("renk probu worker hatasıyla reddedilirse workerı temizleyip standart çözücüyle devam eder", async () => {
    const standardBytes = new Uint8Array([9, 8, 7, 6]);
    const encoded = await encodeFramesV3({
      bytes: standardBytes,
      transferId: "Ab12Cd34Ef56",
      chunkBytes: 4,
    });
    const lifecycle = [];
    const colorWorkerClient = {
      decodeImage: vi.fn().mockRejectedValue(Object.assign(
        new Error("Worker yanıt vermedi."),
        { code: "WORKER_ERROR" },
      )),
      disposeSession: vi.fn(() => lifecycle.push("dispose")),
      terminate: vi.fn(() => lifecycle.push("terminate")),
    };
    const standardDecodeImage = vi.fn(() => {
      lifecycle.push("standard");
      return encoded.frames[0];
    });
    const restoreDom = mockRoutingVideoDom();

    try {
      await expect(decodeQrVideo(new File(["video"], "standart.webm"), {}, null, {
        decodeImage: standardDecodeImage,
        createColorWorkerClient: () => colorWorkerClient,
        colorSessionId: "failed-probe",
      })).resolves.toEqual(standardBytes);

      expect(colorWorkerClient.disposeSession).toHaveBeenCalledWith("failed-probe");
      expect(lifecycle.slice(0, 3)).toEqual(["dispose", "terminate", "standard"]);
      expect(colorWorkerClient.decodeImage).toHaveBeenCalledTimes(1);
    } finally {
      restoreDom();
    }
  });

  it("renk worker yanıtı beklenirken abort olursa geç yanıtı yok sayıp kaynakları kapatır", async () => {
    const input = new Uint8Array(380).fill(7);
    const encoder = await createFountainEncoder(input, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 380,
      emissionRatio: 1.30,
    });
    const lateFrame = {
      ...encoder.metadata,
      protocolVersion: "CRF2",
      symbolId: 0,
      data: encoder.symbol(0).data,
    };
    const deferred = createDeferred();
    const colorWorkerClient = {
      decodeImage: vi.fn()
        .mockResolvedValueOnce({ frame: { protocolVersion: "CRF2" } })
        .mockImplementationOnce(() => deferred.promise),
      disposeSession: vi.fn(),
      terminate: vi.fn(),
    };
    const controller = new AbortController();
    const onProgress = vi.fn();
    const onScanProgress = vi.fn();
    const restoreDom = mockRoutingVideoDom();

    try {
      const decoding = decodeQrVideo(
        new File(["video"], "renkli.webm"),
        { onProgress, onScanProgress },
        controller.signal,
        {
          createColorWorkerClient: () => colorWorkerClient,
          colorSessionId: "abort-session",
        },
      );
      await vi.waitFor(() => {
        expect(colorWorkerClient.decodeImage).toHaveBeenCalledTimes(2);
      });

      controller.abort();
      await expect(decoding).rejects.toMatchObject({ code: "ABORTED" });
      expect(colorWorkerClient.disposeSession).toHaveBeenCalledWith("abort-session");
      expect(colorWorkerClient.terminate).toHaveBeenCalledTimes(1);

      deferred.resolve({ frame: lateFrame });
      await Promise.resolve();
      await Promise.resolve();
      expect(onProgress).not.toHaveBeenCalled();
      expect(onScanProgress).not.toHaveBeenCalled();
    } finally {
      restoreDom();
    }
  });
});

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockRoutingVideoDom({ duration = 0.25 } = {}) {
  const originalCreateElement = document.createElement.bind(document);
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  URL.createObjectURL = vi.fn(() => "blob:routing-video");
  URL.revokeObjectURL = vi.fn();
  document.createElement = vi.fn((tagName) => {
    if (tagName === "video") {
      return {
        duration,
        videoWidth: 1280,
        videoHeight: 720,
        onloadedmetadata: null,
        onseeked: null,
        onerror: null,
        removeAttribute: vi.fn(),
        load: vi.fn(),
        set src(_value) { setTimeout(() => this.onloadedmetadata?.(), 0); },
        set currentTime(_value) { setTimeout(() => this.onseeked?.(), 0); },
      };
    }
    if (tagName === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
          getImageData: vi.fn((_x, _y, width, height) => ({
            data: new Uint8ClampedArray(width * height * 4),
            width,
            height,
          })),
        })),
      };
    }
    return originalCreateElement(tagName);
  });

  return () => {
    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  };
}
