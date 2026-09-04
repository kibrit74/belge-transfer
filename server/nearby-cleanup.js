const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;

export function startNearbyRoomCleanup({
  repositories,
  intervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
  now = () => new Date(),
  onError = (error) => console.error('Yakındaki Cihazlar oda temizliği başarısız:', error),
} = {}) {
  if (typeof repositories?.deleteExpiredNearbyRooms !== 'function') {
    throw new TypeError('Yakındaki Cihazlar oda deposu gerekli.');
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError('Oda temizleme aralığı geçersiz.');
  }

  let stopped = false;
  let running = false;

  async function run() {
    if (stopped || running) return;
    running = true;
    try {
      await repositories.deleteExpiredNearbyRooms(now());
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  }

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();

  return function stopNearbyRoomCleanup() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}
