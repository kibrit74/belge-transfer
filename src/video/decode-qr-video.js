import jsQR from "jsqr";
import { parseFrame } from "../protocol";
import { createReceiveSession } from "../transfer/receive-session";
import { createOpticalReceiveSession } from "../optical/receive-session-v4.js";
import { getOpticalProfile } from "../optical/profiles.js";
import { scaleQrRegions } from "../optical/frame-layout.js";
import { createColorQrWorkerClient } from "../workers/color-qr-client.js";
import { createQrWorkerPool } from "./qr-worker-pool.js";
import { readSequentialVideoFrames } from "./sequential-video-frame-reader.js";
import {
  decodeColorQrVideo,
  probeColorQrVideo,
} from "./decode-color-qr-video.js";

const ABORTED = "ABORTED";
const INCOMPLETE = "INCOMPLETE";
const VIDEO_READ_ERROR = "VIDEO_READ_ERROR";
export const DEFAULT_SCAN_STEP_SECONDS = 0.1;
export const FAST_SCAN_STEP_SECONDS = 1 / 24;

class DecodeQrVideoError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DecodeQrVideoError";
    this.code = code;
    Object.assign(this, details);
  }
}

export async function decodeQrVideo(file, callbacks = {}, signal, options = {}) {
  throwIfAborted(signal);

  if (Array.isArray(options.frameTexts)) {
    return decodeQrFrameTexts(options.frameTexts, callbacks, signal, options);
  }

  if (options.allowColor === false) {
    return decodeStandardQrVideo(file, callbacks, signal, options);
  }

  return decodeRoutedQrVideo(file, callbacks, signal, options);
}

async function decodeRoutedQrVideo(file, callbacks, signal, options) {
  const injectedClient = options.colorWorkerClient ?? options.workerClient;
  const ownsClient = !injectedClient;
  let client;

  try {
    const createClient = options.createColorWorkerClient ?? createColorQrWorkerClient;
    client = injectedClient ?? createClient();
  } catch (error) {
    throwIfAborted(signal);
    if (error?.code === ABORTED || error?.code === VIDEO_READ_ERROR) throw error;
    return decodeStandardQrVideo(file, callbacks, signal, options);
  }

  const sessionId = options.colorSessionId ?? createColorSessionId();
  let cleanedUp = false;
  const cleanupColorWorker = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      client.disposeSession?.(sessionId);
    } catch {
      // İsteğe bağlı renk yolu temizleme hatası standart çözmeyi engellememeli.
    } finally {
      if (ownsClient) {
        try {
          client.terminate?.();
        } catch {
          // Worker zaten kapanmış veya kullanılamaz durumda olabilir.
        }
      }
    }
  };

  try {
    let isColor;
    try {
      isColor = await probeColorQrVideo(file, {
        workerClient: client,
        sessionId,
        signal,
      });
    } catch (error) {
      if (error?.code === ABORTED || error?.code === VIDEO_READ_ERROR) throw error;
      cleanupColorWorker();
      return decodeStandardQrVideo(file, callbacks, signal, options);
    }
    if (!isColor) {
      cleanupColorWorker();
      return decodeStandardQrVideo(file, callbacks, signal, options);
    }

    return await decodeColorQrVideo(file, callbacks, signal, {
      ...options,
      workerClient: client,
      sessionId,
      profileDetected: true,
    });
  } finally {
    cleanupColorWorker();
  }
}

async function decodeStandardQrVideo(file, callbacks = {}, signal, options = {}) {
  throwIfAborted(signal);

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const workerPool = options.workerPool ?? createDefaultWorkerPool(options.decodeImage);
  const sessionState = createSessionState(options);

  if (!context) {
    URL.revokeObjectURL(url);
    throw new DecodeQrVideoError(VIDEO_READ_ERROR, "Video karesi okunamadı.");
  }

  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    await waitForMetadata(video, signal);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (duration === 0) {
      throw new DecodeQrVideoError(VIDEO_READ_ERROR, "Video süresi okunamadı.");
    }

    const stepSeconds = options.stepSeconds ?? (
      workerPool ? FAST_SCAN_STEP_SECONDS : DEFAULT_SCAN_STEP_SECONDS
    );
    const sourceProfile = video.videoWidth >= 1600 && video.videoHeight >= 900
      ? getOpticalProfile("balanced")
      : getOpticalProfile("compatible");

    async function runScanPass(offsetSeconds = 0) {
      let lastScannedTime = -1;
      const sampleCount = Math.floor(duration / stepSeconds);
      for (let sampleIndex = 0; sampleIndex <= sampleCount + 1; sampleIndex += 1) {
        throwIfAborted(signal);
        const rawTime = (sampleIndex * stepSeconds) + offsetSeconds;
        const currentTime = sampleIndex > sampleCount
          ? duration
          : Math.min(Math.max(0, rawTime), duration);
        if (lastScannedTime >= 0 && Math.abs(currentTime - lastScannedTime) < 0.005) continue;

        await seekVideo(video, currentTime, signal);
        const decodedTexts = await decodeCurrentFrame(
          video,
          canvas,
          context,
          options.decodeImage,
          workerPool,
          signal,
        );
        for (const decoded of decodedTexts) {
          const assembled = await acceptQrFrameText(sessionState, decoded, callbacks, options);
          if (assembled) {
            callbacks.onScanProgress?.({ percent: 100, currentTime, duration });
            return assembled;
          }
        }

        lastScannedTime = currentTime;
        if (currentTime > 0) reportScanProgress(callbacks, currentTime, duration);
      }
      return null;
    }

    reportScanProgress(callbacks, 0, duration);

    let assembled = null;
    let usedSequentialReader = false;
    if (workerPool && options.useSequentialFrames !== false) {
      const readFrames = options.readSequentialFrames ?? readSequentialVideoFrames;
      let lastMediaTime = 0;
      try {
        assembled = await readFrames(video, {
          signal,
          maxPendingFrames: 2,
          captureFrame: () => captureQrRegions(video, canvas, context, sourceProfile),
          processFrame: async (regions) => {
            const decodedTexts = await workerPool.decode(regions, signal);
            for (const decoded of decodedTexts) {
              const completed = await acceptQrFrameText(sessionState, decoded, callbacks, options);
              if (completed) return completed;
            }
            return null;
          },
          onProgress: ({ mediaTime }) => {
            lastMediaTime = mediaTime;
            reportScanProgress(callbacks, mediaTime, duration);
          },
        });
        usedSequentialReader = true;
      } catch (error) {
        if (error?.code !== "SEQUENTIAL_UNSUPPORTED") throw error;
      }
      if (assembled) {
        callbacks.onScanProgress?.({ percent: 100, currentTime: lastMediaTime, duration });
        return assembled;
      }
    }

    // Sıralı okuyucu desteklenmiyorsa mevcut tam ilk geçiş korunur.
    if (!usedSequentialReader) assembled = await runScanPass(0);
    if (assembled) return assembled;

    // Yalnız eksik kalan semboller için yarım-kare kaydırılmış tamamlama geçişi.
    assembled = await runScanPass(stepSeconds / 2);
    if (assembled) return assembled;

    const progress = normalizedProgress(sessionState.session);
    await persistRecovery(sessionState, options, true);
    throw new DecodeQrVideoError(
      INCOMPLETE,
      `Video tarandı fakat ${progress.collected} / ${progress.total} QR karesi bulundu.`,
      progress,
    );
  } catch (error) {
    if (error?.code === ABORTED) await persistRecovery(sessionState, options, true);
    throw error;
  } finally {
    workerPool?.close?.();
    video.removeAttribute("src");
    video.load?.();
    URL.revokeObjectURL(url);
  }
}

function createColorSessionId() {
  const uniqueId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `color-video-decode:${uniqueId}`;
}

export async function decodeQrFrameTexts(frameTexts, callbacks = {}, signal, options = {}) {
  const sessionState = createSessionState(options);
  let lastProgress = { collected: 0, total: 0 };

  for (const text of frameTexts) {
    throwIfAborted(signal);
    const assembled = await acceptQrFrameText(sessionState, text, callbacks, options);
    if (assembled) return assembled;

    const progress = normalizedProgress(sessionState.session);
    if (progress.total > 0) lastProgress = progress;
  }

  const progress = normalizedProgress(sessionState.session);
  await persistRecovery(sessionState, options, true);
  throw new DecodeQrVideoError(
    INCOMPLETE,
    `Eksik kare: ${progress.collected} / ${progress.total}`,
    progress.total > 0 ? progress : lastProgress,
  );
}

export function fitVideoFrame(width, height, maxWidth = 1280, maxHeight = 720) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function acceptQrFrameText(sessionState, text, callbacks, options = {}) {
  const frame = parseFrame(text);
  if (!frame) return null;

  if (!sessionState.session) {
    sessionState.session = frame.protocolVersion === "QRF1"
      ? createOpticalReceiveSession()
      : createReceiveSession();
  }
  const session = sessionState.session;

  const accepted = session.accept(frame);
  if (!accepted.accepted) return null;

  await persistRecovery(sessionState, options);

  callbacks.onProgress?.(normalizedProgress(session));
  if (session.getState() !== "complete") return null;

  const assembled = await session.assemble();
  if (!assembled?.bytes) return null;

  await deleteRecovery(sessionState, options);

  callbacks.onProgress?.(normalizedProgress(session));
  return assembled.bytes;
}

function createSessionState(options) {
  const state = {
    session: null,
    createdAt: options.recoveryRecord?.createdAt ?? Date.now(),
    lastRecoveryWriteAt: Date.now(),
  };
  const record = options.recoveryRecord;
  if (record?.direction !== "incoming" || record.protocolVersion !== "QRF1" || !record.metadata) {
    return state;
  }

  const session = createOpticalReceiveSession();
  for (const symbol of record.symbols ?? []) {
    session.accept({
      ...record.metadata,
      protocolVersion: "QRF1",
      transferId: record.transferId,
      symbolId: symbol.symbolId,
      data: new Uint8Array(symbol.data),
    });
  }
  state.session = session;
  return state;
}

async function persistRecovery(sessionState, options, force = false) {
  const session = sessionState?.session;
  if (!options.recoveryStore || session?.getMetadata?.()?.protocolVersion !== "QRF1") return;
  const now = Date.now();
  if (!force && now - sessionState.lastRecoveryWriteAt < 1_000) return;

  const recovery = session.exportRecovery();
  const transferId = recovery.metadata.transferId;
  try {
    await options.recoveryStore.saveIncoming({
      id: `incoming:${transferId}`,
      direction: "incoming",
      transferId,
      protocolVersion: "QRF1",
      createdAt: sessionState.createdAt,
      metadata: recovery.metadata,
      symbols: recovery.symbols,
    });
    sessionState.lastRecoveryWriteAt = now;
  } catch (error) {
    options.onRecoveryWarning?.(error);
  }
}

async function deleteRecovery(sessionState, options) {
  const transferId = sessionState.session?.getMetadata?.()?.transferId;
  if (!options.recoveryStore || !transferId) return;
  try {
    await options.recoveryStore.delete(`incoming:${transferId}`);
  } catch (error) {
    options.onRecoveryWarning?.(error);
  }
}

function normalizedProgress(session) {
  if (!session) return { collected: 0, total: 0 };
  const progress = session.progress();
  if ("collected" in progress) return progress;
  return {
    ...progress,
    collected: progress.solved,
    total: progress.sourceCount,
  };
}

function reportScanProgress(callbacks, currentTime, duration) {
  callbacks.onScanProgress?.({
    percent: Math.round((currentTime / duration) * 100),
    currentTime,
    duration,
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DecodeQrVideoError(ABORTED, "Video çözümleme iptal edildi.");
  }
}

function waitForMetadata(video, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DecodeQrVideoError(ABORTED, "Video çözümleme iptal edildi."));
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new DecodeQrVideoError(VIDEO_READ_ERROR, "Video açılamadı."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function seekVideo(video, second, signal) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DecodeQrVideoError(ABORTED, "Video çözümleme iptal edildi."));
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

    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 200);

    const safeSecond = Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(second, Math.max(0, video.duration - 0.02))
      : second;

    video.currentTime = safeSecond;
  });
}

function captureQrRegions(video, canvas, context, profile) {
  const frameSize = fitVideoFrame(video.videoWidth || profile.width, video.videoHeight || profile.height);
  if (canvas.width !== frameSize.width) canvas.width = frameSize.width;
  if (canvas.height !== frameSize.height) canvas.height = frameSize.height;
  context.drawImage(video, 0, 0, frameSize.width, frameSize.height);

  return scaleQrRegions(profile, frameSize.width, frameSize.height).map((region) => ({
    imageData: context.getImageData(region.x, region.y, region.width, region.height),
  }));
}

async function decodeCurrentFrame(video, canvas, context, decodeImage, workerPool, signal) {
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 360;
  const frameSize = workerPool
    ? fitVideoFrame(sourceWidth, sourceHeight, 1920, 1080)
    : fitVideoFrame(sourceWidth, sourceHeight);
  if (canvas.width !== frameSize.width) canvas.width = frameSize.width;
  if (canvas.height !== frameSize.height) canvas.height = frameSize.height;
  context.drawImage(video, 0, 0, frameSize.width, frameSize.height);
  const imageData = context.getImageData(0, 0, frameSize.width, frameSize.height);

  if (decodeImage) {
    const decoded = await decodeImage(imageData, canvas);
    return Array.isArray(decoded) ? decoded.filter(Boolean) : decoded ? [decoded] : [];
  }

  if (workerPool) {
    const regions = getVideoQrRegions(frameSize.width, frameSize.height).map((region) => ({
      imageData: context.getImageData(region.x, region.y, region.width, region.height),
    }));
    return workerPool.decode(regions, signal);
  }

  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  return code?.data ? [code.data] : [];
}

export function getVideoQrRegions(width, height) {
  if (width >= 1600 && height >= 900) {
    const scaleX = width / 1920;
    const scaleY = height / 1080;
    return [
      { x: Math.round(60 * scaleX), y: Math.round(90 * scaleY), width: Math.round(900 * scaleX), height: Math.round(900 * scaleY) },
      { x: Math.round(960 * scaleX), y: Math.round(90 * scaleY), width: Math.round(900 * scaleX), height: Math.round(900 * scaleY) },
    ];
  }
  const size = Math.min(width, height);
  return [{
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    width: size,
    height: size,
  }];
}

function createDefaultWorkerPool(decodeImage) {
  if (decodeImage || typeof Worker === "undefined") return null;
  return createQrWorkerPool({
    size: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
    workerFactory: () => new Worker(
      new URL("../workers/qr-wasm-decode.worker.js", import.meta.url),
      { type: "module" },
    ),
  });
}
