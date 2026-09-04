import { describe, expect, it } from 'vitest';
import {
  createColorPackageV2,
  openColorPackageV2,
} from '../optical/color-package-v2.js';

describe('CQF2 kapsayıcısı', () => {
  it('UTF-8 dosya adı, tür ve içeriği kayıpsız açar', async () => {
    const payload = new TextEncoder().encode('İstanbul çözüm belgesi');
    const created = await createColorPackageV2({
      payload,
      name: 'İstanbul-çözüm-📄.txt',
      type: 'text/plain;charset=utf-8',
      transferId: 'Ab12Cd34Ef56',
    });
    const opened = await openColorPackageV2(created.containerBytes, {
      expectedTransferId: 'Ab12Cd34Ef56',
    });

    expect(Array.from(opened.payload)).toEqual(Array.from(payload));
    expect(opened.name).toBe('İstanbul-çözüm-📄.txt');
    expect(opened.type).toBe('text/plain;charset=utf-8');
    expect(opened.metadata).not.toHaveProperty('storedSha256');
  });

  it('başka optik aktarım kimliğiyle açılmaz', async () => {
    const created = await createColorPackageV2({
      payload: new Uint8Array([1, 2, 3]),
      name: 'kanıt.bin',
      type: 'application/octet-stream',
      transferId: 'Ab12Cd34Ef56',
    });

    await expect(openColorPackageV2(created.containerBytes, {
      expectedTransferId: 'Zy98Xw76Vu54',
    })).rejects.toMatchObject({ code: 'TRANSFER_MISMATCH' });
  });

  it('metadata uzunluğu 16 KiB üstündeyse veri ayırmaz', async () => {
    const invalid = new Uint8Array(9);
    invalid.set(new TextEncoder().encode('CQF2'));
    invalid[4] = 0x20;
    new DataView(invalid.buffer).setUint32(5, 16 * 1024 + 1, false);

    await expect(openColorPackageV2(invalid))
      .rejects.toMatchObject({ code: 'INVALID_COLOR_PACKAGE' });
  });

  it('tam 15 MiB veriyi açar, sınırı aşanı reddeder', async () => {
    const transferId = 'Ab12Cd34Ef56';
    const payload = new Uint8Array(15 * 1024 * 1024).fill(65);
    const created = await createColorPackageV2({ payload, transferId });

    await expect(openColorPackageV2(created.containerBytes, { expectedTransferId: transferId }))
      .resolves.toMatchObject({ metadata: { originalSize: payload.length } });
    await expect(createColorPackageV2({
      payload: new Uint8Array(payload.length + 1),
      transferId,
    })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('zlib bayrağı metadata sıkıştırmasıyla uyuşmazsa paketi açmaz', async () => {
    const created = await createColorPackageV2({
      payload: new Uint8Array(4096).fill(7),
      transferId: 'Ab12Cd34Ef56',
    });
    const damaged = new Uint8Array(created.containerBytes);
    damaged[4] ^= 1;

    await expect(openColorPackageV2(damaged))
      .rejects.toMatchObject({ code: 'INVALID_COLOR_PACKAGE' });
  });

  it('geçersiz UTF-8 veya JSON metadata ile paketi açmaz', async () => {
    const created = await createColorPackageV2({
      payload: new Uint8Array([1, 2, 3]),
      transferId: 'Ab12Cd34Ef56',
    });
    const damaged = new Uint8Array(created.containerBytes);
    damaged[9] = 0xff;

    await expect(openColorPackageV2(damaged))
      .rejects.toMatchObject({ code: 'INVALID_COLOR_PACKAGE' });
  });

  it('geçerli UTF-8 ancak geçersiz JSON metadata ile paketi açmaz', async () => {
    const created = await createColorPackageV2({
      payload: new Uint8Array([1, 2, 3]),
      transferId: 'Ab12Cd34Ef56',
    });
    const damaged = new Uint8Array(created.containerBytes);
    const metadataLength = new DataView(damaged.buffer).getUint32(5, false);
    const invalidJson = '{bozuk:json'.padEnd(metadataLength, ' ');

    damaged.set(new TextEncoder().encode(invalidJson), 9);
    await expect(openColorPackageV2(damaged))
      .rejects.toMatchObject({ code: 'INVALID_COLOR_PACKAGE' });
  });

  it('metadata saklanan veri boyutuyla uyuşmazsa paketi açmaz', async () => {
    const created = await createColorPackageV2({
      payload: new Uint8Array([1, 2, 3]),
      transferId: 'Ab12Cd34Ef56',
    });
    const damaged = new Uint8Array(created.containerBytes);
    const metadataLength = new DataView(damaged.buffer).getUint32(5, false);
    const metadataBytes = damaged.subarray(9, 9 + metadataLength);
    const metadataText = new TextDecoder().decode(metadataBytes);
    const alteredText = metadataText.replace('"storedSize":3', '"storedSize":2');

    metadataBytes.set(new TextEncoder().encode(alteredText));
    await expect(openColorPackageV2(damaged))
      .rejects.toMatchObject({ code: 'INVALID_COLOR_PACKAGE' });
  });
});
