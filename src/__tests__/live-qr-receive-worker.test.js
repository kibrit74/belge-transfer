import { describe, expect, it, vi } from 'vitest';
import { createLiveFountainEncoder } from '../live-qr/fountain.js';
import { encodeLiveFrame } from '../live-qr/frame-v1.js';
import { createLiveQrPackage } from '../live-qr/package-v1.js';
import { createLiveQrReceiveClient } from '../live-qr/receive-client.js';
import { createLiveQrReceiveWorkerMessageHandler } from '../workers/live-qr-receive.worker.js';

async function makeFrameTexts() {
  const bytes = Uint8Array.from({ length: 3_000 }, (_, index) => (index * 71) & 0xff);
  const packaged = await createLiveQrPackage(
    new File([bytes], 'aktarim.bin', { type: 'application/octet-stream' }),
  );
  const encoder = await createLiveFountainEncoder(packaged.bytes, { transferId: 'Ab12Cd34Ef56' });
  return Array.from({ length: encoder.metadata.sourceCount }, (_, symbolId) => (
    encodeLiveFrame(encoder.metadata, encoder.symbol(symbolId))
  ));
}

class FakeWorker {
  constructor() {
    this.messages = [];
    this.onmessage = null;
    this.onerror = null;
    this.terminate = vi.fn();
  }

  postMessage(message) {
    this.messages.push(message);
  }

  emit(data) {
    this.onmessage?.({ data });
  }
}

describe('QRL1 alım worker sözleşmesi', () => {
  it('metin karelerini worker içinde doğrular ve yalnız tamamlanınca dosya mesajı yollar', async () => {
    const postMessage = vi.fn();
    const handler = createLiveQrReceiveWorkerMessageHandler({ postMessage });
    const texts = await makeFrameTexts();

    await handler({ data: { type: 'start', sessionId: 5 } });
    await handler({ data: { type: 'accept', sessionId: 5, texts } });

    const messages = postMessage.mock.calls.map(([message]) => message);
    const verifyingIndex = messages.findIndex((message) => (
      message.type === 'progress' && message.state === 'verifying'
    ));
    const completeIndex = messages.findIndex((message) => message.type === 'complete');
    expect(verifyingIndex).toBeGreaterThan(-1);
    expect(verifyingIndex).toBeLessThan(completeIndex);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'complete',
      sessionId: 5,
      result: expect.objectContaining({ file: expect.any(File) }),
    }));
  });

  it('bütünlük doğrulaması başarısızsa verifying ardından yalnız güvenli hata yollar', async () => {
    const postMessage = vi.fn();
    const session = {
      accept: vi.fn(() => ({ accepted: true })),
      progress: vi.fn(() => ({ solved: 1, sourceCount: 1, accepted: 1, duplicates: 0 })),
      assemble: vi.fn().mockRejectedValue(new Error('ham doğrulama ayrıntısı')),
      getState: vi.fn(() => 'failed'),
    };
    const handler = createLiveQrReceiveWorkerMessageHandler({
      postMessage,
      createSession: () => session,
    });

    await handler({ data: { type: 'start', sessionId: 9 } });
    await handler({ data: { type: 'accept', sessionId: 9, texts: ['geçerli kabul edilen metin'] } });

    const messages = postMessage.mock.calls.map(([message]) => message);
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'progress',
      state: 'verifying',
      sessionId: 9,
    }));
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'error',
      sessionId: 9,
    }));
    expect(messages.some((message) => message.type === 'complete')).toBe(false);
  });

  it('eski worker oturumundan gelen complete mesajını yeni oturuma yaymaz', () => {
    const worker = new FakeWorker();
    const client = createLiveQrReceiveClient({ workerFactory: () => worker });
    const listener = vi.fn();
    client.subscribe(listener);

    client.reset();
    worker.emit({
      type: 'complete',
      sessionId: 0,
      result: { file: new File(['x'], 'x.txt') },
    });

    expect(listener).not.toHaveBeenCalled();
    expect(client.getSessionId()).toBe(1);
    client.close();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('yeniden taramada eski worker oturumunu bellekten çıkarır', async () => {
    const postMessage = vi.fn();
    const sessions = [];
    const createSession = vi.fn(() => {
      const session = {
        progress: () => ({ solved: 0, sourceCount: 0, accepted: 0, duplicates: 0 }),
        getState: () => 'collecting',
        accept: vi.fn(),
        assemble: vi.fn().mockResolvedValue(null),
      };
      sessions.push(session);
      return session;
    });
    const handler = createLiveQrReceiveWorkerMessageHandler({ postMessage, createSession });

    await handler({ data: { type: 'start', sessionId: 0 } });
    await handler({ data: { type: 'reset', sessionId: 1 } });
    await handler({ data: { type: 'accept', sessionId: 0, texts: [] } });

    expect(sessions).toHaveLength(2);
    expect(sessions[0].accept).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'error',
      sessionId: 0,
      error: expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    }));
  });
});
