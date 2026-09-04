import { describe, expect, it, vi } from 'vitest';
import { createLiveQrDecodeWorkerMessageHandler } from '../workers/live-qr-decode.worker.js';

describe('Canlı QR hızlı worker çözümü', () => {
  it('normal karede yalnız tek QR için hızlı tarama yapar', async () => {
    const decode = vi.fn().mockResolvedValue([{ text: 'QRL2|hızlı' }]);
    const postMessage = vi.fn();
    const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const handler = createLiveQrDecodeWorkerMessageHandler({ decode, postMessage });

    await handler({ data: { id: 1, imageData } });

    expect(decode).toHaveBeenCalledWith(imageData, {
      formats: ['QRCode'],
      tryHarder: false,
      maxNumberOfSymbols: 1,
    });
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('her on ikinci başarısız karede zor taramayı yedek olarak dener', async () => {
    const decode = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ text: 'QRL2|yedek' }]);
    const postMessage = vi.fn();
    const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const handler = createLiveQrDecodeWorkerMessageHandler({ decode, postMessage });

    await handler({ data: { id: 12, imageData } });

    expect(decode).toHaveBeenNthCalledWith(2, imageData, {
      formats: ['QRCode'],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });
    expect(postMessage).toHaveBeenCalledWith({ id: 12, texts: ['QRL2|yedek'] });
  });
});
