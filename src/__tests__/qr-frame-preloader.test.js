import { describe, expect, it, vi } from "vitest";
import { createQrFramePreloader } from "../video/qr-frame-preloader.js";

describe("QR kare ön hazırlama tamponu", () => {
  it("en fazla sekiz kareyi hazırlar ve sonuçları kare sırasıyla tüketir", async () => {
    const controls = [];
    const renderQr = vi.fn((text, context) => new Promise((resolve) => {
      controls.push({ text, context, resolve });
    }));
    const schedule = Array.from({ length: 12 }, (_, frameIndex) => [
      `sol-${frameIndex}`,
      `sağ-${frameIndex}`,
    ]);
    const preloader = createQrFramePreloader({ schedule, renderQr, maxBufferedFrames: 8 });

    expect(renderQr).toHaveBeenCalledTimes(16);
    expect(preloader.stats().maxObservedBufferedFrames).toBe(8);

    controls.filter(({ context }) => context.frameIndex === 1)
      .forEach(({ context, resolve }) => resolve(context));
    controls.filter(({ context }) => context.frameIndex === 0)
      .forEach(({ context, resolve }) => resolve(context));

    await expect(preloader.takeNext()).resolves.toEqual([
      expect.objectContaining({ frameIndex: 0, regionIndex: 0 }),
      expect.objectContaining({ frameIndex: 0, regionIndex: 1 }),
    ]);
    expect(renderQr).toHaveBeenCalledTimes(18);
    expect(preloader.stats().maxObservedBufferedFrames).toBe(8);
    preloader.close();
  });

  it("boş programda hemen null döndürür", async () => {
    const renderQr = vi.fn();
    const preloader = createQrFramePreloader({ schedule: [], renderQr });
    await expect(preloader.takeNext()).resolves.toBeNull();
    expect(renderQr).not.toHaveBeenCalled();
  });

  it("QR hazırlama hatasını değiştirmeden tüketiciye verir", async () => {
    const failure = Object.assign(new Error("QR bozuk"), { code: "QR_RENDER_ERROR" });
    const preloader = createQrFramePreloader({
      schedule: [["bozuk"]],
      renderQr: vi.fn().mockRejectedValue(failure),
    });
    await expect(preloader.takeNext()).rejects.toBe(failure);
  });

  it("iptal ve kapanıştan sonra yeni kare tüketmez", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = createQrFramePreloader({
      schedule: [["kare"]],
      renderQr: vi.fn(),
      signal: controller.signal,
    });
    await expect(aborted.takeNext()).rejects.toMatchObject({ code: "ABORTED" });

    const closed = createQrFramePreloader({
      schedule: [["kare"]],
      renderQr: vi.fn(() => new Promise(() => {})),
    });
    closed.close();
    await expect(closed.takeNext()).rejects.toMatchObject({ code: "CLOSED" });
  });

  it("tampon sınırı için güvenli bir tam sayı ister", () => {
    expect(() => createQrFramePreloader({
      schedule: [["kare"]],
      renderQr: vi.fn(),
      maxBufferedFrames: Number.NaN,
    })).toThrow(RangeError);
    expect(() => createQrFramePreloader({
      schedule: [["kare"]],
      renderQr: vi.fn(),
      maxBufferedFrames: 2.5,
    })).toThrow(RangeError);
  });
});
