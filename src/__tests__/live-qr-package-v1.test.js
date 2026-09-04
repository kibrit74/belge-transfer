import { describe, expect, it } from 'vitest';
import {
  MAX_LIVE_QR_INPUT_BYTES,
  createLiveQrPackage,
  openLiveQrPackage,
} from '../live-qr/package-v1.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function readPackage(bytes) {
  const metadataLength = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(4, false);
  const metadataEnd = 8 + metadataLength;
  return {
    metadata: JSON.parse(decoder.decode(bytes.subarray(8, metadataEnd))),
    payload: bytes.subarray(metadataEnd),
  };
}

function rebuildPackage(metadata, payload) {
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  const bytes = new Uint8Array(8 + metadataBytes.length + payload.length);
  bytes.set(encoder.encode('LQP1'));
  new DataView(bytes.buffer).setUint32(4, metadataBytes.length, false);
  bytes.set(metadataBytes, 8);
  bytes.set(payload, 8 + metadataBytes.length);
  return bytes;
}

describe('LQP1 Canlı QR paketi', () => {
  it('UTF-8 dosya adını, MIME türünü ve içeriği LQP1 paketi içinde kayıpsız taşır', async () => {
    const file = new File([encoder.encode('Merhaba, dünya!')], 'özgeçmiş-ğüş.txt', {
      type: 'text/plain;charset=utf-8',
    });

    const created = await createLiveQrPackage(file);
    const opened = await openLiveQrPackage(created.bytes);

    expect(Array.from(created.bytes.subarray(0, 4))).toEqual([76, 81, 80, 49]);
    expect(created).toMatchObject({
      compression: 'none',
      originalSize: 16,
      storedSize: 16,
    });
    expect(opened.file.name).toBe('özgeçmiş-ğüş.txt');
    expect(opened.file.type).toBe('text/plain;charset=utf-8');
    await expect(opened.file.text()).resolves.toBe('Merhaba, dünya!');
    expect(opened).toMatchObject({
      compression: 'none',
      sha256: created.originalSha256,
    });
  });

  it('paket metadata alanlarını tam olarak sözleşmedeki yedi anahtarla yazar', async () => {
    const created = await createLiveQrPackage(new File(['a'], 'not.txt', { type: 'text/plain' }));
    const { metadata } = readPackage(created.bytes);

    expect(Object.keys(metadata).sort()).toEqual([
      'compression',
      'name',
      'originalSha256',
      'originalSize',
      'storedSha256',
      'storedSize',
      'type',
    ]);
  });

  it('2 MiB sınırını aşan dosyayı içeriğini okumadan reddeder', async () => {
    let wasRead = false;
    const tooLargeFile = {
      name: 'büyük.bin',
      type: 'application/octet-stream',
      size: (2 * 1024 * 1024) + 1,
      async arrayBuffer() {
        wasRead = true;
        return new ArrayBuffer(0);
      },
    };

    await expect(createLiveQrPackage(tooLargeFile)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(wasRead).toBe(false);
    expect(MAX_LIVE_QR_INPUT_BYTES).toBe(2 * 1024 * 1024);
  });

  it('saklanan verideki tek byte bozulmasını HASH_MISMATCH ile reddeder', async () => {
    const created = await createLiveQrPackage(
      new File([new Uint8Array([5, 9, 2, 8])], 'veri.zip', { type: 'application/zip' }),
    );
    const damaged = new Uint8Array(created.bytes);
    damaged[damaged.length - 1] ^= 1;

    await expect(openLiveQrPackage(damaged)).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
  });

  it('fazla veya eksik metadata alanları olan paketleri reddeder', async () => {
    const created = await createLiveQrPackage(new File(['içerik'], 'not.txt', { type: 'text/plain' }));
    const { metadata, payload } = readPackage(created.bytes);
    const withExtraKey = rebuildPackage({ ...metadata, extra: true }, payload);
    const { type: _type, ...withoutType } = metadata;
    const withMissingKey = rebuildPackage(withoutType, payload);

    await expect(openLiveQrPackage(withExtraKey)).rejects.toMatchObject({ code: 'INVALID_LIVE_QR_PACKAGE' });
    await expect(openLiveQrPackage(withMissingKey)).rejects.toMatchObject({ code: 'INVALID_LIVE_QR_PACKAGE' });
  });

  it('metadata içindeki özgün SHA-256 değeri uymazsa paketi reddeder', async () => {
    const created = await createLiveQrPackage(new File(['içerik'], 'not.txt', { type: 'text/plain' }));
    const { metadata, payload } = readPackage(created.bytes);
    const tampered = rebuildPackage({ ...metadata, originalSha256: 'A'.repeat(43) }, payload);

    await expect(openLiveQrPackage(tampered)).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
  });
});
