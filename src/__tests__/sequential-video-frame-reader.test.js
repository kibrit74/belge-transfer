import { describe, expect, it, vi } from "vitest";
import {
  readSequentialVideoFrames,
  SequentialVideoFrameError,
} from "../video/sequential-video-frame-reader.js";

describe("sıralı video kare okuyucu", () => {
  it("desteklenmeyen video API'sini güvenli yedek yol hatasıyla bildirir", async () => {
    await expect(readSequentialVideoFrames({ play: vi.fn() }, {})).rejects.toMatchObject({
      code: "SEQUENTIAL_UNSUPPORTED",
    });
  });

  it("en fazla iki kare işler ve işlerden biri bitince videoyu devam ettirir", async () => {
    const video = makeFrameVideo();
    const pending = [];
    const processing = vi.fn(() => new Promise((resolve) => pending.push(resolve)));

    const reading = readSequentialVideoFrames(video, {
      captureFrame: (_video, metadata) => metadata.mediaTime,
      processFrame: processing,
    });
    await flush();

    video.emit(0);
    await flush();
    video.emit(1 / 24);
    await flush();

    expect(processing).toHaveBeenCalledTimes(2);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);

    pending[0](null);
    await flush();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(3);

    pending[1](null);
    await flush();
    video.end();
    await expect(reading).resolves.toBeNull();
  });

  it("rahat ilerleyen karelerde hızı en fazla 2× seviyesine çıkarır", async () => {
    const video = makeFrameVideo();
    const reading = readSequentialVideoFrames(video, {
      captureFrame: () => null,
      processFrame: async () => null,
    });
    await flush();

    for (let index = 0; index < 24; index += 1) {
      video.emit(index / 24);
      await flush();
    }

    expect(video.playbackRate).toBe(2);
    video.end();
    await expect(reading).resolves.toBeNull();
  });

  it("ilk tamamlanan sonucu döndürür ve bekleyen kare isteğini iptal eder", async () => {
    const video = makeFrameVideo();
    const result = new Uint8Array([1, 2, 3]);
    const processing = vi.fn(async () => result);

    const reading = readSequentialVideoFrames(video, {
      captureFrame: () => "kare",
      processFrame: processing,
    });
    await flush();
    video.emit(0);

    await expect(reading).resolves.toEqual(result);
    expect(processing).toHaveBeenCalledTimes(1);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(video.pause).toHaveBeenCalled();
  });

  it("iptalde video karesi isteğini kapatır", async () => {
    const controller = new AbortController();
    const video = makeFrameVideo();
    const reading = readSequentialVideoFrames(video, {
      signal: controller.signal,
      captureFrame: () => null,
      processFrame: async () => null,
    });
    await flush();

    controller.abort();

    await expect(reading).rejects.toBeInstanceOf(SequentialVideoFrameError);
    await expect(reading).rejects.toMatchObject({ code: "ABORTED" });
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(video.pause).toHaveBeenCalled();
  });
});

function makeFrameVideo() {
  let callbackId = 0;
  const callbacks = new Map();
  const listeners = new Map();
  return {
    duration: 10,
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    ended: false,
    play: vi.fn(async function play() { this.paused = false; }),
    pause: vi.fn(function pause() { this.paused = true; }),
    requestVideoFrameCallback: vi.fn((callback) => {
      const id = ++callbackId;
      callbacks.set(id, callback);
      return id;
    }),
    cancelVideoFrameCallback: vi.fn((id) => callbacks.delete(id)),
    addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name) => listeners.delete(name)),
    emit(mediaTime) {
      const entry = callbacks.entries().next().value;
      if (!entry) throw new Error("Bekleyen video kare isteği yok.");
      callbacks.delete(entry[0]);
      this.currentTime = mediaTime;
      entry[1](performance.now(), { mediaTime });
    },
    end() {
      this.ended = true;
      listeners.get("ended")?.();
    },
  };
}

async function flush() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}
