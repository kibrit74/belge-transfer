import { describe, expect, it } from 'vitest';
import { encodeColorFrameV2, parseColorFrameV2 } from '../optical/color-frame-v2.js';

const metadata = {
  transferId: 'Ab12Cd34Ef56',
  sourceCount: 3,
  blockBytes: 380,
  originalBytes: 900,
  sha256: 'A'.repeat(43),
};

describe('CRF2 kare biçimi', () => {
  it('fountain sembolünü sabit ikili başlıkla kayıpsız taşır', () => {
    const symbol = {
      transferId: metadata.transferId,
      symbolId: 1,
      data: new Uint8Array(380).fill(7),
    };

    const parsed = parseColorFrameV2(encodeColorFrameV2(metadata, symbol));

    expect(parsed).toEqual({ protocolVersion: 'CRF2', ...metadata, symbolId: 1, data: symbol.data });
  });

  it('bir baytı bozulan kareyi CRC hatasıyla reddeder', () => {
    const encoded = encodeColorFrameV2(metadata, {
      transferId: metadata.transferId,
      symbolId: 0,
      data: new Uint8Array(380).fill(3),
    });
    encoded[encoded.length - 1] ^= 1;

    expect(() => parseColorFrameV2(encoded)).toThrow(
      expect.objectContaining({ code: 'FRAME_CRC_MISMATCH' }),
    );
  });

  it('sembol numarası sourceCount çarpı 4 sınırını aşarsa reddeder', () => {
    expect(() => encodeColorFrameV2(metadata, {
      transferId: metadata.transferId,
      symbolId: 12,
      data: new Uint8Array(380),
    })).toThrow(expect.objectContaining({ code: 'INVALID_COLOR_FRAME' }));
  });
});
