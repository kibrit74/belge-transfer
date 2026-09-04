import { describe, expect, it, vi } from 'vitest';
import { createLiveQrRenderPool } from '../live-qr/render-pool.js';
import { rasterizeLiveQrText } from '../live-qr/qr-raster.js';
import { createLiveQrRasterWorkerMessageHandler } from '../workers/live-qr-render.worker.js';

class ControlledWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.postMessage = vi.fn();
    this.terminate = vi.fn();
  }

  complete(index = 0) {
    const message = this.postMessage.mock.calls[index][0];
    this.onmessage?.({ data: {
      id: message.id,
      frameIndex: message.frameIndex,
      regionIndex: message.regionIndex,
      width: 25,
      height: 25,
      pixels: new Uint8ClampedArray(25 * 25 * 4),
    } });
  }
}

describe('Canlı QR raster ve render havuzu', () => {
  it('QRL1 metnini siyah-beyaz M hata düzeltmeli rastera çevirir', () => {
    const raster = rasterizeLiveQrText('QRL1|Ab12Cd34Ef56|0|1|1000|1|AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA|1|d3d99e8b|AA');

    expect(raster).toMatchObject({ margin: 2, width: expect.any(Number), height: expect.any(Number) });
    expect(raster.pixels).toBeInstanceOf(Uint8ClampedArray);
  });

  it('worker raster piksellerini aktarılabilir buffer ile döndürür', async () => {
    const postMessage = vi.fn();
    const handleMessage = createLiveQrRasterWorkerMessageHandler({
      postMessage,
      rasterize: vi.fn(() => ({
        width: 25,
        height: 25,
        pixels: new Uint8ClampedArray(25 * 25 * 4),
      })),
    });

    await handleMessage({ data: { id: 3, frameIndex: 1, regionIndex: 0, text: 'QRL1|örnek' } });

    const [result, transfer] = postMessage.mock.calls[0];
    expect(result).toMatchObject({ id: 3, frameIndex: 1, regionIndex: 0 });
    expect(transfer).toEqual([result.pixels.buffer]);
  });

  it('kapandığında bekleyen ve çalışan işleri CLOSED ile reddeder', async () => {
    const workers = [new ControlledWorker(), new ControlledWorker()];
    let workerIndex = 0;
    const pool = createLiveQrRenderPool({ workerFactory: () => workers[workerIndex++], size: 2 });
    const active = pool.render('ilk', { frameIndex: 0, regionIndex: 0 });
    const queued = pool.render('ikinci', { frameIndex: 1, regionIndex: 0 });

    pool.close();

    await expect(active).rejects.toMatchObject({ code: 'CLOSED' });
    await expect(queued).rejects.toMatchObject({ code: 'CLOSED' });
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  });
});
