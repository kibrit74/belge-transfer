import { describe, expect, it } from 'vitest';
import { createFountainEncoder } from '../optical/fountain.js';
import { createColorReceiveSession } from '../optical/color-receive-session.js';

function asFrame(metadata, symbol) {
  return {
    protocolVersion: 'CRF2',
    ...metadata,
    symbolId: symbol.symbolId,
    data: symbol.data,
  };
}

describe('renkli QR alım oturumu', () => {
  it('eksik ilk ana sembolü kurtarma sembolünden tamamlar', async () => {
    const input = Uint8Array.from({ length: 8 * 380 }, (_, index) => index & 0xff);
    const encoder = await createFountainEncoder(input, {
      transferId: 'Ab12Cd34Ef56',
      blockBytes: 380,
      emissionRatio: 1.30,
    });
    const session = createColorReceiveSession();

    for (const symbol of encoder.symbols().filter((item) => item.symbolId !== 0)) {
      session.accept(asFrame(encoder.metadata, symbol));
    }

    await expect(session.assemble()).resolves.toEqual({
      bytes: input,
      metadata: expect.objectContaining({ transferId: 'Ab12Cd34Ef56' }),
    });
  });

  it('başka aktarımın karesini mevcut oturuma eklemez', async () => {
    const encoder = await createFountainEncoder(new Uint8Array(760), {
      transferId: 'Ab12Cd34Ef56',
      blockBytes: 380,
    });
    const session = createColorReceiveSession();
    const first = asFrame(encoder.metadata, encoder.symbol(0));

    expect(session.accept(first)).toMatchObject({ accepted: true });
    expect(session.accept({ ...first, transferId: 'Zy98Xw76Vu54', symbolId: 1 }))
      .toEqual({ accepted: false, reason: 'different-transfer' });
  });

  it('yanlış kapsayıcı hashinde bayt sunmaz', async () => {
    const encoder = await createFountainEncoder(new Uint8Array(380).fill(9), {
      transferId: 'Ab12Cd34Ef56',
      blockBytes: 380,
    });
    const session = createColorReceiveSession();

    session.accept(asFrame({ ...encoder.metadata, sha256: 'A'.repeat(43) }, encoder.symbol(0)));

    await expect(session.assemble()).rejects.toMatchObject({ code: 'CONTAINER_HASH_MISMATCH' });
    expect(session.getState()).toBe('failed');
  });
});
