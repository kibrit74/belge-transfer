import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  encryptPreparedFileMock,
  qrToCanvasMock,
  renderColorMatrixMock,
} = vi.hoisted(() => ({
  encryptPreparedFileMock: vi.fn(),
  qrToCanvasMock: vi.fn(),
  renderColorMatrixMock: vi.fn(),
}));

vi.mock("qrcode", () => ({ default: { toCanvas: qrToCanvasMock } }));
vi.mock("../crypto/encrypted-container.js", () => ({
  encryptFile: vi.fn(),
  encryptPreparedFile: encryptPreparedFileMock,
}));
vi.mock("../optical/color-matrix-canvas.js", () => ({
  renderColorMatrixV2: renderColorMatrixMock,
}));

import { createQrVideo } from "../video/create-qr-video.js";
import { recordPreparedColorSession } from "../video/create-color-qr-video.js";

describe("gerçek renkli QR video üretimi", () => {
  let canvases;
  let originalCreateElement;
  let originalMediaRecorder;
  let recorderInstances;
  let streamTrack;

  beforeEach(() => {
    vi.useFakeTimers();
    canvases = [];
    originalCreateElement = document.createElement.bind(document);
    originalMediaRecorder = globalThis.MediaRecorder;

    encryptPreparedFileMock.mockResolvedValue({
      blob: new Blob(["BTA2 encrypted"]),
      keyText: "color-secret-key",
      transferId: "Ab12Cd34Ef56",
      sha256: "source-sha",
    });
    renderColorMatrixMock.mockImplementation((canvas) => {
      canvas.width = 400;
      canvas.height = 400;
      return { size: 400 };
    });
    recorderInstances = [];
    streamTrack = { stop: vi.fn(), requestFrame: vi.fn() };
    globalThis.MediaRecorder = mediaRecorderMock(recorderInstances);
    document.createElement = vi.fn((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === "canvas") {
        const context = {
          fillStyle: "",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          imageSmoothingEnabled: true,
        };
        element.getContext = vi.fn(() => context);
        element.captureStream = vi.fn(() => ({
          getTracks: () => [streamTrack],
          getVideoTracks: () => [streamTrack],
        }));
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

  it("color_balanced profilde CRF2 matrisleri çizer ve standart QRCode çağırmaz", async () => {
    const workerClient = fakePreparedColorWorker({ emittedSymbols: 2, sourceCount: 1 });
    const progress = vi.fn();

    const promise = createQrVideo(new File(["renkli belge"], "belge.txt"), {
      profileId: "color_balanced",
      workerClient,
    }, progress);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(workerClient.prepareOptical).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Uint8Array),
      { transferId: "Ab12Cd34Ef56", blockBytes: 380, emissionRatio: 1.3 },
    );
    expect(renderColorMatrixMock).toHaveBeenCalledTimes(4);
    expect(qrToCanvasMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      profileId: "color_balanced",
      isColor: true,
      protocolVersion: "CRF2",
      keyText: "color-secret-key",
      transferId: "Ab12Cd34Ef56",
      sha256: "source-sha",
      compressionStats: {
        compression: "zlib",
        originalSize: 1000,
        storedSize: 250,
        savedPercent: 75,
      },
    });
    expect(result.sha256).toBe("source-sha");
    expect(result).not.toHaveProperty("opticalSha256");
    expect(workerClient.disposeSession).toHaveBeenCalledTimes(1);
    expect(workerClient.terminate).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith({ stage: "recording", percent: 100 });
  });

  it("önceden hazırlanmış oturumu kapatmadan son boş bölgeyi beyaz bırakır", async () => {
    const client = fakePreparedColorWorker({ emittedSymbols: 3, sourceCount: 2 });

    const promise = recordPreparedColorSession({
      client,
      sessionId: "lab-session",
      optical: { emittedSymbols: 3 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    const videoCanvas = canvases.find((canvas) => canvas.captureStream.mock.calls.length > 0);
    const videoContext = videoCanvas.getContext.mock.results[0].value;
    expect(videoContext.imageSmoothingEnabled).toBe(false);
    expect(videoContext.fillRect).toHaveBeenCalledTimes(4);
    expect(videoContext.drawImage).toHaveBeenCalledTimes(6);
    expect(client.getFrame.mock.calls.map((call) => call[1])).toEqual([0, 1, 0, 1, 2, 2]);
    expect(client.disposeSession).not.toHaveBeenCalled();
    expect(client.terminate).not.toHaveBeenCalled();
    expect(Object.keys(result).sort()).toEqual([
      "blob",
      "durationSeconds",
      "isColor",
      "mimeType",
      "profileId",
    ]);
  });

  it("tamamlanan her renkli QR karesini videoya ayrı olarak yakalar", async () => {
    const promise = recordPreparedColorSession({
      client: fakePreparedColorWorker({ emittedSymbols: 3, sourceCount: 2 }),
      sessionId: "manual-frame-session",
      optical: { emittedSymbols: 3 },
    });
    await vi.runAllTimersAsync();
    await promise;

    const videoCanvas = canvases.find((canvas) => canvas.captureStream.mock.calls.length > 0);
    expect(videoCanvas.captureStream).toHaveBeenCalledWith(0);
    expect(streamTrack.requestFrame).toHaveBeenCalledTimes(4);
  });

  it("başarılı renkli kayıtta kurtarma verisini anahtarsız kaydeder ve sonra siler", async () => {
    const recoveryStore = {
      saveOutgoing: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const promise = createQrVideo(new File(["renkli belge"], "belge.txt"), {
      profileId: "color_balanced",
      workerClient: fakePreparedColorWorker({ emittedSymbols: 1, sourceCount: 1 }),
      recoveryStore,
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(recoveryStore.saveOutgoing).toHaveBeenCalledWith(expect.objectContaining({
      id: "outgoing:Ab12Cd34Ef56",
      transferId: "Ab12Cd34Ef56",
      protocolVersion: "CRF2",
      encryptedBytes: expect.any(Uint8Array),
    }));
    expect(JSON.stringify(recoveryStore.saveOutgoing.mock.calls[0][0]))
      .not.toContain("color-secret-key");
    expect(recoveryStore.delete).toHaveBeenCalledWith("outgoing:Ab12Cd34Ef56");
  });

  it("başarılı kayıttan sonra MediaRecorder ve captureStream kaynağını yalnız bir kez kapatır", async () => {
    const promise = recordPreparedColorSession({
      client: fakePreparedColorWorker({ emittedSymbols: 1, sourceCount: 1 }),
      sessionId: "success-session",
      optical: { emittedSymbols: 1 },
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(recorderInstances[0].stop).toHaveBeenCalledTimes(1);
    expect(streamTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("geç kare hatasında zamanlayıcıyı durdurur ve kaynakları tek kez kapatır", async () => {
    const client = fakePreparedColorWorker({ emittedSymbols: 4, sourceCount: 3 });
    client.getFrame.mockRejectedValueOnce(new Error("geç kare hatası"));

    const promise = recordPreparedColorSession({
      client,
      sessionId: "error-session",
      optical: { emittedSymbols: 4 },
    });
    const rejection = expect(promise).rejects.toThrow("geç kare hatası");
    await vi.runAllTimersAsync();
    await rejection;

    expect(client.getFrame).toHaveBeenCalledTimes(2);
    expect(recorderInstances[0].stop).toHaveBeenCalledTimes(1);
    expect(streamTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("AbortSignal kaydı iptal eder ve geç worker yanıtı yeni kare başlatmaz", async () => {
    const controller = new AbortController();
    const pendingFrame = deferred();
    const client = fakePreparedColorWorker({ emittedSymbols: 4, sourceCount: 3 });
    client.getFrame.mockImplementation(() => pendingFrame.promise);

    const promise = recordPreparedColorSession({
      client,
      sessionId: "abort-session",
      optical: { emittedSymbols: 4 },
      options: { signal: controller.signal },
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "ABORTED" });
    pendingFrame.resolve({ frameBytes: new Uint8Array([67, 82, 70, 50]) });
    await vi.runAllTimersAsync();

    expect(client.getFrame).toHaveBeenCalledTimes(2);
    expect(recorderInstances[0].stop).toHaveBeenCalledTimes(1);
    expect(streamTrack.stop).toHaveBeenCalledTimes(1);
  });
});

function fakePreparedColorWorker({ emittedSymbols, sourceCount }) {
  return {
    preparePayload: vi.fn().mockResolvedValue({
      storedBytes: new Uint8Array([7, 8, 9]),
      compression: "zlib",
      originalSize: 1000,
      storedSize: 250,
      originalSha256: "original-sha",
      storedSha256: "stored-sha",
      savedBytes: 750,
      savedPercent: 75,
    }),
    prepareOptical: vi.fn().mockResolvedValue({
      transferId: "Ab12Cd34Ef56",
      sourceCount,
      emittedSymbols,
      blockBytes: 380,
      originalBytes: 300,
    }),
    getFrame: vi.fn((_sessionId, symbolId) => Promise.resolve({
      frameBytes: new Uint8Array([67, 82, 70, 50, symbolId]),
    })),
    disposeSession: vi.fn(),
    terminate: vi.fn(),
  };
}

function mediaRecorderMock(instances) {
  return class MediaRecorderMock {
    static isTypeSupported(type) {
      return type === "video/webm";
    }

    constructor(_stream, options) {
      this.mimeType = options.mimeType;
      this.videoBitsPerSecond = options.videoBitsPerSecond;
      this.state = "inactive";
      this.stop = vi.fn(this.stop.bind(this));
      instances.push(this);
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
