class QrFramePreloaderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QrFramePreloaderError";
    this.code = code;
  }
}

export function createQrFramePreloader({
  schedule,
  renderQr,
  signal,
  maxBufferedFrames = 8,
} = {}) {
  if (!Array.isArray(schedule) || typeof renderQr !== "function") {
    throw new TypeError("QR kare programı ve render işlevi gerekli.");
  }
  if (!Number.isSafeInteger(maxBufferedFrames)) {
    throw new RangeError("QR kare tamponu güvenli bir tam sayı olmalı.");
  }

  const limit = Math.max(1, Math.min(8, maxBufferedFrames));
  const frames = new Map();
  let nextPrepareIndex = 0;
  let nextTakeIndex = 0;
  let maxObservedBufferedFrames = 0;
  let closed = false;

  function fill() {
    if (signal?.aborted) return;
    while (!closed && frames.size < limit && nextPrepareIndex < schedule.length) {
      const frameIndex = nextPrepareIndex;
      nextPrepareIndex += 1;
      const promise = Promise.all(schedule[frameIndex].map((text, regionIndex) => (
        renderQr(text, { frameIndex, regionIndex, signal })
      )));
      promise.catch(() => {});
      frames.set(frameIndex, promise);
      maxObservedBufferedFrames = Math.max(maxObservedBufferedFrames, frames.size);
    }
  }

  async function takeNext() {
    if (closed) {
      throw new QrFramePreloaderError("CLOSED", "QR kare hazırlayıcı kapalı.");
    }
    if (signal?.aborted) {
      throw new QrFramePreloaderError("ABORTED", "QR kare hazırlama iptal edildi.");
    }
    if (nextTakeIndex >= schedule.length) return null;

    const frameIndex = nextTakeIndex;
    const frame = await frames.get(frameIndex);
    if (signal?.aborted) {
      throw new QrFramePreloaderError("ABORTED", "QR kare hazırlama iptal edildi.");
    }
    frames.delete(frameIndex);
    nextTakeIndex += 1;
    fill();
    return frame;
  }

  function close() {
    closed = true;
    frames.clear();
  }

  function stats() {
    return {
      bufferedFrames: frames.size,
      maxObservedBufferedFrames,
      consumedFrames: nextTakeIndex,
    };
  }

  fill();
  return { takeNext, close, stats };
}
