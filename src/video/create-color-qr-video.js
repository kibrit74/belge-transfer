import { encryptPreparedFile } from "../crypto/encrypted-container.js";
import { renderColorMatrixV2 } from "../optical/color-matrix-canvas.js";
import { getQrRegions } from "../optical/frame-layout.js";
import { getOpticalProfile } from "../optical/profiles.js";
import { readFileAsArrayBuffer } from "../protocol/hash.js";
import { createColorQrWorkerClient } from "../workers/color-qr-client.js";
import { VIDEO_OPTIONS } from "./frame-schedule.js";

const COLOR_PROTOCOL_VERSION = "CRF2";
const DEFAULT_VIDEO_BITRATE = 8_000_000;
const COLOR_VIDEO_CELL_SIZE = 15;

class ColorVideoTransferError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ColorVideoTransferError";
    this.code = code;
  }
}

export async function createColorQrVideo(file, options = {}, onProgress = null) {
  throwIfAborted(options.signal);
  const profile = getOpticalProfile("color_balanced");
  const mimeType = getSupportedMimeType();
  assertVideoInput(file, mimeType);

  const ownsClient = !options.workerClient;
  const client = options.workerClient ?? createColorQrWorkerClient();
  const sessionId = `color-video:${crypto.randomUUID()}`;
  let recoveryId = null;
  let recoverySaved = false;

  try {
    reportProgress(onProgress, "compressing", 0);
    const originalBytes = new Uint8Array(await readFileAsArrayBuffer(file));
    throwIfAborted(options.signal);
    const prepared = await client.preparePayload(sessionId, new Uint8Array(originalBytes));
    throwIfAborted(options.signal);
    reportProgress(onProgress, "compressing", 100);

    reportProgress(onProgress, "encrypting", 0);
    const encrypted = await encryptPreparedFile(file, prepared);
    throwIfAborted(options.signal);
    const encryptedBytes = new Uint8Array(await readFileAsArrayBuffer(encrypted.blob));
    throwIfAborted(options.signal);
    reportProgress(onProgress, "encrypting", 100);

    recoveryId = `outgoing:${encrypted.transferId}`;
    if (options.recoveryStore) {
      try {
        await options.recoveryStore.saveOutgoing({
          id: recoveryId,
          transferId: encrypted.transferId,
          protocolVersion: COLOR_PROTOCOL_VERSION,
          createdAt: Date.now(),
          encryptedBytes,
        });
        recoverySaved = true;
      } catch (error) {
        options.onRecoveryWarning?.(error);
      }
    }

    reportProgress(onProgress, "encoding", 0);
    throwIfAborted(options.signal);
    const optical = await client.prepareOptical(sessionId, encryptedBytes, {
      transferId: encrypted.transferId,
      blockBytes: profile.symbolBytes,
      emissionRatio: profile.emissionRatio,
    });
    throwIfAborted(options.signal);
    reportProgress(onProgress, "encoding", 100);

    const recorded = await recordPreparedColorSession({
      client,
      sessionId,
      optical,
      options: { ...options, profile, mimeType },
      onProgress,
      resultMetadata: {
        keyText: encrypted.keyText,
        transferId: encrypted.transferId,
        sha256: encrypted.sha256,
        protocolVersion: COLOR_PROTOCOL_VERSION,
        compressionStats: {
          compression: prepared.compression,
          originalSize: prepared.originalSize,
          storedSize: prepared.storedSize,
          savedPercent: prepared.savedPercent,
        },
      },
    });

    if (recoverySaved) {
      try {
        await options.recoveryStore.delete(recoveryId);
      } catch (error) {
        options.onRecoveryWarning?.(error);
      }
    }
    return recorded;
  } finally {
    client.disposeSession(sessionId);
    if (ownsClient) client.terminate();
  }
}

export async function recordPreparedColorSession({
  client,
  sessionId,
  optical,
  options = {},
  onProgress = null,
  resultMetadata = {},
}) {
  const profile = options.profile ?? getOpticalProfile("color_balanced");
  const schedule = buildColorSchedule(
    optical.emittedSymbols,
    profile.qrCount,
    profile.holdFrames,
  );
  const recorded = await recordColorSchedule({
    client,
    sessionId,
    schedule,
    profile,
    onProgress,
    options,
  });

  return {
    ...recorded,
    ...resultMetadata,
    profileId: profile.id,
    isColor: true,
  };
}

function buildColorSchedule(emittedSymbols, regionCount, holdFrames) {
  const schedule = [];
  for (let first = 0; first < emittedSymbols; first += regionCount) {
    const regions = Array.from({ length: regionCount }, (_, offset) => {
      const symbolId = first + offset;
      return symbolId < emittedSymbols ? symbolId : null;
    });
    for (let repeat = 0; repeat < holdFrames; repeat += 1) {
      schedule.push(regions);
    }
  }
  return schedule;
}

async function recordColorSchedule({
  client,
  sessionId,
  schedule,
  profile,
  onProgress,
  options,
}) {
  const mimeType = options.mimeType ?? getSupportedMimeType();
  assertVideoInput({ size: 0 }, mimeType);

  const videoCanvas = document.createElement("canvas");
  videoCanvas.width = profile.width;
  videoCanvas.height = profile.height;
  const videoContext = videoCanvas.getContext("2d");
  if (!videoContext) throw new Error("Video tuvali hazırlanamadı.");
  videoContext.imageSmoothingEnabled = false;

  const regions = getQrRegions(profile);
  const colorCanvases = regions.map(() => document.createElement("canvas"));
  const { stream, requestFrame } = createColorCaptureStream(videoCanvas, profile.fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: options.videoBitsPerSecond ?? DEFAULT_VIDEO_BITRATE,
  });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size > 0) chunks.push(event.data);
  };

  return new Promise((resolve, reject) => {
    let frameTimer = null;
    let finished = false;
    let completing = false;
    let tracksStopped = false;

    const stopTracks = () => {
      if (tracksStopped) return;
      tracksStopped = true;
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* Kaynak zaten kapanmış olabilir. */ }
      });
    };
    const clearFrameTimer = () => {
      if (frameTimer !== null) clearTimeout(frameTimer);
      frameTimer = null;
    };
    const removeAbortListener = () => options.signal?.removeEventListener("abort", onAbort);
    const stopRecorder = () => {
      if (recorder.state === "inactive") return;
      try { recorder.stop(); } catch { /* onstop veya hata yolu finalizasyonu tamamlar. */ }
    };
    const fail = (error) => {
      if (finished) return;
      finished = true;
      clearFrameTimer();
      removeAbortListener();
      stopRecorder();
      stopTracks();
      reject(error instanceof Error ? error : new Error("Renkli QR karesi çizilemedi."));
    };
    const onAbort = () => fail(abortedError());

    recorder.onerror = (error) => {
      fail(error instanceof Error ? error : new Error("Video kaydı sırasında hata oluştu."));
    };
    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      clearFrameTimer();
      removeAbortListener();
      stopTracks();
      resolve({
        blob: new Blob(chunks, { type: mimeType }),
        durationSeconds: Math.ceil(schedule.length / profile.fps),
        mimeType,
      });
    };

    if (options.signal?.aborted) {
      fail(abortedError());
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      recorder.start();
    } catch (error) {
      fail(error);
      return;
    }
    const startedAt = Date.now();
    let frameIndex = 0;

    async function drawNextFrame() {
      if (finished || completing) return;
      if (frameIndex >= schedule.length) {
        completing = true;
        clearFrameTimer();
        stopRecorder();
        return;
      }

      try {
        throwIfAborted(options.signal);
        videoContext.fillStyle = "#ffffff";
        videoContext.fillRect(0, 0, profile.width, profile.height);
        const symbolIds = schedule[frameIndex];
        const frames = await Promise.all(symbolIds.map((symbolId) => (
          symbolId === null ? null : client.getFrame(sessionId, symbolId)
        )));
        if (finished || completing) return;
        throwIfAborted(options.signal);

        frames.forEach((frame, regionIndex) => {
          if (!frame) return;
          const region = regions[regionIndex];
          const colorCanvas = colorCanvases[regionIndex];
          const rendered = renderColorMatrixV2(colorCanvas, frame.frameBytes, {
            // 1080p -> 720p tarama ölçeğinde her hücre tam 10 piksel kalır.
            cellSize: COLOR_VIDEO_CELL_SIZE,
            maxCanvasSize: region.size,
          });
          const drawX = region.x + Math.floor((region.size - rendered.size) / 2);
          const drawY = region.y + Math.floor((region.size - rendered.size) / 2);
          videoContext.drawImage(
            colorCanvas,
            drawX,
            drawY,
            rendered.size,
            rendered.size,
          );
        });
        requestFrame?.();

        frameIndex += 1;
        reportProgress(
          onProgress,
          "recording",
          Math.round((frameIndex / schedule.length) * 100),
        );
        const targetTime = startedAt + (frameIndex * 1000) / profile.fps;
        frameTimer = setTimeout(drawNextFrame, Math.max(0, targetTime - Date.now()));
      } catch (error) {
        fail(error);
      }
    }

    void drawNextFrame();
  });
}

function createColorCaptureStream(canvas, fps) {
  let stream = canvas.captureStream(0);
  const manualTrack = stream.getVideoTracks?.()[0];
  if (typeof manualTrack?.requestFrame === "function") {
    return {
      stream,
      requestFrame: () => manualTrack.requestFrame(),
    };
  }

  stream.getTracks().forEach((track) => {
    try { track.stop(); } catch { /* Tarayıcı zaten serbest bırakmış olabilir. */ }
  });
  stream = canvas.captureStream(fps);
  return { stream, requestFrame: null };
}

function abortedError() {
  return new ColorVideoTransferError("ABORTED", "Renkli QR video oluşturma iptal edildi.");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortedError();
}

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
  const candidates = [
    "video/mp4;codecs=avc1",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

function assertVideoInput(file, mimeType) {
  if (!mimeType) {
    throw new ColorVideoTransferError(
      "VIDEO_UNSUPPORTED",
      "Tarayıcınız QR video kaydını desteklemiyor.",
    );
  }
  if (!file || !Number.isSafeInteger(file.size) || file.size > VIDEO_OPTIONS.maxBytes) {
    throw new ColorVideoTransferError(
      "VIDEO_SIZE_LIMIT",
      "QR Video boyutu güvenli sınırı aşıyor.",
    );
  }
}

function reportProgress(callback, stage, percent) {
  callback?.({ stage, percent });
}
