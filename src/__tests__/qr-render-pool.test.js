import { describe, expect, it, vi } from "vitest";
import { createQrRenderPool } from "../video/qr-render-pool.js";

describe("standart QR render havuzu", () => {
  it("her işçiye tek aktif görev verir ve boşalan işçiye sıradaki görevi yollar", async () => {
    const workers = [controlledWorker(), controlledWorker()];
    let workerIndex = 0;
    const pool = createQrRenderPool({ workerFactory: () => workers[workerIndex++], size: 2 });

    const results = [0, 1, 2, 3].map((frameIndex) => pool.render(`frame-${frameIndex}`, {
      frameIndex,
      regionIndex: 0,
    }));

    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    expect(workers[1].postMessage).toHaveBeenCalledTimes(1);

    workers[0].complete(0);
    await Promise.resolve();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    workers[1].complete(0);
    await Promise.resolve();
    expect(workers[1].postMessage).toHaveBeenCalledTimes(2);
    workers[0].complete(1);
    workers[1].complete(1);

    await expect(Promise.all(results)).resolves.toEqual([
      expect.objectContaining({ frameIndex: 0, regionIndex: 0 }),
      expect.objectContaining({ frameIndex: 1, regionIndex: 0 }),
      expect.objectContaining({ frameIndex: 2, regionIndex: 0 }),
      expect.objectContaining({ frameIndex: 3, regionIndex: 0 }),
    ]);
    pool.close();
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  });

  it("kuyrukta bekleyen iptal edilmiş görevi işçiye göndermez", async () => {
    const workers = [controlledWorker(), controlledWorker()];
    let workerIndex = 0;
    const pool = createQrRenderPool({ workerFactory: () => workers[workerIndex++], size: 2 });
    const first = pool.render("aktif-0", { frameIndex: 0, regionIndex: 0 });
    const second = pool.render("aktif-1", { frameIndex: 0, regionIndex: 1 });
    const controller = new AbortController();
    const waiting = pool.render("bekleyen", {
      frameIndex: 1,
      regionIndex: 0,
      signal: controller.signal,
    });

    controller.abort();
    await expect(waiting).rejects.toMatchObject({ code: "ABORTED" });
    workers[0].complete(0);
    workers[1].complete(0);
    await Promise.all([first, second]);
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    expect(workers[1].postMessage).toHaveBeenCalledTimes(1);
    pool.close();
  });

  it("kapatıldığında aktif ve bekleyen işleri reddeder", async () => {
    const workers = [controlledWorker(), controlledWorker()];
    let workerIndex = 0;
    const pool = createQrRenderPool({ workerFactory: () => workers[workerIndex++], size: 2 });
    const active = pool.render("aktif", { frameIndex: 0, regionIndex: 0 });
    const waiting = pool.render("bekleyen", { frameIndex: 1, regionIndex: 0 });
    pool.close();

    await expect(active).rejects.toMatchObject({ code: "CLOSED" });
    await expect(waiting).rejects.toMatchObject({ code: "CLOSED" });
  });

  it("işçi kurulumu yarıda kalırsa daha önce oluşturulan işçileri kapatır", () => {
    const firstWorker = controlledWorker();
    let callCount = 0;
    const workerFactory = () => {
      callCount += 1;
      if (callCount === 2) throw new DOMException("worker açılamadı", "SecurityError");
      return firstWorker;
    };

    expect(() => createQrRenderPool({ workerFactory, size: 2 })).toThrow("worker açılamadı");
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
  });
});

function controlledWorker() {
  return {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
    complete(callIndex) {
      const message = this.postMessage.mock.calls[callIndex][0];
      this.onmessage?.({ data: {
        id: message.id,
        frameIndex: message.frameIndex,
        regionIndex: message.regionIndex,
        width: 25,
        height: 25,
        pixels: new Uint8ClampedArray(25 * 25 * 4),
      } });
    },
  };
}
