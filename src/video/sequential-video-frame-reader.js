export class SequentialVideoFrameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SequentialVideoFrameError";
    this.code = code;
  }
}

export async function readSequentialVideoFrames(video, options = {}) {
  assertSequentialVideoSupport(video);

  const {
    signal,
    captureFrame = () => null,
    processFrame = async () => null,
    onProgress,
  } = options;
  const maxPendingFrames = Math.max(1, Math.min(2, options.maxPendingFrames ?? 2));

  return new Promise((resolve, reject) => {
    let callbackId = null;
    let pendingFrames = 0;
    let calmFrames = 0;
    let settled = false;
    let ended = false;
    let playbackStarting = false;

    const cleanup = () => {
      if (callbackId !== null) video.cancelVideoFrameCallback(callbackId);
      callbackId = null;
      video.removeEventListener?.("ended", onEnded);
      signal?.removeEventListener("abort", onAbort);
      video.pause?.();
    };

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const finishError = (error) => finish(reject, error);
    const finishValue = (value) => finish(resolve, value);

    const onAbort = () => {
      finishError(new SequentialVideoFrameError("ABORTED", "Video çözümleme iptal edildi."));
    };

    const onEnded = () => {
      ended = true;
      if (pendingFrames === 0) finishValue(null);
    };

    const updatePlaybackRate = (backpressured) => {
      if (backpressured) calmFrames = 0;
      else calmFrames += 1;
      video.playbackRate = calmFrames >= 24 ? 2 : calmFrames >= 12 ? 1.5 : 1;
    };

    const scheduleFrame = () => {
      if (settled || ended || callbackId !== null || pendingFrames >= maxPendingFrames) return;
      callbackId = video.requestVideoFrameCallback(onFrame);
    };

    const ensurePlayback = async () => {
      if (settled || ended || playbackStarting) return;
      if (pendingFrames >= maxPendingFrames) {
        updatePlaybackRate(true);
        video.pause();
        return;
      }

      if (!video.paused) {
        scheduleFrame();
        return;
      }

      playbackStarting = true;
      try {
        await video.play();
      } catch {
        finishError(new SequentialVideoFrameError(
          "SEQUENTIAL_UNSUPPORTED",
          "Bu cihaz sıralı video oynatmayı başlatamadı.",
        ));
        return;
      } finally {
        playbackStarting = false;
      }
      scheduleFrame();
    };

    function onFrame(_now, metadata) {
      callbackId = null;
      if (settled || ended) return;

      let captured;
      try {
        captured = captureFrame(video, metadata);
      } catch (error) {
        finishError(error);
        return;
      }

      pendingFrames += 1;
      onProgress?.({ mediaTime: metadata.mediaTime, duration: video.duration });

      if (pendingFrames >= maxPendingFrames) {
        updatePlaybackRate(true);
        video.pause();
      } else {
        updatePlaybackRate(false);
        scheduleFrame();
      }

      Promise.resolve()
        .then(() => processFrame(captured, metadata))
        .then((result) => {
          if (result !== null && result !== undefined) finishValue(result);
        })
        .catch(finishError)
        .finally(() => {
          pendingFrames -= 1;
          if (settled) return;
          if (ended && pendingFrames === 0) {
            finishValue(null);
            return;
          }
          void ensurePlayback();
        });
    }

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    video.addEventListener?.("ended", onEnded, { once: true });
    void ensurePlayback();
  });
}

function assertSequentialVideoSupport(video) {
  if (typeof video?.requestVideoFrameCallback !== "function"
    || typeof video?.cancelVideoFrameCallback !== "function"
    || typeof video?.play !== "function") {
    throw new SequentialVideoFrameError(
      "SEQUENTIAL_UNSUPPORTED",
      "Bu cihaz sıralı video karesi okumayı desteklemiyor.",
    );
  }
}
