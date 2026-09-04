import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  encryptFileMock,
  encryptPreparedFileMock,
  fountainMock,
  frameV4Mock,
  createQrMock,
  renderColorMatrixMock,
  toCanvasMock,
} = vi.hoisted(() => ({
  encryptFileMock: vi.fn(),
  encryptPreparedFileMock: vi.fn(),
  fountainMock: vi.fn(),
  frameV4Mock: vi.fn(),
  createQrMock: vi.fn(),
  renderColorMatrixMock: vi.fn(),
  toCanvasMock: vi.fn(),
}));

vi.mock("qrcode", () => ({ default: { create: createQrMock, toCanvas: toCanvasMock } }));
vi.mock("../crypto/encrypted-container.js", () => ({
  encryptFile: encryptFileMock,
  encryptPreparedFile: encryptPreparedFileMock,
}));
vi.mock("../optical/color-matrix-canvas.js", () => ({
  renderColorMatrixV2: renderColorMatrixMock,
}));
vi.mock("../optical/fountain.js", () => ({ createFountainEncoder: fountainMock }));
vi.mock("../optical/frame-v4.js", () => ({
  OPTICAL_PROTOCOL_VERSION: "QRF1",
  encodeFrameV4: frameV4Mock,
}));

import { createQrVideo } from "../video/create-qr-video.js";

let latestRecorder;

describe("QRF1 QR video üretimi", () => {
  let originalCreateElement;
  let originalMediaRecorder;
  let canvases;
  let captureStreamError;
  let streamTrackStop;

  beforeEach(() => {
    vi.useFakeTimers();
    originalCreateElement = document.createElement.bind(document);
    originalMediaRecorder = globalThis.MediaRecorder;
    canvases = [];
    captureStreamError = null;
    streamTrackStop = vi.fn();
    encryptFileMock.mockResolvedValue({
      blob: new Blob(["BTA1 encrypted"]),
      keyText: "secret-key-outside-video",
      transferId: "Ab12Cd34Ef56",
      sha256: "source-sha",
    });
    const symbols = [0, 1, 2].map((symbolId) => ({
      transferId: "Ab12Cd34Ef56",
      symbolId,
      data: new Uint8Array(1400),
    }));
    fountainMock.mockResolvedValue({
      metadata: {
        transferId: "Ab12Cd34Ef56",
        sourceCount: 2,
        blockBytes: 1400,
        originalBytes: 14,
        sha256: "A".repeat(43),
      },
      symbols: () => symbols,
    });
    frameV4Mock.mockImplementation((_metadata, symbol) => `QRF1-symbol-${symbol.symbolId}`);
    createQrMock.mockReturnValue({
      modules: { size: 21, get: vi.fn(() => false) },
    });
    toCanvasMock.mockImplementation((_canvas, _text, _options, callback) => callback(null));
    globalThis.MediaRecorder = mediaRecorderMock();
    document.createElement = vi.fn((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === "canvas") {
        const context = {
          fillStyle: "",
          imageSmoothingEnabled: true,
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          createImageData: vi.fn((width, height) => ({
            data: new Uint8ClampedArray(width * height * 4),
            width,
            height,
          })),
          putImageData: vi.fn(),
        };
        element.getContext = vi.fn(() => context);
        element.captureStream = vi.fn(() => {
          if (captureStreamError) throw captureStreamError;
          return { getTracks: () => [{ stop: streamTrackStop }] };
        });
        canvases.push(element);
      }
      return element;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.createElement = originalCreateElement;
    globalThis.MediaRecorder = originalMediaRecorder;
    vi.clearAllMocks();
  });

  it("Dengeli profilde iki QRF1 sembolünü aynı video karesine çizer", async () => {
    const progress = vi.fn();
    const promise = createQrVideo(new File(["x"], "x.pdf"), { profileId: "balanced" }, progress);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fountainMock).toHaveBeenCalledWith(expect.any(Uint8Array), {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 1400,
      emissionRatio: 1.5,
    });
    expect(createQrMock.mock.calls.map((call) => call[0][0].data)).toEqual([
      "QRF1-symbol-0",
      "QRF1-symbol-1",
      "QRF1-symbol-2",
    ]);
    const videoCanvas = canvases.find((canvas) => canvas.captureStream.mock.calls.length > 0);
    expect({ width: videoCanvas.width, height: videoCanvas.height }).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(result).toMatchObject({
      protocolVersion: "QRF1",
      profileId: "balanced",
      durationSeconds: 1,
      keyText: "secret-key-outside-video",
    });
    expect(JSON.stringify(createQrMock.mock.calls)).not.toContain("secret-key-outside-video");
    expect(progress).toHaveBeenCalledWith({ stage: "recording", percent: 100 });
    expect(renderColorMatrixMock).not.toHaveBeenCalled();
  });

  it("QR'ları doğal boyutlu rasterdan keskin biçimde profil bölgelerine büyütür", async () => {
    const qrRenderPool = {
      render: vi.fn(async (_text, context) => ({
        ...context,
        width: 25,
        height: 25,
        pixels: new Uint8ClampedArray(25 * 25 * 4),
      })),
      close: vi.fn(),
    };

    const promise = createQrVideo(new File(["x"], "x.pdf"), {
      profileId: "balanced",
      qrRenderPool,
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(qrRenderPool.render).toHaveBeenCalledTimes(3);
    expect(qrRenderPool.close).not.toHaveBeenCalled();
    expect(toCanvasMock).not.toHaveBeenCalled();

    const videoCanvas = canvases.find((canvas) => canvas.captureStream.mock.calls.length > 0);
    const videoContext = videoCanvas.getContext.mock.results[0].value;
    expect(videoContext.imageSmoothingEnabled).toBe(false);
    expect(videoContext.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 25, height: 25 }),
      60,
      90,
      900,
      900,
    );
  });

  it("yalnız kendi oluşturduğu QR render havuzunu kapatır", async () => {
    const ownedPool = {
      render: vi.fn(async (_text, context) => ({
        ...context,
        width: 25,
        height: 25,
        pixels: new Uint8ClampedArray(25 * 25 * 4),
      })),
      close: vi.fn(),
    };
    const createQrRenderPool = vi.fn(() => ownedPool);

    const promise = createQrVideo(new File(["x"], "x.pdf"), { createQrRenderPool });
    await vi.runAllTimersAsync();
    await promise;

    expect(createQrRenderPool).toHaveBeenCalledTimes(1);
    expect(ownedPool.close).toHaveBeenCalledTimes(1);
  });

  it("geçersiz tampon sınırında kurulmuş worker havuzunu kapatır", async () => {
    const ownedPool = naturalRasterPool();

    await expect(createQrVideo(new File(["x"], "x.pdf"), {
      createQrRenderPool: () => ownedPool,
      maxBufferedFrames: Number.NaN,
    })).rejects.toThrow("güvenli bir tam sayı");

    expect(ownedPool.close).toHaveBeenCalledTimes(1);
  });

  it("ön yükleyici kurulurken eşzamanlı render hatasında worker havuzunu kapatır", async () => {
    const ownedPool = {
      render: vi.fn(() => { throw new Error("eşzamanlı render hatası"); }),
      close: vi.fn(),
    };

    await expect(createQrVideo(new File(["x"], "x.pdf"), {
      createQrRenderPool: () => ownedPool,
    })).rejects.toThrow("eşzamanlı render hatası");

    expect(ownedPool.close).toHaveBeenCalledTimes(1);
  });

  it("worker oluşturulamıyorsa doğal raster yedeğiyle devam eder", async () => {
    const onPerformanceWarning = vi.fn();
    const workerError = new DOMException("worker yok", "SecurityError");
    const promise = createQrVideo(new File(["x"], "x.pdf"), {
      createQrRenderPool: () => { throw workerError; },
      onPerformanceWarning,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toMatchObject({ protocolVersion: "QRF1" });
    expect(onPerformanceWarning).toHaveBeenCalledWith(workerError);
    expect(createQrMock).toHaveBeenCalledTimes(3);
  });

  it("worker ilk kare hazırlanırken çökerse ana iş parçacığı yedeğine geçer", async () => {
    const workerError = Object.assign(new Error("worker modülü yüklenemedi"), {
      code: "WORKER_ERROR",
    });
    const ownedPool = {
      render: vi.fn().mockRejectedValue(workerError),
      close: vi.fn(),
    };
    const onPerformanceWarning = vi.fn();

    const promise = createQrVideo(new File(["x"], "x.pdf"), {
      createQrRenderPool: () => ownedPool,
      onPerformanceWarning,
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({ protocolVersion: "QRF1" });
    expect(ownedPool.close).toHaveBeenCalledTimes(1);
    expect(onPerformanceWarning).toHaveBeenCalledWith(workerError);
    expect(createQrMock).toHaveBeenCalledTimes(3);
  });

  it("captureStream kurulamazsa sahip olunan hazırlayıcıyı kapatır", async () => {
    const ownedPool = naturalRasterPool();
    captureStreamError = new Error("stream kurulamadı");

    await expect(createQrVideo(new File(["x"], "x.pdf"), {
      createQrRenderPool: () => ownedPool,
    })).rejects.toThrow("stream kurulamadı");

    expect(ownedPool.close).toHaveBeenCalledTimes(1);
  });

  it("MediaRecorder kurulamazsa worker ve stream izlerini kapatır", async () => {
    const ownedPool = naturalRasterPool();
    globalThis.MediaRecorder = class BrokenMediaRecorder {
      static isTypeSupported(type) { return type === "video/webm"; }
      constructor() { throw new Error("recorder kurulamadı"); }
    };

    await expect(createQrVideo(new File(["x"], "x.pdf"), {
      createQrRenderPool: () => ownedPool,
    })).rejects.toThrow("recorder kurulamadı");

    expect(ownedPool.close).toHaveBeenCalledTimes(1);
    expect(streamTrackStop).toHaveBeenCalledTimes(1);
  });

  it("MediaRecorder başlatılamazsa worker ve stream izlerini kapatır", async () => {
    const ownedPool = naturalRasterPool();
    globalThis.MediaRecorder = class BrokenMediaRecorder {
      static isTypeSupported(type) { return type === "video/webm"; }
      constructor() { this.state = "inactive"; }
      start() { throw new Error("recorder başlatılamadı"); }
    };

    await expect(createQrVideo(new File(["x"], "x.pdf"), {
      createQrRenderPool: () => ownedPool,
    })).rejects.toThrow("recorder başlatılamadı");

    expect(ownedPool.close).toHaveBeenCalledTimes(1);
    expect(streamTrackStop).toHaveBeenCalledTimes(1);
  });

  it("MediaRecorder hata olayında gerçek hatayı korur ve kaydı durdurur", async () => {
    const ownedPool = naturalRasterPool();
    const recorderError = new Error("kodlayıcı çöktü");
    globalThis.MediaRecorder = class FailingMediaRecorder {
      static isTypeSupported(type) { return type === "video/webm"; }
      constructor() {
        this.state = "inactive";
        latestRecorder = this;
      }
      start() {
        this.state = "recording";
        setTimeout(() => this.onerror?.({ error: recorderError }), 0);
      }
      stop() { this.state = "inactive"; }
    };

    const creation = createQrVideo(new File(["x"], "x.pdf"), {
      createQrRenderPool: () => ownedPool,
    });
    const rejection = expect(creation).rejects.toBe(recorderError);
    await vi.runAllTimersAsync();
    await rejection;

    expect(latestRecorder.state).toBe("inactive");
    expect(ownedPool.close).toHaveBeenCalledTimes(1);
    expect(streamTrackStop).toHaveBeenCalledTimes(1);
  });

  it("kayıt sırasında iptal edilirse yarım videoyu başarı olarak yayımlamaz", async () => {
    const controller = new AbortController();
    const recoveryStore = {
      saveOutgoing: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const qrRenderPool = {
      render: vi.fn(async (_text, context) => ({
        ...context,
        width: 25,
        height: 25,
        pixels: new Uint8ClampedArray(25 * 25 * 4),
      })),
      close: vi.fn(),
    };

    const creation = createQrVideo(new File(["x"], "x.pdf"), {
      signal: controller.signal,
      recoveryStore,
      qrRenderPool,
    });
    const rejection = expect(creation).rejects.toMatchObject({ code: "ABORTED" });
    await vi.advanceTimersByTimeAsync(1);
    expect(latestRecorder.state).toBe("recording");
    const videoCanvas = canvases.find((canvas) => canvas.captureStream.mock.calls.length > 0);
    const videoContext = videoCanvas.getContext.mock.results[0].value;
    const drawsBeforeAbort = videoContext.drawImage.mock.calls.length;
    controller.abort();
    await Promise.resolve();

    expect(latestRecorder.state).toBe("inactive");
    await rejection;
    await vi.runAllTimersAsync();
    expect(videoContext.drawImage).toHaveBeenCalledTimes(drawsBeforeAbort);
    expect(recoveryStore.delete).not.toHaveBeenCalled();
  });

  it("şifreleme sonrası kurtarma kaydını yazar ve video tamamlanınca siler", async () => {
    const recoveryStore = {
      saveOutgoing: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const promise = createQrVideo(
      new File(["x"], "gizli.pdf"),
      { profileId: "balanced", recoveryStore },
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(recoveryStore.saveOutgoing).toHaveBeenCalledWith(expect.objectContaining({
      id: "outgoing:Ab12Cd34Ef56",
      transferId: "Ab12Cd34Ef56",
      protocolVersion: "QRF1",
      encryptedBytes: expect.any(Uint8Array),
    }));
    expect(JSON.stringify(recoveryStore.saveOutgoing.mock.calls[0][0])).not.toContain("secret-key-outside-video");
    expect(recoveryStore.delete).toHaveBeenCalledWith("outgoing:Ab12Cd34Ef56");
  });

  it("kurtarma alanı kullanılamazsa uyarır fakat videoyu üretmeye devam eder", async () => {
    const recoveryError = Object.assign(new Error("kapalı"), { code: "RECOVERY_UNAVAILABLE" });
    const onRecoveryWarning = vi.fn();
    const promise = createQrVideo(new File(["x"], "x.pdf"), {
      profileId: "balanced",
      recoveryStore: {
        saveOutgoing: vi.fn().mockRejectedValue(recoveryError),
        delete: vi.fn(),
      },
      onRecoveryWarning,
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({ protocolVersion: "QRF1" });
    expect(onRecoveryWarning).toHaveBeenCalledWith(recoveryError);
  });

  it("QR çizimi başarısızsa yarım kalan şifreli kurtarma kaydını silmez", async () => {
    const recoveryStore = {
      saveOutgoing: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    createQrMock.mockImplementationOnce(() => {
      throw new Error("QR çizilemedi");
    });

    const promise = createQrVideo(new File(["x"], "x.pdf"), {
      profileId: "balanced",
      recoveryStore,
    });
    const assertion = expect(promise).rejects.toThrow("QR çizilemedi");
    await vi.runAllTimersAsync();
    await assertion;

    expect(recoveryStore.saveOutgoing).toHaveBeenCalledTimes(1);
    expect(recoveryStore.delete).not.toHaveBeenCalled();
  });
});

function mediaRecorderMock() {
  return class MediaRecorderMock {
    static isTypeSupported(type) {
      return type === "video/webm";
    }

    constructor(_stream, options) {
      this.mimeType = options.mimeType;
      this.state = "inactive";
      latestRecorder = this;
    }

    start() {
      this.state = "recording";
      setTimeout(() => this.ondataavailable?.({
        data: new Blob(["video"], { type: this.mimeType }),
      }), 0);
    }

    stop() {
      this.state = "inactive";
      setTimeout(() => this.onstop?.(), 0);
    }
  };
}

function naturalRasterPool() {
  return {
    render: vi.fn(async (_text, context) => ({
      ...context,
      width: 25,
      height: 25,
      pixels: new Uint8ClampedArray(25 * 25 * 4),
    })),
    close: vi.fn(),
  };
}
