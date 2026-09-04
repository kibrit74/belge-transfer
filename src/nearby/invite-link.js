export const NEARBY_ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function normalizeNearbyRoomCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return NEARBY_ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function createNearbyInviteUrl({ origin, code } = {}) {
  const normalizedCode = normalizeNearbyRoomCode(code);
  if (!normalizedCode) throw new RangeError('Yakındaki Cihazlar davet kodu geçersiz.');
  const parsedOrigin = new URL(origin);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new RangeError('Yakındaki Cihazlar davet kaynağı geçersiz.');
  }
  const invite = new URL('/transfer', parsedOrigin.origin);
  invite.searchParams.set('nearby', normalizedCode);
  return invite.href;
}

export function readNearbyInviteCode(search) {
  if (typeof search !== 'string') return null;
  return normalizeNearbyRoomCode(new URLSearchParams(search).get('nearby'));
}
