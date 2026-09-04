import { afterEach, describe, expect, it, vi } from 'vitest';
import { startNearbyRoomCleanup } from '../nearby-cleanup.js';

describe('Yakındaki Cihazlar süresi dolan oda temizliği', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sunucu başlangıcında ve düzenli aralıkla süresi dolan odaları temizler', async () => {
    vi.useFakeTimers();
    const repositories = { deleteExpiredNearbyRooms: vi.fn(async () => 2) };
    const now = vi.fn(() => new Date('2026-08-14T10:00:00.000Z'));

    const stop = startNearbyRoomCleanup({ repositories, intervalMs: 60_000, now });
    await vi.advanceTimersByTimeAsync(0);

    expect(repositories.deleteExpiredNearbyRooms).toHaveBeenCalledTimes(1);
    expect(repositories.deleteExpiredNearbyRooms).toHaveBeenLastCalledWith(now.mock.results[0].value);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(repositories.deleteExpiredNearbyRooms).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(repositories.deleteExpiredNearbyRooms).toHaveBeenCalledTimes(3);
  });

  it('tek temizleme hatası sunucu zamanlayıcısını durdurmaz', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const repositories = {
      deleteExpiredNearbyRooms: vi.fn()
        .mockRejectedValueOnce(new Error('geçici veritabanı hatası'))
        .mockResolvedValue(1),
    };

    const stop = startNearbyRoomCleanup({ repositories, intervalMs: 1_000, onError });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(repositories.deleteExpiredNearbyRooms).toHaveBeenCalledTimes(2);
    stop();
  });

  it('yavaş veritabanı temizliği sürerken ikinci temizliği üst üste başlatmaz', async () => {
    vi.useFakeTimers();
    let finishFirst;
    const firstRun = new Promise((resolve) => {
      finishFirst = resolve;
    });
    const repositories = {
      deleteExpiredNearbyRooms: vi.fn()
        .mockReturnValueOnce(firstRun)
        .mockResolvedValue(0),
    };

    const stop = startNearbyRoomCleanup({ repositories, intervalMs: 1_000 });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(repositories.deleteExpiredNearbyRooms).toHaveBeenCalledTimes(1);

    finishFirst(1);
    await firstRun;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(repositories.deleteExpiredNearbyRooms).toHaveBeenCalledTimes(2);
    stop();
  });
});
