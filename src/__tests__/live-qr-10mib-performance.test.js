import { describe, expect, it } from 'vitest';
import { MAX_LIVE_QR_INPUT_BYTES } from '../live-qr/limits.js';
import { createLiveQrPackage } from '../live-qr/package-v1.js';
import { createLiveQrReceiveSession } from '../live-qr/receive-session.js';
import { createStripeFountainEncoder } from '../live-qr/stripe-fountain-v2.js';

function makeDeterministicBytes(length) {
  const bytes = new Uint8Array(length);
  let state = 0x51a7cafe;
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

describe('Canlı QR 10 MiB otomatik yayın kapısı', () => {
  it('1,5 kat aday ve her beşinci sembol kaybıyla 30 saniye altında dosyayı doğrular', { timeout: 30_000 }, async () => {
    const source = makeDeterministicBytes(MAX_LIVE_QR_INPUT_BYTES);
    const packaged = await createLiveQrPackage(
      new File([source], 'on-megabayt.zip', { type: 'application/zip' }),
    );
    const encoder = await createStripeFountainEncoder(packaged.bytes, {
      transferId: 'Qr10MiBTest1',
    });
    const session = createLiveQrReceiveSession();
    const candidateCount = Math.ceil(encoder.metadata.sourceCount * 1.5);
    const startedAt = performance.now();

    for (let symbolId = candidateCount - 1; symbolId >= 0; symbolId -= 1) {
      if (symbolId % 5 === 0) continue;
      session.accept({
        protocolVersion: 'QRL2',
        ...encoder.metadata,
        ...encoder.symbol(symbolId),
      });
    }

    const result = await session.assemble();
    const elapsedMs = performance.now() - startedAt;

    expect(session.getState()).toBe('complete');
    expect(result?.file.name).toBe('on-megabayt.zip');
    expect(result?.file.size).toBe(source.length);
    expect(result?.sha256).toBe(packaged.originalSha256);
    expect(elapsedMs).toBeLessThan(30_000);
  });
});
