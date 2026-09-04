import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFramesV3 } from "../protocol/frame-v3.js";
import { decodeQrVideo } from "../video/decode-qr-video.js";

describe("hızlı standart QR video taraması", () => {
  let restoreVideoDom;

  beforeEach(() => {
    restoreVideoDom = mockVideoDom();
  });

  afterEach(() => {
    restoreVideoDom();
  });

  it("ana standart yolda renkli probu açmadan iki 600×600 QR bölgesini işler", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const encoded = await encodeFramesV3({
      bytes,
      transferId: "Ab12Cd34Ef56",
      chunkBytes: 2,
    });
    const capturedRegions = [];
    let frameIndex = 0;
    const workerPool = {
      decode: vi.fn(async (_regions) => [encoded.frames[frameIndex++]]),
      close: vi.fn(),
    };
    const createColorWorkerClient = vi.fn(() => {
      throw new Error("Renkli prob ana standart yolda açılmamalı.");
    });
    const readSequentialFrames = vi.fn(async (_video, options) => {
      for (let index = 0; index < 2; index += 1) {
        const regions = options.captureFrame();
        capturedRegions.push(regions);
        const completed = await options.processFrame(regions);
        if (completed) return completed;
      }
      return null;
    });

    const result = await decodeQrVideo(
      new File(["video"], "aktarim.webm"),
      {},
      undefined,
      {
        allowColor: false,
        createColorWorkerClient,
        workerPool,
        readSequentialFrames,
      },
    );

    expect(result).toEqual(bytes);
    expect(createColorWorkerClient).not.toHaveBeenCalled();
    expect(capturedRegions[0].map(({ imageData }) => ({
      width: imageData.width,
      height: imageData.height,
    }))).toEqual([
      { width: 600, height: 600 },
      { width: 600, height: 600 },
    ]);
    expect(workerPool.decode).toHaveBeenCalledTimes(2);
  });
});

function mockVideoDom() {
  const originalCreateElement = document.createElement.bind(document);
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  URL.createObjectURL = vi.fn(() => "blob:video");
  URL.revokeObjectURL = vi.fn();
  document.createElement = vi.fn((tagName) => {
    if (tagName === "video") {
      return {
        duration: 1,
        videoWidth: 1920,
        videoHeight: 1080,
        onloadedmetadata: null,
        onseeked: null,
        onerror: null,
        removeAttribute: vi.fn(),
        load: vi.fn(),
        set src(_value) { setTimeout(() => this.onloadedmetadata?.(), 0); },
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
