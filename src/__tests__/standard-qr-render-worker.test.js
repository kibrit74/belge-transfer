import { describe, expect, it, vi } from "vitest";
import { createQrRasterWorkerMessageHandler } from "../workers/standard-qr-render.worker.js";

describe("standart QR raster worker", () => {
  it("doğal rasterı aktarılabilir piksel tamponuyla döndürür", async () => {
    const postMessage = vi.fn();
    const rasterize = vi.fn(() => ({
      width: 25,
      height: 25,
      pixels: new Uint8ClampedArray(25 * 25 * 4),
      moduleCount: 21,
      margin: 2,
    }));
    const handleMessage = createQrRasterWorkerMessageHandler({ postMessage, rasterize });

    await handleMessage({ data: {
      id: 7,
      frameIndex: 3,
      regionIndex: 1,
      text: "QRF1|örnek",
    } });

    const [result, transfer] = postMessage.mock.calls[0];
    expect(result).toMatchObject({
      id: 7,
      frameIndex: 3,
      regionIndex: 1,
      width: 25,
      height: 25,
      pixels: expect.any(Uint8ClampedArray),
    });
    expect(transfer).toEqual([result.pixels.buffer]);
  });

  it("raster hatasını güvenli worker hatasına çevirir", async () => {
    const postMessage = vi.fn();
    const handleMessage = createQrRasterWorkerMessageHandler({
      postMessage,
      rasterize: vi.fn(() => { throw new Error("matris üretilemedi"); }),
    });

    await handleMessage({ data: { id: 8, frameIndex: 0, regionIndex: 0, text: "x" } });

    expect(postMessage).toHaveBeenCalledWith({
      id: 8,
      error: { code: "QR_RENDER_ERROR", message: "matris üretilemedi" },
    });
  });
});
