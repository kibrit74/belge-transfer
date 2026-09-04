import { describe, expect, it } from 'vitest';
import { createLiveFountainEncoder } from '../live-qr/fountain.js';
import { encodeLiveFrame, parseLiveFrame } from '../live-qr/frame-v1.js';
import { createLiveQrPackage } from '../live-qr/package-v1.js';
import { createLiveQrReceiveSession } from '../live-qr/receive-session.js';
import { MAX_LIVE_QR_PACKAGE_BYTES } from '../live-qr/limits.js';
import {
  createStripeFountainEncoder,
  LIVE_V2_BLOCK_BYTES,
  STRIPE_DATA_COUNT,
} from '../live-qr/stripe-fountain-v2.js';
import { encodeLiveFrameV2, parseLiveFrameV2 } from '../live-qr/frame-v2.js';

function makeBytes(length, seed = 1) {
  let value = seed >>> 0;
  return Uint8Array.from({ length }, () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value & 0xff;
  });
}

async function makeTransfer(transferId, name, seed) {
  const packaged = await createLiveQrPackage(
    new File([makeBytes(4_000, seed)], name, { type: 'application/octet-stream' }),
  );
  const encoder = await createLiveFountainEncoder(packaged.bytes, { transferId });
  const frames = Array.from({ length: encoder.metadata.sourceCount }, (_, symbolId) => {
    const frame = parseLiveFrame(encodeLiveFrame(encoder.metadata, encoder.symbol(symbolId)));
    if (!frame) throw new Error('Test QRL1 karesi oluşturulamadı.');
    return frame;
  });
  return { frames, encoder, sha256: packaged.originalSha256 };
}

describe('QRL1 alım oturumu', () => {
  it('2 MiB büyüklüğündeki geçerli QRL2 aktarımının ilk sembolünü kabul eder', () => {
    const originalBytes = 2 * 1024 * 1024;
    const sourceCount = Math.ceil(originalBytes / LIVE_V2_BLOCK_BYTES);
    const session = createLiveQrReceiveSession();

    expect(session.accept({
      protocolVersion: 'QRL2',
      transferId: 'Qrl2SizeTest',
      sourceCount,
      blockBytes: LIVE_V2_BLOCK_BYTES,
      stripeDataCount: STRIPE_DATA_COUNT,
      originalBytes,
      sha256: 'A'.repeat(43),
      symbolId: 0,
      data: new Uint8Array(LIVE_V2_BLOCK_BYTES),
    })).toEqual({ accepted: true });
    expect(session.getState()).toBe('collecting');
  });

  it('QRL2 paket üst sınırını kabul eder, bir bayt üzerini reddeder', () => {
    const makeFrame = (originalBytes) => ({
      protocolVersion: 'QRL2',
      transferId: 'Qrl2LimitTst',
      sourceCount: Math.ceil(originalBytes / LIVE_V2_BLOCK_BYTES),
      blockBytes: LIVE_V2_BLOCK_BYTES,
      stripeDataCount: STRIPE_DATA_COUNT,
      originalBytes,
      sha256: 'A'.repeat(43),
      symbolId: 0,
      data: new Uint8Array(LIVE_V2_BLOCK_BYTES),
    });

    expect(createLiveQrReceiveSession().accept(makeFrame(MAX_LIVE_QR_PACKAGE_BYTES)))
      .toEqual({ accepted: true });
    expect(createLiveQrReceiveSession().accept(makeFrame(MAX_LIVE_QR_PACKAGE_BYTES + 1)))
      .toEqual({ accepted: false, reason: 'invalid-frame' });
  });

  it('QRL2 sistematik sembollerini paket SHA doğrulamasından sonra dosyaya dönüştürür', async () => {
    const packaged = await createLiveQrPackage(
      new File([makeBytes(4_000, 9)], 'qrl2.bin', { type: 'application/octet-stream' }),
    );
    const encoder = await createStripeFountainEncoder(packaged.bytes, { transferId: 'Qrl2Receive1' });
    const frames = Array.from({ length: encoder.metadata.sourceCount }, (_, symbolId) => (
      parseLiveFrameV2(encodeLiveFrameV2(encoder.metadata, encoder.symbol(symbolId)))
    ));
    const session = createLiveQrReceiveSession();

    const accepted = await session.acceptMany(frames);

    expect(accepted.results.every((result) => result.accepted)).toBe(true);
    expect(accepted.result).toMatchObject({ file: expect.any(File), sha256: packaged.originalSha256 });
    expect(accepted.result.file.name).toBe('qrl2.bin');
    expect(session.getState()).toBe('complete');
  });

  it('başka aktarımı ve metadata uyuşmazlığını reddeder; tam veri olmadan dosya vermez', async () => {
    const first = await makeTransfer('Ab12Cd34Ef56', 'bir.bin', 1);
    const second = await makeTransfer('Zy98Xw76Vu54', 'iki.bin', 2);
    const session = createLiveQrReceiveSession();

    expect(session.accept(first.frames[0])).toEqual({ accepted: true });
    expect(session.accept(second.frames[0])).toEqual({ accepted: false, reason: 'different-transfer' });
    expect(session.accept({ ...first.frames[1], sha256: 'A'.repeat(43) }))
      .toEqual({ accepted: false, reason: 'metadata-mismatch' });
    await expect(session.assemble()).resolves.toBeNull();

    await session.acceptMany(first.frames.slice(1));
    await expect(session.assemble()).resolves.toMatchObject({
      file: expect.any(File),
      sha256: first.sha256,
    });
    expect(session.getState()).toBe('complete');
  });

  it('paket SHA-256 doğrulanmadığında dosya sunmaz ve failed durumuna geçer', async () => {
    const transfer = await makeTransfer('Ab12Cd34Ef56', 'bozuk.bin', 3);
    const session = createLiveQrReceiveSession();
    const invalidHashMetadata = { ...transfer.encoder.metadata, sha256: 'A'.repeat(43) };

    for (const symbolId of Array.from({ length: transfer.encoder.metadata.sourceCount }, (_, index) => index)) {
      const frame = parseLiveFrame(
        encodeLiveFrame(invalidHashMetadata, transfer.encoder.symbol(symbolId)),
      );
      session.accept(frame);
    }

    await expect(session.assemble()).rejects.toMatchObject({ code: 'INTEGRITY_FAILED' });
    expect(session.getState()).toBe('failed');
  });

  it('boyut sınırını aşan geçerli kareyi failed durumuyla reddeder', async () => {
    const transfer = await makeTransfer('Ab12Cd34Ef56', 'sınır.bin', 4);
    const session = createLiveQrReceiveSession({ maxBytes: transfer.frames[0].originalBytes - 1 });

    expect(session.accept(transfer.frames[0])).toEqual({ accepted: false, reason: 'size-limit' });
    expect(session.getState()).toBe('failed');
  });
});
