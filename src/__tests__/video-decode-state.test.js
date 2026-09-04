import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFramesV3 } from "../protocol/frame-v3.js";
import { createFountainEncoder } from "../optical/fountain.js";
import { encodeFrameV4 } from "../optical/frame-v4.js";
import {
  DEFAULT_SCAN_STEP_SECONDS,
  decodeQrVideo,
  fitVideoFrame,
} from "../video/decode-qr-video.js";

describe("decodeQrVideo state", () => {
  it("QRF1 kare metinlerini yeni optik oturumla çözer", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const encoder = await createFountainEncoder(bytes, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 4,
    });
    const frameTexts = encoder.symbols().map((symbol) =>
      encodeFrameV4(encoder.metadata, symbol));

    const result = await decodeQrVideo(
      new File(["video"], "aktarim.webm"),
      {},
      undefined,
      { frameTexts },
    );

    expect(result).toEqual(bytes);
  });

  it("hızlı videoda kare geçişlerini kaçırmamak için saniyede on kez örnekler", () => {
    expect(DEFAULT_SCAN_STEP_SECONDS).toBe(0.1);
  });

  it("büyük video karelerini oranını bozmadan tarama sınırına indirir", () => {
    expect(fitVideoFrame(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(fitVideoFrame(1080, 1920)).toEqual({ width: 405, height: 720 });
    expect(fitVideoFrame(640, 360)).toEqual({ width: 640, height: 360 });
  });

  it("iptal sinyalinde çözümlemeyi durdurur", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      decodeQrVideo(new File(["video"], "aktarim.webm"), {}, controller.signal, {
        frameTexts: [],
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("tekrar eden karede ilerlemeyi yalnız bir kez artırır", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const encoded = await encodeFramesV3({
      bytes,
      transferId: "Ab12Cd34Ef56",
      chunkBytes: 2,
    });
    const progress = vi.fn();

    const result = await decodeQrVideo(
      new File(["video"], "aktarim.webm"),
      { onProgress: progress },
      undefined,
      {
        frameTexts: [encoded.frames[0], encoded.frames[0], encoded.frames[1]],
      },
    );

    expect(Array.from(result)).toEqual(Array.from(bytes));
    expect(progress.mock.calls.map(([value]) => value.collected)).toEqual([1, 2, 2]);
  });

  it("video biterken eksik kare varsa kesin sayıyı verir", async () => {
    const encoded = await encodeFramesV3({
      bytes: new Uint8Array([1, 2, 3, 4]),
      transferId: "Ab12Cd34Ef56",
      chunkBytes: 2,
    });

    await expect(
      decodeQrVideo(new File(["video"], "aktarim.webm"), {}, undefined, {
        frameTexts: [encoded.frames[0]],
      }),
    ).rejects.toMatchObject({
      code: "INCOMPLETE",
      collected: 1,
      total: 2,
      message: "Eksik kare: 1 / 2",
    });
  });

  describe("gerçek video taraması", () => {
    let restoreVideoDom;

    beforeEach(() => {
      restoreVideoDom = mockVideoDom();
    });

    afterEach(() => {
      restoreVideoDom();
    });

    it("video zamanına göre tarama ilerlemesini bildirir", async () => {
      const onScanProgress = vi.fn();

      await expect(
        decodeQrVideo(new File(["video"], "aktarim.webm"), { onScanProgress }, undefined, {
          decodeImage: vi.fn(() => null),
        }),
      ).rejects.toMatchObject({
        code: "INCOMPLETE",
        message: "Video tarandı fakat 0 / 0 QR karesi bulundu.",
      });

      expect(onScanProgress.mock.calls[0][0]).toEqual({
        percent: 0,
        currentTime: 0,
        duration: 0.25,
      });
      expect(onScanProgress.mock.calls.at(-1)[0]).toEqual({
        percent: 100,
        currentTime: 0.25,
        duration: 0.25,
      });
    });

    it("paket tamamlanınca sonraki video karelerini çözmez", async () => {
      const encoded = await encodeFramesV3({
        bytes: new Uint8Array([1, 2, 3, 4]),
        transferId: "Ab12Cd34Ef56",
        chunkBytes: 2,
      });
      const decodeImage = vi
        .fn()
        .mockReturnValueOnce(encoded.frames[0])
        .mockReturnValueOnce(encoded.frames[1]);
      const onScanProgress = vi.fn();

      const result = await decodeQrVideo(
        new File(["video"], "aktarim.webm"),
        { onScanProgress },
        undefined,
        { decodeImage },
      );

      expect(Array.from(result)).toEqual([1, 2, 3, 4]);
      expect(decodeImage).toHaveBeenCalledTimes(2);
      expect(decodeImage.mock.calls[0][0]).toMatchObject({ width: 1280, height: 720 });
      expect(onScanProgress.mock.calls.at(-1)[0]).toEqual({
        percent: 100,
        currentTime: 0.1,
        duration: 0.25,
      });
    });

    it("aynı boyuttaki video karelerinde tuvali yalnız bir kez boyutlandırır", async () => {
      let canvas;
      restoreVideoDom();
      restoreVideoDom = mockVideoDom({
        onCanvasCreated: (createdCanvas) => {
          canvas = createdCanvas;
        },
      });

      await expect(
        decodeQrVideo(new File(["video"], "aktarim.webm"), {}, undefined, {
          decodeImage: vi.fn(() => null),
        }),
      ).rejects.toMatchObject({ code: "INCOMPLETE" });

      expect(canvas.widthSetCount).toBe(1);
      expect(canvas.heightSetCount).toBe(1);
    });

    it("ondalık video süresinin son örneğindeki QR karesini tarar", async () => {
      restoreVideoDom();
      restoreVideoDom = mockVideoDom({ duration: 0.3 });
      const encoded = await encodeFramesV3({
        bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        transferId: "Ab12Cd34Ef56",
        chunkBytes: 2,
      });
      const decodeImage = vi.fn(() => encoded.frames[decodeImage.mock.calls.length - 1]);

      const result = await decodeQrVideo(
        new File(["video"], "aktarim.webm"),
        {},
        undefined,
        { decodeImage },
      );

      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(decodeImage).toHaveBeenCalledTimes(4);
    });
  });
});

function mockVideoDom(videoOptions = {}) {
  const originalCreateElement = document.createElement.bind(document);
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  URL.createObjectURL = vi.fn(() => "blob:video");
  URL.revokeObjectURL = vi.fn();
  document.createElement = vi.fn((tagName) => {
    if (tagName === "video") return createVideoMock(videoOptions);
    if (tagName === "canvas") {
      const canvas = createCanvasMock();
      videoOptions.onCanvasCreated?.(canvas);
      return canvas;
    }
    return originalCreateElement(tagName);
  });

  return () => {
    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  };
}

function createVideoMock(options) {
  let currentTime = 0;

  return {
    duration: options.duration ?? 0.25,
    videoWidth: 3840,
    videoHeight: 2160,
    onloadedmetadata: null,
    onseeked: null,
    onerror: null,
    removeAttribute: vi.fn(),
    load: vi.fn(),
    set src(_value) {
      setTimeout(() => this.onloadedmetadata?.(), 0);
    },
    set currentTime(value) {
      currentTime = value;
      setTimeout(() => this.onseeked?.(), 0);
    },
    get currentTime() {
      return currentTime;
    },
  };
}

function createCanvasMock() {
  let width = 0;
  let height = 0;
  let widthSetCount = 0;
  let heightSetCount = 0;
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn((x, y, width, height) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    })),
  };

  return {
    get width() {
      return width;
    },
    set width(value) {
      width = value;
      widthSetCount += 1;
    },
    get height() {
      return height;
    },
    set height(value) {
      height = value;
      heightSetCount += 1;
    },
    get widthSetCount() {
      return widthSetCount;
    },
    get heightSetCount() {
      return heightSetCount;
    },
    getContext: vi.fn(() => context),
  };
}
