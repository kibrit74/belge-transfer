import { describe, expect, it, vi } from "vitest";
import { createQrWorkerPool } from "../video/qr-worker-pool.js";

function makeWorker(label) {
  return {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(function postMessage(message) {
      queueMicrotask(() => this.onmessage?.({
        data: { id: message.id, texts: [`${label}-${message.regionIndex}`] },
      }));
    }),
    terminate: vi.fn(),
  };
}

function makeControlledWorker() {
  return {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
    complete(callIndex, texts) {
      const message = this.postMessage.mock.calls[callIndex][0];
      this.onmessage?.({ data: { id: message.id, texts } });
    },
  };
}

describe("QR işçi havuzu", () => {
  it("iki bölgeyi sınırlı işçilere dağıtıp sırasıyla döndürür", async () => {
    const workers = [makeWorker("a"), makeWorker("b")];
    const factory = vi.fn(() => workers[factory.mock.calls.length - 1]);
    const pool = createQrWorkerPool({ workerFactory: factory, size: 2 });

    const texts = await pool.decode([
      { imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 } },
      { imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 } },
    ]);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(texts).toEqual(["a-0", "b-1"]);
    pool.close();
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  });

  it("iptal edilmiş işi işçilere göndermez", async () => {
    const controller = new AbortController();
    controller.abort();
    const worker = makeWorker("a");
    const pool = createQrWorkerPool({ workerFactory: () => worker, size: 1 });

    await expect(pool.decode([{ imageData: {} }], controller.signal)).rejects.toMatchObject({
      code: "ABORTED",
    });
    expect(worker.postMessage).not.toHaveBeenCalled();
    pool.close();
  });

  it("bir işçi tamamlanmadan aynı işçiye ikinci işi göndermez", async () => {
    const workers = [makeControlledWorker(), makeControlledWorker()];
    let workerIndex = 0;
    const pool = createQrWorkerPool({
      workerFactory: () => workers[workerIndex++],
      size: 2,
    });
    const regions = [
      { imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 } },
      { imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 } },
    ];

    const first = pool.decode(regions);
    const second = pool.decode(regions);

    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    expect(workers[1].postMessage).toHaveBeenCalledTimes(1);

    workers[0].complete(0, ["ilk-sol"]);
    await Promise.resolve();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);

    workers[1].complete(0, ["ilk-sağ"]);
    workers[0].complete(1, ["ikinci-sol"]);
    await Promise.resolve();
    workers[1].complete(1, ["ikinci-sağ"]);

    await expect(first).resolves.toEqual(["ilk-sol", "ilk-sağ"]);
    await expect(second).resolves.toEqual(["ikinci-sol", "ikinci-sağ"]);
    pool.close();
  });
});
