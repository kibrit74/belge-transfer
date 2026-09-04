import { describe, expect, it } from 'vitest';
import { sha256Base64Url } from '../protocol/hash.js';
import { createLiveFountainDecoder, createLiveFountainEncoder } from '../live-qr/fountain.js';
import { MAX_LEGACY_LIVE_QR_PACKAGE_BYTES } from '../live-qr/limits.js';

function lostIds(count, seed) {
  const ids = Array.from({ length: count }, (_, id) => id);
  let state = seed >>> 0;
  for (let index = ids.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return new Set(ids.slice(0, Math.floor(count / 5)));
}

describe('Canlı QR 1 MiB yayın kapısı', () => {
  it('üç yüzde 20 kayıp deseniyle 60 saniye altında doğrulanmış sonuca ulaşır', { timeout: 60_000 }, async () => {
    const bytes = Uint8Array.from({ length: MAX_LEGACY_LIVE_QR_PACKAGE_BYTES }, (_, index) => (index * 37) & 0xff);
    const startedAt = performance.now();
    for (const transferId of ['Qr1MiBTest01', 'Qr1MiBTest02', 'Qr1MiBTest03']) {
      const encoder = await createLiveFountainEncoder(bytes, { transferId });
      const candidateCount = Math.ceil(encoder.metadata.sourceCount * 1.5);
      const loss = transferId.endsWith('01')
        ? new Set(Array.from({ length: candidateCount }, (_, id) => id).filter((id) => id % 5 === 0))
        : lostIds(candidateCount, transferId.endsWith('02') ? 0x1234 : 0x5678);
      const decoder = createLiveFountainDecoder(encoder.metadata);
      const retained = Array.from({ length: candidateCount }, (_, id) => id)
        .filter((id) => !loss.has(id))
        .reverse();
      retained.forEach((id) => decoder.accept(encoder.symbol(id)));
      expect(decoder.isComplete()).toBe(true);
      expect(await sha256Base64Url(decoder.bytes())).toBe(encoder.metadata.sha256);
    }
    expect(performance.now() - startedAt).toBeLessThan(60_000);
  });
});
