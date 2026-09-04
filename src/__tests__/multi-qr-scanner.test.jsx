import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveQrDecodePool } from '../live-qr/decode-pool.js';
import { useMultiQrScanner } from '../hooks/useMultiQrScanner.js';

const originalVideoWidth = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'videoWidth');
const originalVideoHeight = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'videoHeight');

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

class FakeWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.messages = [];
    this.terminate = vi.fn();
  }

  postMessage(message) {
    this.messages.push(message);
  }

  reply(data) {
    this.onmessage?.({ data });
  }
}

function ScannerHarness({ poolFactory, onDecodedBatch }) {
  const scanner = useMultiQrScanner({
    poolFactory,
    onDecodedBatch,
    scanIntervalMs: 50,
  });

  useEffect(() => scanner.stopScanning, [scanner.stopScanning]);
  return <><video ref={scanner.videoRef} /><canvas ref={scanner.canvasRef} /></>;
}

describe('çoklu Canlı QR tarama', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
        width: 1,
        height: 1,
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalVideoWidth) Object.defineProperty(HTMLMediaElement.prototype, 'videoWidth', originalVideoWidth);
    else delete HTMLMediaElement.prototype.videoWidth;
    if (originalVideoHeight) Object.defineProperty(HTMLMediaElement.prototype, 'videoHeight', originalVideoHeight);
    else delete HTMLMediaElement.prototype.videoHeight;
  });

  it('iki worker meşgulse yeni görüntüyü kuyruğa koymadan düşürür', async () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    let index = 0;
    const pool = createLiveQrDecodePool({ workerFactory: () => workers[index++], size: 2 });
    const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

    const first = pool.decode(imageData);
    const second = pool.decode(imageData);
    await expect(pool.decode(imageData)).resolves.toEqual({ dropped: true, texts: [] });

    workers[0].reply({ id: workers[0].messages[0].id, texts: ['QRL1|a', 'QRL1|a'] });
    workers[1].reply({ id: workers[1].messages[0].id, texts: ['QRL1|b'] });
    await expect(first).resolves.toEqual({ dropped: false, texts: ['QRL1|a'] });
    await expect(second).resolves.toEqual({ dropped: false, texts: ['QRL1|b'] });
    pool.close();
  });

  it('hızlı profilde üç workerı aynı anda kullanır', async () => {
    const workers = [new FakeWorker(), new FakeWorker(), new FakeWorker()];
    let index = 0;
    const pool = createLiveQrDecodePool({ workerFactory: () => workers[index++], size: 3 });
    const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

    const pending = workers.map(() => pool.decode(imageData));
    await expect(pool.decode(imageData)).resolves.toEqual({ dropped: true, texts: [] });
    workers.forEach((worker) => worker.reply({ id: worker.messages[0].id, texts: [] }));
    await Promise.all(pending);
    expect(workers.every((worker) => worker.messages.length === 1)).toBe(true);
    pool.close();
  });

  it('tek kamera görüntüsündeki dört QRL1 metnini aynı batch ile verir', async () => {
    const onDecodedBatch = vi.fn();
    const pool = {
      decode: vi.fn().mockResolvedValue({
        dropped: false,
        texts: ['QRL1|a', 'QRL1|b', 'QRL1|c', 'QRL1|d'],
      }),
      close: vi.fn(),
    };
    render(<ScannerHarness poolFactory={() => pool} onDecodedBatch={onDecodedBatch} />);

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onDecodedBatch).toHaveBeenCalledWith(['QRL1|a', 'QRL1|b', 'QRL1|c', 'QRL1|d']);
  });

  it('kamera ilk anda hazır değilse görüntü hazırlaşınca taramayı sürdürür', async () => {
    let readyState = 0;
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockImplementation(() => readyState);
    const pool = {
      decode: vi.fn().mockResolvedValue({ dropped: false, texts: [] }),
      close: vi.fn(),
    };

    render(<ScannerHarness poolFactory={() => pool} onDecodedBatch={vi.fn()} />);
    await act(async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });
    expect(pool.decode).not.toHaveBeenCalled();

    readyState = 4;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(pool.decode).toHaveBeenCalledTimes(1);
  });

  it('yalnız ortadaki hedef alanı düşük maliyetle görüntüler', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      getImageData: (_x, _y, width, height) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 1280,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 720,
    });
    const pool = { decode: vi.fn().mockResolvedValue({ dropped: false, texts: [] }), close: vi.fn() };

    render(<ScannerHarness poolFactory={() => pool} onDecodedBatch={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(drawImage).toHaveBeenCalledWith(
      expect.any(HTMLVideoElement),
      417,
      137,
      446,
      446,
      0,
      0,
      446,
      446,
    );
    expect(pool.decode).toHaveBeenCalledWith(expect.objectContaining({ width: 446, height: 446 }));
  });

  it('ilk kare çözülürken ikinci kareyi diğer workera gönderir', async () => {
    const first = deferred();
    const second = deferred();
    const pool = {
      decode: vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockResolvedValue({ dropped: true, texts: [] }),
      close: vi.fn(),
    };

    render(<ScannerHarness poolFactory={() => pool} onDecodedBatch={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });

    expect(pool.decode).toHaveBeenCalledTimes(2);
    first.resolve({ dropped: false, texts: [] });
    second.resolve({ dropped: false, texts: [] });
  });

  it('worker havuzu açılamazsa yerleşik tek QR yedeğiyle taramayı sürdürür', async () => {
    const onDecodedBatch = vi.fn();
    vi.stubGlobal('BarcodeDetector', class {
      async detect() {
        return [{ rawValue: 'QRL1|fallback' }];
      }
    });

    render(<ScannerHarness poolFactory={() => { throw new Error('CSP worker engeli'); }} onDecodedBatch={onDecodedBatch} />);

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onDecodedBatch).toHaveBeenCalledWith(['QRL1|fallback']);
  });

  it('önce 60 FPS ister, desteklenmezse 30 FPS ile açar ve sürekli odağı uygular', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      stop: vi.fn(),
      getSettings: vi.fn(() => ({ width: 1280, height: 720, frameRate: 30 })),
      getCapabilities: vi.fn(() => ({ focusMode: ['manual', 'continuous'], torch: true })),
      applyConstraints,
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    };
    const overconstrained = new DOMException('60 FPS desteklenmiyor', 'OverconstrainedError');
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(overconstrained)
      .mockResolvedValueOnce(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    render(<ScannerHarness poolFactory={() => ({ decode: vi.fn(), close: vi.fn() })} onDecodedBatch={vi.fn()} />);

    await act(async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[0][0].video).toMatchObject({
      width: { ideal: 1280 },
      frameRate: { exact: 60 },
    });
    expect(getUserMedia.mock.calls[1][0].video).toMatchObject({
      width: { ideal: 1280 },
      frameRate: { ideal: 30 },
    });
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
    expect(track.getSettings).toHaveBeenCalledTimes(1);
    expect(applyConstraints.mock.calls.flat().join(' ')).not.toContain('torch');
  });
});
