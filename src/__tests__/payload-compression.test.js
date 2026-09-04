import { describe, expect, it } from 'vitest';
import {
  MAX_TRANSFER_PAYLOAD_BYTES,
  prepareTransferPayload,
  restoreTransferPayload,
  shouldAttemptCompression,
} from '../transfer/payload-compression.js';

function noisyBytes(length) {
  let state = 0x12345678;
  return Uint8Array.from({ length }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  });
}

describe('akıllı aktarım sıkıştırması', () => {
  it.each([
    ['JPEG', { mimeType: 'image/jpeg', fileName: 'photo.jpg' }],
    ['PNG', { mimeType: 'image/png', fileName: 'photo.png' }],
    ['MP4', { mimeType: 'video/mp4', fileName: 'video.mp4' }],
    ['ZIP', { mimeType: 'application/zip', fileName: 'archive.zip' }],
  ])('%s dosyasında sıkıştırmayı atlar', async (_fileType, options) => {
    const input = new Uint8Array(4096).fill(65);

    expect(shouldAttemptCompression(options)).toBe(false);

    const prepared = await prepareTransferPayload(input, options);
    expect(prepared.compression).toBe('none');
    expect(prepared.storedBytes).toEqual(input);
    expect(prepared.storedBytes).not.toBe(input);
    expect(prepared.savedBytes).toBe(0);
    expect(prepared.savedPercent).toBe(0);
  });

  it('50 MiB + 64 KiB sınırındaki dosyayı kabul eder', async () => {
    const input = new Uint8Array(MAX_TRANSFER_PAYLOAD_BYTES);

    await expect(
      prepareTransferPayload(input, { fileName: 'archive.zip' }),
    ).resolves.toMatchObject({
      compression: 'none',
      originalSize: MAX_TRANSFER_PAYLOAD_BYTES,
      storedSize: MAX_TRANSFER_PAYLOAD_BYTES,
      savedBytes: 0,
      savedPercent: 0,
    });
  }, 15_000);

  it('100 KB tekrarlı veriyi en az yüzde 90 küçültür', async () => {
    const input = new Uint8Array(100 * 1024).fill(65);
    const prepared = await prepareTransferPayload(input);
    expect(prepared.compression).toBe('zlib');
    expect(prepared.storedSize).toBeLessThanOrEqual(input.length * 0.10);
    await expect(restoreTransferPayload(prepared.storedBytes, prepared))
      .resolves.toEqual(input);
  });

  it('sıkıştırılamayan veriyi büyütmeden none seçer', async () => {
    const input = noisyBytes(100 * 1024);
    const prepared = await prepareTransferPayload(input);
    expect(prepared.compression).toBe('none');
    expect(prepared.storedSize).toBe(input.length);
  });

  it('bozulan saklanmış veriyi dosya olarak döndürmez', async () => {
    const prepared = await prepareTransferPayload(new Uint8Array(4096).fill(7));
    const damaged = new Uint8Array(prepared.storedBytes);
    damaged[damaged.length - 1] ^= 1;
    await expect(restoreTransferPayload(damaged, prepared))
      .rejects.toMatchObject({ code: 'FILE_HASH_MISMATCH' });
  });

  it('açılmış özgün verinin özeti uyuşmazsa dosyayı döndürmez', async () => {
    const prepared = await prepareTransferPayload(new Uint8Array(4096).fill(7));
    const invalidOriginalHash = 'A'.repeat(43);
    const metadata = { ...prepared, originalSha256: invalidOriginalHash };

    await expect(restoreTransferPayload(prepared.storedBytes, metadata))
      .rejects.toMatchObject({ code: 'FILE_HASH_MISMATCH' });
  });

  it('açılmış özgün veri boyutu uyuşmazsa dosyayı döndürmez', async () => {
    const prepared = await prepareTransferPayload(new Uint8Array(4096).fill(7));
    const metadata = { ...prepared, originalSize: prepared.originalSize + 1 };

    await expect(restoreTransferPayload(prepared.storedBytes, metadata))
      .rejects.toMatchObject({ code: 'FILE_HASH_MISMATCH' });
  });
});
