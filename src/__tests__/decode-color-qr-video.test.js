import { afterEach, describe, expect, it, vi } from "vitest";
import { createFountainEncoder } from "../optical/fountain.js";
import { createColorPackageV2, openColorPackageV2 } from "../optical/color-package-v2.js";
import { encodeColorFrameV2 } from "../optical/color-frame-v2.js";
import { parseColorFrameV2 } from "../optical/color-frame-v2.js";
import { renderColorMatrixV2, scanColorMatrixV2 } from "../optical/color-matrix-canvas.js";
import { getQrRegions } from "../optical/frame-layout.js";
import { getOpticalProfile } from "../optical/profiles.js";
import {
  decodeColorQrVideo,
  probeColorQrVideo,
} from "../video/decode-color-qr-video.js";

describe("renkli QR video çözme", () => {
  it("CRF2 karelerinden şifreli kapsayıcı baytlarını tamamlar", async () => {
    const input = Uint8Array.from({ length: 8 * 380 }, (_, index) => index & 0xff);
    const encoder = await createFountainEncoder(input, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 380,
      emissionRatio: 1.30,
    });
    const frameBytes = encoder.symbols()
      .filter((symbol) => symbol.symbolId !== 0)
      .map((symbol) => encodeColorFrameV2(encoder.metadata, symbol));

    await expect(decodeColorQrVideo(null, {}, null, { frameBytes })).resolves.toEqual(input);
  });

  it("paket tamamlanınca kalan test karelerini işlemez", async () => {
    const input = new Uint8Array(380).fill(5);
    const encoder = await createFountainEncoder(input, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 380,
      emissionRatio: 1.30,
    });
    const completeFrame = encodeColorFrameV2(encoder.metadata, encoder.symbol(0));

    await expect(decodeColorQrVideo(null, {}, null, {
      frameBytes: [completeFrame, new Uint8Array([1])],
    })).resolves.toEqual(input);
  });

  it.each([10 * 1024, 100 * 1024])(
    "%i baytlık CQF2 dosyasını ad, tür ve içerikle açar",
    async (size) => {
      const payload = new Uint8Array(size).fill(65);
      const transferId = "Ab12Cd34Ef56";
      const created = await createColorPackageV2({
        payload,
        name: `örnek-${size}.txt`,
        type: "text/plain",
        transferId,
      });
      const encoder = await createFountainEncoder(created.containerBytes, {
        transferId,
        blockBytes: 380,
        emissionRatio: 1.30,
      });
      const frameBytes = encoder.symbols()
        .map((symbol) => encodeColorFrameV2(encoder.metadata, symbol));

      const decoded = await decodeColorQrVideo(null, {}, null, { frameBytes });
      const opened = await openColorPackageV2(decoded, { expectedTransferId: transferId });

      expect(opened).toMatchObject({ name: `örnek-${size}.txt`, type: "text/plain" });
      expect(opened.payload).toEqual(payload);
    },
  );

  it("AbortSignal iptalinde ABORTED hatası verir", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      decodeColorQrVideo(new File(["video"], "renkli.webm"), {}, controller.signal),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("video sınırında tamamlanmayan aktarımı INCOMPLETE_TRANSFER ile bildirir", async () => {
    const input = new Uint8Array(760).fill(9);
    const encoder = await createFountainEncoder(input, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 380,
      emissionRatio: 1.30,
    });
    const firstFrame = encodeColorFrameV2(encoder.metadata, encoder.symbol(0));

    await expect(
      decodeColorQrVideo(null, {}, null, { frameBytes: [firstFrame] }),
    ).rejects.toMatchObject({
      code: "INCOMPLETE_TRANSFER",
      solved: 1,
      sourceCount: 2,
    });
  });
});

describe("renkli QR video örnekleme", () => {
  let restoreDom;

  afterEach(() => {
    restoreDom?.();
    restoreDom = null;
  });

  it("probu en fazla üç erken karede ve 640x360 sınırında yapar", async () => {
    const videoState = {};
    restoreDom = mockVideoDom({ duration: 1, videoState });
    const workerClient = { decodeImage: vi.fn().mockResolvedValue({ frame: null }) };

    await expect(probeColorQrVideo(new File(["video"], "standart.webm"), {
      workerClient,
      sessionId: "probe-session",
    })).resolves.toBe(false);

    expect(videoState.seekTimes).toEqual([0.05, 0.20, 0.40]);
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(6);
    for (const [, imageData] of workerClient.decodeImage.mock.calls) {
      expect(imageData).toMatchObject({ width: 300, height: 300 });
    }
  });

  it("ana taramada 0.08 saniye adım kullanır, 1280x720 sınırını korur ve erken biter", async () => {
    const input = new Uint8Array(380).fill(7);
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
    const videoState = {};
    restoreDom = mockVideoDom({ duration: 0.1, videoState, width: 3840, height: 2160 });
    const workerClient = {
      decodeImage: vi.fn()
        .mockResolvedValueOnce({ frame: null })
        .mockResolvedValueOnce({ frame: null })
        .mockResolvedValueOnce({ frame })
        .mockResolvedValueOnce({ frame }),
    };

    await expect(decodeColorQrVideo(
      new File(["video"], "renkli.webm"),
      {},
      null,
      { workerClient, sessionId: "decode-session", profileDetected: true },
    )).resolves.toEqual(input);

    expect(videoState.seekTimes).toEqual([0, 0.08]);
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(4);
    expect(workerClient.decodeImage.mock.calls[0][1]).toMatchObject({
      width: 600,
      height: 600,
    });
  });

  it("1920x1080 bileşikteki iki gerçek matrisi kırpıp üçten fazla sembolle aktarımı tamamlar", async () => {
    const input = Uint8Array.from({ length: 3 * 380 }, (_, index) => (index * 17) & 0xff);
    const encoder = await createFountainEncoder(input, {
      transferId: "Ab12Cd34Ef56",
      blockBytes: 380,
      emissionRatio: 1.30,
    });
    const groupedFrames = encoder.symbols().slice(0, 4).reduce((frames, symbol, index) => {
      const frameIndex = Math.floor(index / 2);
      frames[frameIndex] ??= [];
      frames[frameIndex].push(encodeColorFrameV2(encoder.metadata, symbol));
      return frames;
    }, []);
    const compositeFrames = groupedFrames.map(renderCompositeFrame);
    const videoState = {};
    restoreDom = mockVideoDom({
      duration: 0.1,
      videoState,
      width: 1920,
      height: 1080,
      compositeFrames,
    });
    const workerClient = {
      decodeImage: vi.fn(async (_sessionId, imageData) => {
        const scan = scanColorMatrixV2(imageData);
        return { scan, frame: scan ? parseColorFrameV2(scan.frameBytes) : null };
      }),
    };

    await expect(decodeColorQrVideo(
      new File(["video"], "iki-bolgeli.webm"),
      {},
      null,
      { workerClient, sessionId: "integration-session", profileDetected: true },
    )).resolves.toEqual(input);

    expect(workerClient.decodeImage.mock.calls.length).toBeGreaterThan(2);
    expect(workerClient.decodeImage.mock.calls.every(([, imageData]) => (
      imageData.width === 600 && imageData.height === 600
    ))).toBe(true);
  }, 15_000);

  it("son video örneğini duration eksi 0.02 saniyede okur", async () => {
    const videoState = {};
    restoreDom = mockVideoDom({ duration: 0.11, videoState });
    const workerClient = { decodeImage: vi.fn().mockResolvedValue({ frame: null }) };

    await expect(decodeColorQrVideo(
      new File(["video"], "eksik.webm"),
      {},
      null,
      { workerClient, sessionId: "decode-session", profileDetected: true },
    )).rejects.toMatchObject({ code: "INCOMPLETE_TRANSFER" });

    expect(videoState.seekTimes).toEqual([0, 0.08, 0.09]);
  });
});

function mockVideoDom({
  duration,
  videoState,
  width = 1280,
  height = 720,
  compositeFrames = null,
}) {
  const originalCreateElement = document.createElement.bind(document);
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  videoState.seekTimes = [];

  URL.createObjectURL = vi.fn(() => "blob:color-video");
  URL.revokeObjectURL = vi.fn();
  document.createElement = vi.fn((tagName) => {
    if (tagName === "video") return createVideoMock({ duration, videoState, width, height });
    if (tagName === "canvas") return createCanvasMock(videoState, compositeFrames);
    return originalCreateElement(tagName);
  });

  return () => {
    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  };
}

function createVideoMock({ duration, videoState, width, height }) {
  return {
    duration,
    videoWidth: width,
    videoHeight: height,
    onloadedmetadata: null,
    onseeked: null,
    onerror: null,
    removeAttribute: vi.fn(),
    load: vi.fn(),
    set src(_value) {
      setTimeout(() => this.onloadedmetadata?.(), 0);
    },
    set currentTime(value) {
      videoState.seekTimes.push(value);
      setTimeout(() => this.onseeked?.(), 0);
    },
  };
}

function createCanvasMock(videoState, compositeFrames) {
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn((x, y, width, height) => {
      if (!compositeFrames) {
        return { data: new Uint8ClampedArray(width * height * 4), width, height };
      }
      const frameIndex = videoState.seekTimes.at(-1) >= 0.08 ? 1 : 0;
      const scaled = resizeNearest(compositeFrames[frameIndex], 1280, 720);
      return cropImageData(scaled, x, y, width, height);
    }),
  };
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  };
}

function createPixelCanvas() {
  const canvas = { width: 0, height: 0, pixels: new Uint8ClampedArray(0) };
  const context = {
    fillStyle: "rgb(0, 0, 0)",
    imageSmoothingEnabled: false,
    fillRect(x, y, width, height) {
      const [r, g, b] = context.fillStyle.match(/\d+/g).map(Number);
      if (canvas.pixels.length !== canvas.width * canvas.height * 4) {
        canvas.pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
      }
      for (let row = y; row < y + height; row += 1) {
        for (let column = x; column < x + width; column += 1) {
          canvas.pixels.set([r, g, b, 255], (row * canvas.width + column) * 4);
        }
      }
    },
  };
  canvas.getContext = () => context;
  return canvas;
}

function renderCompositeFrame(frameBytesList) {
  const profile = getOpticalProfile("color_balanced");
  const regions = getQrRegions(profile);
  const imageData = {
    data: new Uint8ClampedArray(profile.width * profile.height * 4),
    width: profile.width,
    height: profile.height,
  };
  imageData.data.fill(255);
  frameBytesList.forEach((frameBytes, index) => {
    const matrixCanvas = createPixelCanvas();
    const rendered = renderColorMatrixV2(matrixCanvas, frameBytes, {
      cellSize: 15,
      maxCanvasSize: regions[index].size,
    });
    blitNearest(imageData, {
      data: matrixCanvas.pixels,
      width: matrixCanvas.width,
      height: matrixCanvas.height,
    }, {
      x: regions[index].x + Math.floor((regions[index].size - rendered.size) / 2),
      y: regions[index].y + Math.floor((regions[index].size - rendered.size) / 2),
      size: rendered.size,
    });
  });
  return imageData;
}

function blitNearest(target, source, region) {
  for (let y = 0; y < region.size; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y * source.height) / region.size));
    for (let x = 0; x < region.size; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x * source.width) / region.size));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = ((region.y + y) * target.width + region.x + x) * 4;
      target.data.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
}

function resizeNearest(source, width, height) {
  const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y * source.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x * source.width) / width));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      target.data.set(source.data.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
    }
  }
  return target;
}

function cropImageData(source, x, y, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(sourceStart, sourceStart + width * 4), row * width * 4);
  }
  return { data, width, height };
}
