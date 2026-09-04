import { describe, expect, it, vi } from 'vitest';
import { createLiveQrFramePlayer } from '../live-qr/frame-player.js';

describe('Canlı QR kare oynatıcısı', () => {
  it('iki sunum arasında en az bir kare süresi bekler', async () => {
    vi.useFakeTimers();
    const renderGroup = vi.fn(async (texts) => texts);
    const presentGroup = vi.fn();
    const player = createLiveQrFramePlayer({ fps: 15, renderGroup, presentGroup });

    const playing = player.play(['QRL1|ilk']);
    await vi.advanceTimersByTimeAsync(0);
    expect(presentGroup).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync((1000 / 15) - 1);
    expect(presentGroup).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(presentGroup).toHaveBeenCalledTimes(2);

    player.stop();
    await playing;
    vi.useRealTimers();
  });

  it('durdurulduğunda zamanlayıcıyı temizler ve oynatma sözünü çözer', async () => {
    vi.useFakeTimers();
    const clearTimer = vi.fn(clearTimeout);
    const player = createLiveQrFramePlayer({
      fps: 10,
      renderGroup: async (texts) => texts,
      presentGroup: vi.fn(),
      clearTimer,
    });
    const playing = player.play(['QRL1|ilk']);
    await vi.advanceTimersByTimeAsync(0);

    player.stop();
    await playing;
    expect(clearTimer).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
