import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createQrMock, encryptFileMock, toCanvasMock } = vi.hoisted(() => ({
  createQrMock: vi.fn(),
  encryptFileMock: vi.fn(),
  toCanvasMock: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: { create: createQrMock, toCanvas: toCanvasMock },
}));

vi.mock("../crypto/encrypted-container.js", () => ({
  encryptFile: encryptFileMock,
}));

import { createQrVideo } from "../video/create-qr-video.js";

const SECRET_KEY = "videoSecretKeyMustStayOutsideFrames";

describe("createQrVideo", () => {
  let originalMediaRecorder;
  let originalCreateElement;
  let createdCanvases;

  beforeEach(() => {
    originalMediaRecorder = globalThis.MediaRecorder;
    originalCreateElement = document.createElement.bind(document);
    createdCanvases = [];

    encryptFileMock.mockResolvedValue({
      blob: new Blob(["BTA1 encrypted bytes"]),
      keyText: SECRET_KEY,
      transferId: "Vid123456789",
      sha256: "sha",
    });
    toCanvasMock.mockImplementation((_canvas, _frameText, _options, callback) => callback(null));
    createQrMock.mockReturnValue({
      modules: { size: 21, get: vi.fn(() => false) },
    });

    document.createElement = vi.fn((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === "canvas") {
        const context = {
          fillStyle: "",
          imageSmoothingEnabled: true,
          fillRect: vi.fn(),
          drawTimes: [],
          createImageData: vi.fn((width, height) => ({
            data: new Uint8ClampedArray(width * height * 4),
            width,
            height,
          })),
          putImageData: vi.fn(),
        };
        context.drawImage = vi.fn(() => context.drawTimes.push(Date.now()));
        element.getContext = vi.fn(() => context);
        element.captureStream = vi.fn(() => ({ getTracks: () => [] }));
        createdCanvases.push(element);
      }
      return element;
    });
  });

  afterEach(() => {
    globalThis.MediaRecorder = originalMediaRecorder;
    document.createElement = originalCreateElement;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("MediaRecorder yoksa VIDEO_UNSUPPORTED hatası verir", async () => {
    globalThis.MediaRecorder = undefined;

    await expect(createQrVideo(new File(["a"], "a.txt"))).rejects.toMatchObject({
      code: "VIDEO_UNSUPPORTED",
    });
  });

  it("QR karelerine anahtarı yazmadan video blob'u üretir", async () => {
    vi.useFakeTimers();
    globalThis.MediaRecorder = makeMediaRecorderMock("video/webm");
    const progress = vi.fn();

    const promise = createQrVideo(
      new File(["delil"], "delil.txt"),
      { framesPerSecond: 20, repeatCount: 1 },
      progress,
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.blob.type).toBe("video/webm");
    expect(result.keyText).toBe(SECRET_KEY);
    expect(progress).toHaveBeenCalledWith({ stage: "encrypting", percent: 100 });
    expect(progress).toHaveBeenCalledWith({ stage: "recording", percent: 100 });
    for (const call of createQrMock.mock.calls) {
      expect(call[0]).not.toContain(SECRET_KEY);
    }
  });

  it("video için QRF1 optik kareleri üretir", async () => {
    vi.useFakeTimers();
    globalThis.MediaRecorder = makeMediaRecorderMock("video/webm");

    const promise = createQrVideo(new File(["delil"], "delil.txt"));
    await vi.runAllTimersAsync();
    await promise;

    expect(createQrMock.mock.calls.every((call) => (
      call[0][0].mode === "byte" && call[0][0].data.startsWith("QRF1|")
    ))).toBe(true);
  });

  it("QR çizimi Dengeli video tuvalinin 1920x1080 çözünürlüğünü değiştirmez", async () => {
    vi.useFakeTimers();
    globalThis.MediaRecorder = makeMediaRecorderMock("video/webm");
    const promise = createQrVideo(
      new File(["delil"], "delil.txt"),
      { framesPerSecond: 20, repeatCount: 1, holdFrames: 1 },
    );

    await vi.runAllTimersAsync();
    await promise;

    const videoCanvas = createdCanvases.find((canvas) => canvas.captureStream.mock.calls.length > 0);
    expect(videoCanvas.width).toBe(1920);
    expect(videoCanvas.height).toBe(1080);
  });

  it("Dengeli profilde iki QR bölgesini video tuvaline çizer", async () => {
    vi.useFakeTimers();
    globalThis.MediaRecorder = makeMediaRecorderMock("video/webm");

    const promise = createQrVideo(
      new File(["delil"], "delil.txt"),
      { framesPerSecond: 20, repeatCount: 1, holdFrames: 3 },
    );

    await vi.runAllTimersAsync();
    await promise;

    const videoCanvas = createdCanvases.find((canvas) => canvas.captureStream.mock.calls.length > 0);
    const videoContext = videoCanvas.getContext.mock.results[0].value;
    expect(videoContext.drawImage).toHaveBeenCalledTimes(6);
  });

  it("hazırlama gecikse bile her mantıksal kareyi en az bir video aralığı görünür tutar", async () => {
    vi.useFakeTimers();
    let startedAt = 0;
    let stoppedAt = 0;
    globalThis.MediaRecorder = class TimedMediaRecorder {
      static isTypeSupported(type) {
        return type === "video/webm";
      }

      constructor() {
        this.mimeType = "video/webm";
        this.state = "inactive";
      }

      start() {
        this.state = "recording";
        startedAt = Date.now();
      }

      stop() {
        stoppedAt = Date.now();
        this.state = "inactive";
        setTimeout(() => this.onstop?.(), 0);
      }
    };
    const qrRenderPool = {
      render: vi.fn((_text, context) => new Promise((resolve) => {
        setTimeout(() => resolve({
          ...context,
          width: 25,
          height: 25,
          pixels: new Uint8ClampedArray(25 * 25 * 4),
        }), context.frameIndex === 1 ? 80 : 0);
      })),
      close: vi.fn(),
    };

    const promise = createQrVideo(
      new File(["delil"], "delil.txt"),
      { repeatCount: 1, holdFrames: 3, qrRenderPool },
    );

    await vi.runAllTimersAsync();
    await promise;

    const videoCanvas = createdCanvases.find((canvas) => canvas.captureStream.mock.calls.length > 0);
    const drawTimes = videoCanvas.getContext.mock.results[0].value.drawTimes;
    const frameDrawTimes = drawTimes.filter((_time, index) => index % 2 === 0);
    const gaps = frameDrawTimes.slice(1).map((time, index) => time - frameDrawTimes[index]);
    expect(frameDrawTimes).toHaveLength(3);
    expect(gaps.every((gap) => gap >= Math.floor(1000 / 24))).toBe(true);
    expect(stoppedAt - startedAt).toBeLessThanOrEqual(410);
  });
});

function makeMediaRecorderMock(mimeType) {
  return class MediaRecorderMock {
    static isTypeSupported(type) {
      return type === mimeType;
    }

    constructor(_stream, options) {
      this.mimeType = options.mimeType;
      this.state = "inactive";
      this.ondataavailable = null;
      this.onerror = null;
      this.onstop = null;
    }

    start() {
      this.state = "recording";
      setTimeout(() => {
        this.ondataavailable?.({
          data: new Blob(["video"], { type: this.mimeType }),
        });
      }, 0);
    }

    stop() {
      this.state = "inactive";
      setTimeout(() => this.onstop?.(), 0);
    }
  };
}
