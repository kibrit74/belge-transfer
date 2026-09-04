import { describe, expect, it, vi } from 'vitest';
import { createColorQrWorkerClient } from '../workers/color-qr-client.js';
import {
  createColorQrWorkerMessageHandler,
  pickCompressionStats,
} from '../workers/color-qr.worker.js';

class FakeWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.messages = [];
    this.terminate = vi.fn();
  }

  postMessage(message, transfer = []) {
    this.messages.push({ message, transfer });
  }

  reply(data) {
    this.onmessage?.({ data });
  }
}

describe('renkli QR worker istemcisi', () => {
  it('hazırlanan yükü eşleşen istek ve oturum yanıtıyla çözer', async () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });

    const promise = client.preparePayload('session-1', new Uint8Array([1, 2, 3]));
    const [{ message }] = worker.messages;
    worker.reply({
      type: 'prepared-payload',
      sessionId: 'session-1',
      requestId: message.requestId,
      result: { storedSize: 3 },
    });

    await expect(promise).resolves.toEqual({ storedSize: 3 });
    expect(message).toMatchObject({
      type: 'prepare-payload',
      sessionId: 'session-1',
      bytes: new Uint8Array([1, 2, 3]),
    });
  });

  it('kapatılan oturumun bekleyen görüntü çözümünü geç yanıt gelse de reddeder', async () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });
    const pending = client.decodeImage('session-old', {
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    });
    const requestId = worker.messages[0].message.requestId;

    client.disposeSession('session-old');
    worker.reply({
      type: 'decoded-frame',
      sessionId: 'session-old',
      requestId,
      result: { scan: null, frame: null },
    });

    await expect(pending).rejects.toMatchObject({ code: 'STALE_SESSION' });
  });

  it('sonlandırma bekleyen kare isteğini reddeder ve workerı yalnız bir kez kapatır', async () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });
    const first = client.getFrame('session-1', 0);
    const second = client.getFrame('session-2', 1);

    client.terminate();
    client.terminate();

    await expect(first).rejects.toMatchObject({ code: 'WORKER_TERMINATED' });
    await expect(second).rejects.toMatchObject({ code: 'WORKER_TERMINATED' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('worker desteği açıkça kapatıldığında anlaşılır hata verir', () => {
    expect(() => createColorQrWorkerClient({ worker: null })).toThrow(
      expect.objectContaining({ code: 'COLOR_UNSUPPORTED' }),
    );
  });

  it('aktarılabilir verileri kopyalar ve çağıranın bufferlarını ayırmaz', () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });
    const payload = new Uint8Array([4, 5, 6]);
    const optical = new Uint8Array([7, 8]);
    const pixels = new Uint8ClampedArray([9, 10, 11, 255]);

    client.preparePayload('session-1', payload);
    client.prepareOptical('session-1', optical, { transferId: 'Ab12Cd34Ef56' });
    client.decodeImage('session-1', { data: pixels, width: 1, height: 1 });

    expect(worker.messages[0].message.bytes.buffer).not.toBe(payload.buffer);
    expect(worker.messages[0].transfer).toEqual([worker.messages[0].message.bytes.buffer]);
    expect(worker.messages[1].message.bytes.buffer).not.toBe(optical.buffer);
    expect(worker.messages[1].transfer).toEqual([worker.messages[1].message.bytes.buffer]);
    expect(worker.messages[2].message.imageData.data.buffer).not.toBe(pixels.buffer);
    expect(worker.messages[2].transfer).toEqual([worker.messages[2].message.imageData.data.buffer]);
    expect(payload).toEqual(new Uint8Array([4, 5, 6]));
    expect(optical).toEqual(new Uint8Array([7, 8]));
    expect(pixels).toEqual(new Uint8ClampedArray([9, 10, 11, 255]));
  });

  it('worker çalışma hatasında bütün bekleyen işleri tipli hatayla kapatır', async () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });
    const first = client.getFrame('session-1', 0);
    const second = client.getFrame('session-2', 1);

    worker.onerror({ message: 'Worker çöktü' });

    await expect(first).rejects.toMatchObject({ code: 'WORKER_ERROR', message: 'Worker çöktü' });
    await expect(second).rejects.toMatchObject({ code: 'WORKER_ERROR' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('workerın tipli hata yanıtındaki kodu ve mesajı korur', async () => {
    const worker = new FakeWorker();
    const client = createColorQrWorkerClient({ worker });
    const pending = client.getFrame('session-1', 99);
    const requestId = worker.messages[0].message.requestId;

    worker.reply({
      type: 'error',
      sessionId: 'session-1',
      requestId,
      code: 'INVALID_COLOR_FRAME',
      message: 'Kare geçersiz.',
    });

    await expect(pending).rejects.toMatchObject({
      code: 'INVALID_COLOR_FRAME',
      message: 'Kare geçersiz.',
    });
  });
});

describe('renkli QR worker protokolü', () => {
  it('sıkıştırma özetinde büyük veriyi ve ek alanları ana ekrana taşımaz', () => {
    expect(pickCompressionStats({
      compression: 'zlib',
      originalSize: 100,
      storedSize: 40,
      savedBytes: 60,
      savedPercent: 60,
      storedBytes: new Uint8Array(40),
      originalSha256: 'özet',
    })).toEqual({
      compression: 'zlib',
      originalSize: 100,
      storedSize: 40,
      savedBytes: 60,
      savedPercent: 60,
    });
  });

  it('optik oturumu sabit fountain ayarlarıyla hazırlar ve kareyi istek üzerine üretir', async () => {
    const postMessage = vi.fn();
    const symbol = { transferId: 'Ab12Cd34Ef56', symbolId: 2, data: new Uint8Array([8]) };
    const encoder = {
      metadata: {
        transferId: 'Ab12Cd34Ef56',
        sourceCount: 3,
        emittedSymbols: 4,
        blockBytes: 380,
        originalBytes: 700,
        sha256: 'A'.repeat(43),
      },
      symbol: vi.fn(() => symbol),
    };
    const createFountainEncoder = vi.fn(async () => encoder);
    const encodeColorFrameV2 = vi.fn(() => new Uint8Array([1, 2, 3]));
    const handler = createColorQrWorkerMessageHandler({
      postMessage,
      prepareTransferPayload: vi.fn(),
      createColorPackageV2: vi.fn(),
      createFountainEncoder,
      encodeColorFrameV2,
      scanColorMatrixV2: vi.fn(),
      parseColorFrameV2: vi.fn(),
    });

    await handler({ data: {
      type: 'prepare-optical',
      sessionId: 'session-1',
      requestId: 1,
      bytes: new Uint8Array([4, 5, 6]),
      options: { transferId: 'Ab12Cd34Ef56' },
    } });
    await handler({ data: {
      type: 'get-frame',
      sessionId: 'session-1',
      requestId: 2,
      symbolId: 2,
    } });

    expect(createFountainEncoder).toHaveBeenCalledWith(
      new Uint8Array([4, 5, 6]),
      { transferId: 'Ab12Cd34Ef56', blockBytes: 380, emissionRatio: 1.30 },
    );
    expect(postMessage.mock.calls[0][0]).toEqual({
      type: 'prepared-optical',
      sessionId: 'session-1',
      requestId: 1,
      result: {
        transferId: 'Ab12Cd34Ef56',
        sourceCount: 3,
        emittedSymbols: 4,
        blockBytes: 380,
        originalBytes: 700,
        compressionStats: null,
      },
    });
    expect(encoder.symbol).toHaveBeenCalledWith(2);
    expect(encodeColorFrameV2).toHaveBeenCalledWith(encoder.metadata, symbol);
    expect(postMessage.mock.calls[1]).toEqual([{
      type: 'color-frame',
      sessionId: 'session-1',
      requestId: 2,
      result: { frameBytes: new Uint8Array([1, 2, 3]) },
    }, [postMessage.mock.calls[1][0].result.frameBytes.buffer]]);
  });

  it('prepare-payload tam sonucu doğru buffer transferiyle yollar', async () => {
    const postMessage = vi.fn();
    const storedBytes = new Uint8Array([4, 5]);
    const prepared = {
      storedBytes,
      compression: 'none',
      originalSize: 2,
      storedSize: 2,
      originalSha256: 'özgün-özet',
      storedSha256: 'saklanan-özet',
      savedBytes: 0,
      savedPercent: 0,
    };
    const handler = createColorQrWorkerMessageHandler({
      postMessage,
      prepareTransferPayload: vi.fn(async () => prepared),
      createColorPackageV2: vi.fn(),
      createFountainEncoder: vi.fn(),
      encodeColorFrameV2: vi.fn(),
      scanColorMatrixV2: vi.fn(),
      parseColorFrameV2: vi.fn(),
    });

    await handler({ data: {
      type: 'prepare-payload',
      sessionId: 'session-payload',
      requestId: 10,
      bytes: new Uint8Array([4, 5]),
    } });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'prepared-payload',
      sessionId: 'session-payload',
      requestId: 10,
      result: prepared,
    }, [storedBytes.buffer]);
  });

  it('prepare-package yalnız izinli sıkıştırma özetiyle optik sonucu yollar', async () => {
    const postMessage = vi.fn();
    const stats = {
      compression: 'zlib',
      originalSize: 1000,
      storedSize: 250,
      savedBytes: 750,
      savedPercent: 75,
      storedBytes: new Uint8Array(250),
      originalSha256: 'özgün-özet',
      storedSha256: 'saklanan-özet',
    };
    const handler = createColorQrWorkerMessageHandler({
      postMessage,
      prepareTransferPayload: vi.fn(),
      createColorPackageV2: vi.fn(async () => ({
        containerBytes: new Uint8Array([1, 2, 3]),
        metadata: { transferId: 'Ab12Cd34Ef56' },
        stats,
      })),
      createFountainEncoder: vi.fn(async () => ({
        metadata: {
          transferId: 'Ab12Cd34Ef56', sourceCount: 2, emittedSymbols: 3,
          blockBytes: 380, originalBytes: 3, sha256: 'A'.repeat(43),
        },
        symbol: vi.fn(),
      })),
      encodeColorFrameV2: vi.fn(),
      scanColorMatrixV2: vi.fn(),
      parseColorFrameV2: vi.fn(),
    });

    await handler({ data: {
      type: 'prepare-package',
      sessionId: 'session-package',
      requestId: 11,
      input: { payload: new Uint8Array([7]), transferId: 'Ab12Cd34Ef56' },
    } });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'prepared-package',
      sessionId: 'session-package',
      requestId: 11,
      result: {
        transferId: 'Ab12Cd34Ef56',
        sourceCount: 2,
        emittedSymbols: 3,
        blockBytes: 380,
        originalBytes: 3,
        compressionStats: {
          compression: 'zlib',
          originalSize: 1000,
          storedSize: 250,
          savedBytes: 750,
          savedPercent: 75,
        },
      },
    }, []);
    expect(postMessage.mock.calls[0][0].result.compressionStats)
      .not.toHaveProperty('storedBytes');
  });

  it('hazırlık sürerken kapatılan oturumu async sonuçla yeniden oluşturmaz', async () => {
    let resolveEncoder;
    const encoderPromise = new Promise((resolve) => {
      resolveEncoder = resolve;
    });
    const opticalSessions = new Map();
    const postMessage = vi.fn();
    const handler = createColorQrWorkerMessageHandler({
      postMessage,
      opticalSessions,
      prepareTransferPayload: vi.fn(),
      createColorPackageV2: vi.fn(),
      createFountainEncoder: vi.fn(() => encoderPromise),
      encodeColorFrameV2: vi.fn(),
      scanColorMatrixV2: vi.fn(),
      parseColorFrameV2: vi.fn(),
    });

    const preparing = handler({ data: {
      type: 'prepare-optical',
      sessionId: 'session-race',
      requestId: 1,
      bytes: new Uint8Array([1]),
      options: { transferId: 'Ab12Cd34Ef56' },
    } });
    await Promise.resolve();
    await handler({ data: {
      type: 'dispose-session',
      sessionId: 'session-race',
      requestId: 2,
    } });
    resolveEncoder({
      metadata: {
        transferId: 'Ab12Cd34Ef56', sourceCount: 1, emittedSymbols: 2,
        blockBytes: 380, originalBytes: 1, sha256: 'A'.repeat(43),
      },
      symbol: vi.fn(),
    });
    await preparing;
    await handler({ data: {
      type: 'get-frame',
      sessionId: 'session-race',
      requestId: 3,
      symbolId: 0,
    } });

    expect(opticalSessions.size).toBe(0);
    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      expect.objectContaining({
        type: 'error', requestId: 1, sessionId: 'session-race', code: 'STALE_SESSION',
      }),
      expect.objectContaining({
        type: 'error', requestId: 3, sessionId: 'session-race', code: 'STALE_SESSION',
      }),
    ]);
  });

  it('eski hazırlığın geç sonucu daha yeni aynı oturum kaydını silmez', async () => {
    let resolveOldEncoder;
    let resolveNewEncoder;
    const oldEncoderPromise = new Promise((resolve) => { resolveOldEncoder = resolve; });
    const newEncoderPromise = new Promise((resolve) => { resolveNewEncoder = resolve; });
    const oldEncoder = {
      metadata: {
        transferId: 'Ab12Cd34Ef56', sourceCount: 1, emittedSymbols: 2,
        blockBytes: 380, originalBytes: 1, sha256: 'A'.repeat(43),
      },
      symbol: vi.fn(),
    };
    const newSymbol = {
      transferId: 'Ab12Cd34Ef56', symbolId: 0, data: new Uint8Array(380),
    };
    const newEncoder = {
      metadata: {
        transferId: 'Ab12Cd34Ef56', sourceCount: 1, emittedSymbols: 2,
        blockBytes: 380, originalBytes: 1, sha256: 'A'.repeat(43),
      },
      symbol: vi.fn(() => newSymbol),
    };
    const opticalSessions = new Map();
    const postMessage = vi.fn();
    const handler = createColorQrWorkerMessageHandler({
      postMessage,
      opticalSessions,
      prepareTransferPayload: vi.fn(),
      createColorPackageV2: vi.fn(),
      createFountainEncoder: vi.fn()
        .mockImplementationOnce(() => oldEncoderPromise)
        .mockImplementationOnce(() => newEncoderPromise),
      encodeColorFrameV2: vi.fn(() => new Uint8Array([9])),
      scanColorMatrixV2: vi.fn(),
      parseColorFrameV2: vi.fn(),
    });
    const oldPreparation = handler({ data: {
      type: 'prepare-optical', sessionId: 'session-reused', requestId: 20,
      bytes: new Uint8Array([1]), options: { transferId: 'Ab12Cd34Ef56' },
    } });
    await Promise.resolve();
    await handler({ data: {
      type: 'dispose-session', sessionId: 'session-reused', requestId: 21,
    } });
    const newPreparation = handler({ data: {
      type: 'prepare-optical', sessionId: 'session-reused', requestId: 22,
      bytes: new Uint8Array([2]), options: { transferId: 'Ab12Cd34Ef56' },
    } });
    resolveNewEncoder(newEncoder);
    await newPreparation;
    resolveOldEncoder(oldEncoder);
    await oldPreparation;
    await handler({ data: {
      type: 'get-frame', sessionId: 'session-reused', requestId: 23, symbolId: 0,
    } });

    expect(opticalSessions.get('session-reused')).toBe(newEncoder);
    expect(oldEncoder.symbol).not.toHaveBeenCalled();
    expect(newEncoder.symbol).toHaveBeenCalledWith(0);
    expect(postMessage.mock.calls.map(([message]) => message.type))
      .toEqual(['prepared-optical', 'error', 'color-frame']);
  });

  it('görüntü taramasını ayrıştırır ve yalnız kare verisini transfer eder', async () => {
    const postMessage = vi.fn();
    const scan = { frameBytes: new Uint8Array([3, 4]), confidence: 0.91 };
    const frame = { symbolId: 1, data: new Uint8Array([5, 6]) };
    const handler = createColorQrWorkerMessageHandler({
      postMessage,
      prepareTransferPayload: vi.fn(),
      createColorPackageV2: vi.fn(),
      createFountainEncoder: vi.fn(),
      encodeColorFrameV2: vi.fn(),
      scanColorMatrixV2: vi.fn(() => scan),
      parseColorFrameV2: vi.fn(() => frame),
    });

    await handler({ data: {
      type: 'decode-image',
      sessionId: 'session-1',
      requestId: 3,
      imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 },
    } });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'decoded-frame',
      sessionId: 'session-1',
      requestId: 3,
      result: { scan, frame },
    }, [frame.data.buffer]);
  });

  it('görüntü bulunmadığında boş tarama sonucunu kare ayrıştırmadan yollar', async () => {
    const postMessage = vi.fn();
    const parseColorFrameV2 = vi.fn();
    const handler = createColorQrWorkerMessageHandler({
      postMessage,
      prepareTransferPayload: vi.fn(),
      createColorPackageV2: vi.fn(),
      createFountainEncoder: vi.fn(),
      encodeColorFrameV2: vi.fn(),
      scanColorMatrixV2: vi.fn(() => null),
      parseColorFrameV2,
    });

    await handler({ data: {
      type: 'decode-image',
      sessionId: 'session-empty-scan',
      requestId: 30,
      imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 },
    } });

    expect(parseColorFrameV2).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'decoded-frame',
      sessionId: 'session-empty-scan',
      requestId: 30,
      result: { scan: null, frame: null },
    }, []);
  });

  it('bilinmeyen worker isteğini doğrudan kod ve mesaj taşıyan hatayla reddeder', async () => {
    const postMessage = vi.fn();
    const handler = createColorQrWorkerMessageHandler({ postMessage });

    await handler({ data: {
      type: 'bilinmeyen-istek',
      sessionId: 'session-invalid',
      requestId: 40,
    } });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      sessionId: 'session-invalid',
      requestId: 40,
      code: 'INVALID_WORKER_REQUEST',
      message: expect.any(String),
    });
  });

  it('worker hatasını kodu ve mesajıyla yanıtlar; oturum silindikten sonra kare üretmez', async () => {
    const postMessage = vi.fn();
    const encoder = {
      metadata: {
        transferId: 'Ab12Cd34Ef56', sourceCount: 1, emittedSymbols: 2,
        blockBytes: 380, originalBytes: 1, sha256: 'A'.repeat(43),
      },
      symbol: vi.fn(),
    };
    const handler = createColorQrWorkerMessageHandler({
      postMessage,
      prepareTransferPayload: vi.fn(),
      createColorPackageV2: vi.fn(),
      createFountainEncoder: vi.fn(async () => encoder),
      encodeColorFrameV2: vi.fn(),
      scanColorMatrixV2: vi.fn(),
      parseColorFrameV2: vi.fn(),
    });
    await handler({ data: {
      type: 'prepare-optical', sessionId: 'session-1', requestId: 1,
      bytes: new Uint8Array([1]), options: { transferId: 'Ab12Cd34Ef56' },
    } });
    await handler({ data: {
      type: 'dispose-session', sessionId: 'session-1', requestId: 2,
    } });
    await handler({ data: {
      type: 'get-frame', sessionId: 'session-1', requestId: 3, symbolId: 0,
    } });

    expect(encoder.symbol).not.toHaveBeenCalled();
    expect(postMessage.mock.calls.at(-1)[0]).toMatchObject({
      type: 'error',
      sessionId: 'session-1',
      requestId: 3,
      code: 'STALE_SESSION',
      message: expect.any(String),
    });
  });
});
