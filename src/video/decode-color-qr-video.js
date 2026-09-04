import { parseColorFrameV2 } from "../optical/color-frame-v2.js";
import { createColorReceiveSession } from "../optical/color-receive-session.js";
import { getQrRegions } from "../optical/frame-layout.js";
import { getOpticalProfile } from "../optical/profiles.js";

const ABORTED = "ABORTED";
const INCOMPLETE_TRANSFER = "INCOMPLETE_TRANSFER";
const VIDEO_PROFILE_UNDETECTED = "VIDEO_PROFILE_UNDETECTED";
const VIDEO_READ_ERROR = "VIDEO_READ_ERROR";
const METADATA_TIMEOUT_MS = 3_000;
const SEEK_TIMEOUT_MS = 250;
const LAST_FRAME_MARGIN_SECONDS = 0.02;
const COLOR_SCAN_STEP_SECONDS = 0.08;
const COLOR_PROBE_SECONDS = Object.freeze([0.05, 0.20, 0.40]);
const COLOR_VIDEO_PROFILE = getOpticalProfile("color_balanced");

export class DecodeColorQrVideoError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DecodeColorQrVideoError";
    this.code = code;
    Object.assign(this, details);
  }
}

export async function decodeColorQrVideo(file, callbacks = {}, signal, options = {}) {
  throwIfAborted(signal);
  const session = createColorReceiveSession(options.sessionOptions);

  if (Array.isArray(options.frameBytes)) {
    for (const bytes of options.frameBytes) {
      throwIfAborted(signal);
      const assembled = await acceptFrame(session, parseColorFrameV2(bytes), callbacks);
      if (assembled) return assembled;
    }
    throw incompleteError(session.progress());
  }

  const { workerClient, sessionId } = options;
  if (!workerClient?.decodeImage || !sessionId) {
    throw new DecodeColorQrVideoError(
      VIDEO_PROFILE_UNDETECTED,
      "Renkli QR video profili algılanamadı.",
    );
  }

  let detectedFrame = false;
  const assembled = await scanVideoFrames(file, async (imageData, timing) => {
    throwIfAborted(signal);
    const decoded = await waitForWorkerDecode(
      workerClient.decodeImage(sessionId, imageData),
      signal,
    );
    if (timing.regionIndex === timing.regionCount - 1) {
      callbacks.onScanProgress?.(timing);
    }
    if (!decoded?.frame) return null;

    detectedFrame = true;
    return acceptFrame(session, decoded.frame, callbacks);
  }, {
    signal,
    stepSeconds: COLOR_SCAN_STEP_SECONDS,
    maxWidth: 1280,
    maxHeight: 720,
  });

  if (assembled) return assembled;
  if (!detectedFrame && !options.profileDetected) {
    throw new DecodeColorQrVideoError(
      VIDEO_PROFILE_UNDETECTED,
      "Renkli QR video profili algılanamadı.",
    );
  }
  throw incompleteError(session.progress());
}

export async function probeColorQrVideo(file, { workerClient, sessionId, signal } = {}) {
  throwIfAborted(signal);
  if (!workerClient?.decodeImage || !sessionId) return false;

  return withVideoSource(file, signal, async ({ video, canvas, context, duration }) => {
    const maxSecond = Math.max(0, duration - LAST_FRAME_MARGIN_SECONDS);
    let lastSecond = -1;

    for (const requestedSecond of COLOR_PROBE_SECONDS) {
      throwIfAborted(signal);
      const second = Math.min(requestedSecond, maxSecond);
      if (lastSecond >= 0 && Math.abs(second - lastSecond) < 0.001) continue;

      const imageData = await readOpenedVideoFrame({
        video,
        canvas,
        context,
        second,
        signal,
        maxWidth: 640,
        maxHeight: 360,
      });
      const regions = cropQrRegions(imageData, COLOR_VIDEO_PROFILE);
      for (const regionImageData of regions) {
        const decoded = await waitForWorkerDecode(
          workerClient.decodeImage(sessionId, regionImageData),
          signal,
        );
        if (decoded?.frame?.protocolVersion === "CRF2") return true;
      }
      lastSecond = second;
    }
    return false;
  });
}

async function acceptFrame(session, frame, callbacks) {
  const accepted = session.accept(frame);
  if (!accepted.accepted) return null;

  callbacks.onProgress?.(session.progress());
  if (session.getState() !== "complete") return null;

  const assembled = await session.assemble();
  callbacks.onProgress?.(session.progress());
  return assembled?.bytes ?? null;
}

async function scanVideoFrames(file, visitFrame, {
  signal,
  stepSeconds,
  maxWidth,
  maxHeight,
}) {
  return withVideoSource(file, signal, async ({ video, canvas, context, duration }) => {
    const lastSecond = Math.max(0, duration - LAST_FRAME_MARGIN_SECONDS);
    const sampleSeconds = buildSampleSeconds(lastSecond, stepSeconds);

    for (const second of sampleSeconds) {
      throwIfAborted(signal);
      const imageData = await readOpenedVideoFrame({
        video,
        canvas,
        context,
        second,
        signal,
        maxWidth,
        maxHeight,
      });
      const regionImages = cropQrRegions(imageData, COLOR_VIDEO_PROFILE);
      let sampleResult = null;
      for (let regionIndex = 0; regionIndex < regionImages.length; regionIndex += 1) {
        const result = await visitFrame(regionImages[regionIndex], {
          percent: second === lastSecond ? 100 : Math.round((second / duration) * 100),
          currentTime: second,
          duration,
          regionIndex,
          regionCount: regionImages.length,
        });
        sampleResult ??= result;
      }
      if (sampleResult) return sampleResult;
    }
    return null;
  });
}

export function cropQrRegions(imageData, profile = COLOR_VIDEO_PROFILE) {
  if (!imageData?.data || !Number.isSafeInteger(imageData.width)
    || !Number.isSafeInteger(imageData.height)) {
    throw new TypeError("Video karesi geçersiz.");
  }

  const scaleX = imageData.width / profile.width;
  const scaleY = imageData.height / profile.height;
  return getQrRegions(profile).map((region) => {
    const left = Math.max(0, Math.round(region.x * scaleX));
    const top = Math.max(0, Math.round(region.y * scaleY));
    const right = Math.min(imageData.width, Math.round((region.x + region.size) * scaleX));
    const bottom = Math.min(imageData.height, Math.round((region.y + region.size) * scaleY));
    return copyImageRegion(imageData, left, top, right - left, bottom - top);
  });
}

function copyImageRegion(source, x, y, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(sourceStart, sourceStart + width * 4), row * width * 4);
  }
  return typeof ImageData === "function"
    ? new ImageData(data, width, height)
    : { data, width, height };
}

function buildSampleSeconds(lastSecond, stepSeconds) {
  const samples = [];
  for (let second = 0; second < lastSecond - 0.001; second += stepSeconds) {
    samples.push(Number(second.toFixed(6)));
  }
  if (samples.length === 0 || Math.abs(samples.at(-1) - lastSecond) >= 0.001) {
    samples.push(Number(lastSecond.toFixed(6)));
  }
  return samples;
}

async function withVideoSource(file, signal, operation) {
  throwIfAborted(signal);
  if (!file) {
    throw new DecodeColorQrVideoError(VIDEO_READ_ERROR, "Video dosyası okunamadı.");
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    URL.revokeObjectURL(url);
    throw new DecodeColorQrVideoError(VIDEO_READ_ERROR, "Video karesi okunamadı.");
  }

  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await waitForMetadata(video, signal);

    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : 0;
    if (duration === 0) {
      throw new DecodeColorQrVideoError(VIDEO_READ_ERROR, "Video süresi okunamadı.");
    }

    return await operation({ video, canvas, context, duration });
  } finally {
    video.removeAttribute("src");
    video.load?.();
    URL.revokeObjectURL(url);
  }
}

async function readOpenedVideoFrame({
  video,
  canvas,
  context,
  second,
  signal,
  maxWidth,
  maxHeight,
}) {
  await seekVideo(video, second, signal);
  const size = fitFrame(video.videoWidth || 640, video.videoHeight || 360, maxWidth, maxHeight);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  context.drawImage(video, 0, 0, size.width, size.height);
  return context.getImageData(0, 0, size.width, size.height);
}

function fitFrame(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function waitForMetadata(video, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new DecodeColorQrVideoError(VIDEO_READ_ERROR, "Video bilgileri zamanında okunamadı."));
    }, METADATA_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortedError());
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new DecodeColorQrVideoError(VIDEO_READ_ERROR, "Video açılamadı."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function seekVideo(video, second, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, SEEK_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortedError());
    };

    video.onseeked = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    video.currentTime = second;
  });
}

function incompleteError(progress) {
  return new DecodeColorQrVideoError(
    INCOMPLETE_TRANSFER,
    `Renkli aktarım tamamlanamadı: ${progress.solved} / ${progress.sourceCount}`,
    progress,
  );
}

function abortedError() {
  return new DecodeColorQrVideoError(ABORTED, "Video çözümleme iptal edildi.");
}

function waitForWorkerDecode(decodePromise, signal) {
  if (!signal) return decodePromise;
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortedError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(decodePromise).then(
      (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortedError();
}
