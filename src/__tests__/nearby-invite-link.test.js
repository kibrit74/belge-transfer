import { describe, expect, it } from 'vitest';
import {
  createNearbyInviteUrl,
  normalizeNearbyRoomCode,
  readNearbyInviteCode,
} from '../nearby/invite-link.js';

describe('Yakındaki Cihazlar davet bağlantısı', () => {
  it('kodu normalize edip aynı kaynak transfer bağlantısını üretir', () => {
    expect(createNearbyInviteUrl({
      origin: 'https://vaultdrop.test',
      code: 'abc234',
    })).toBe('https://vaultdrop.test/transfer?nearby=ABC234');
    expect(readNearbyInviteCode('?nearby=abc234')).toBe('ABC234');
  });

  it.each(['', 'ABC23', 'ABC2345', 'O0I1XX', 'ABC 23', null])(
    'geçersiz kodu reddeder: %s',
    (value) => expect(normalizeNearbyRoomCode(value)).toBeNull(),
  );

  it('URL içinde dosya veya oda anahtarı taşımaya izin vermez', () => {
    const url = createNearbyInviteUrl({ origin: 'https://vaultdrop.test', code: 'ABC234' });
    expect(url).not.toMatch(/token|secret|file|sha|mime/i);
    expect(new URL(url).searchParams.size).toBe(1);
  });
});
