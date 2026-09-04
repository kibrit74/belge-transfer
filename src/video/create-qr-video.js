import { encryptFile } from "../crypto/encrypted-container.js";
import { createFountainEncoder } from "../optical/fountain.js";
import { encodeFrameV4, OPTICAL_PROTOCOL_VERSION } from "../optical/frame-v4.js";
import { getQrRegions } from "../optical/frame-layout.js";
import { getOpticalProfile } from "../optical/profiles.js";
import { readFileAsArrayBuffer } from "../protocol/hash.js";
import { VIDEO_OPTIONS, buildFrameSchedule } from "./frame-schedule.js";
import { createColorQrVideo } from "./create-color-qr-video.js";
import { createQrFramePreloader } from "./qr-frame-preloader.js";
import { rasterizeQrText } from "./qr-raster.js";
import { createQrRenderPool } from "./qr-render-pool.js";

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

class VideoTransferError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VideoTransferError";
    this.code = code;
  }
}

export async function createQrVideo(file, options = {}, onProgress = null) {
  const profile = getOpticalProfile(options.profileId ?? "balanced");
  if (profile.isColor) return createColorQrVideo(file, options, onProgress);
  return createStandardQrVideo(file, profile, options, onProgress);
}

async function createStandardQrVideo(file, profile, options, onProgress) {
  throwIfVideoAborted(options.signal);
  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    throw new VideoTransferError(
      "VIDEO_UNSUPPORTED",
      "Tarayıcınız QR video kaydını desteklemiyor.",
    );
  }
  if (!file || !Number.isSafeInteger(file.size) || file.size > VIDEO_OPTIONS.maxBytes) {
    throw new VideoTransferError("VIDEO_SIZE_LIMIT", "QR Video boyutu güvenli sınırı aşıyor.");
  }

  reportProgress(onProgress, "encrypting", 0);
  const encrypted = await encryptFile(file);
  const containerBytes = new Uint8Array(await readFileAsArrayBuffer(encrypted.blob));
  reportProgress(onProgress, "encrypting", 100);

  const recoveryId = `outgoing:${encrypted.transferId}`;
  let recoverySaved = false;
  if (options.recoveryStore) {
    try {
      await options.recoveryStore.saveOutgoing({
        id: recoveryId,
        transferId: encrypted.transferId,
        protocolVersion: OPTICAL_PROTOCOL_VERSION,
        createdAt: Date.now(),
        encryptedBytes: containerBytes,
      });
      recoverySaved = true;
    } catch (error) {
      options.onRecoveryWarning?.(error);
    }
  }

  reportProgress(onProgress, "encoding", 0);
  const fountain = await createFountainEncoder(containerBytes, {
    transferId: encrypted.transferId,
    blockBytes: profile.symbolBytes,
    emissionRatio: profile.emissionRatio,
  });
  const frameTexts = fountain.symbols().map((symbol) => encodeFrameV4(fountain.metadata, symbol));
  const grouped = groupFrames(frameTexts, profile.qrCount);
  const hold = options.holdFrames ?? profile.holdFrames ?? 1;
  const schedule = buildFrameSchedule(grouped, options.repeatCount ?? 1, hold);
  reportProgress(onProgress, "encoding", 100);

  const videoCanvas = document.createElement("canvas");
  videoCanvas.width = profile.width;
  videoCanvas.height = profile.height;
  const videoContext = videoCanvas.getContext("2d");
  if (!videoContext) throw new Error("Video tuvali hazırlanamadı.");
  videoContext.imageSmoothingEnabled = false;

  const regions = getQrRegions(profile);
  const qrCanvases = regions.map(() => document.createElement("canvas"));
  let { renderer, owned: ownsRenderer } = resolveQrRenderer(options);
  let preloader;
  try {
    preloader = createPreloader(renderer, schedule, options);
  } catch (error) {
    if (ownsRenderer) renderer.close();
    throw error;
  }

  const closePreparation = () => {
    preloader.close();
    if (ownsRenderer) renderer.close();
  };

  reportProgress(onProgress, "preparing", 0);
  let preparedFrame;
  try {
    preparedFrame = await preloader.takeNext();
    throwIfVideoAborted(options.signal);
  } catch (error) {
    if (ownsRenderer && error?.code === "WORKER_ERROR") {
      closePreparation();
      options.onPerformanceWarning?.(error);
      renderer = createMainThreadRenderer(options.rasterizeQrText);
      ownsRenderer = true;
      preloader = createPreloader(renderer, schedule, options);
      try {
        preparedFrame = await preloader.takeNext();
        throwIfVideoAborted(options.signal);
      } catch (fallbackError) {
        closePreparation();
        throw fallbackError;
      }
    } else {
      closePreparation();
      throw error;
    }
  }
  reportProgress(onProgress, "preparing", 100);

  let stream;
  let recorder;
  try {
    stream = videoCanvas.captureStream(profile.fps);
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: options.videoBitsPerSecond ?? 8_000_000,
    });
  } catch (error) {
    closePreparation();
    stream?.getTracks?.().forEach((track) => track.stop());
    throw error;
  }
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size > 0) chunks.push(event.data);
  };

  return new Promise((resolve, reject) => {
    let recordingSucceeded = false;
    let settled = false;
    let resourcesClosed = false;

    const onAbort = () => {
      if (recorder.state !== "inactive") recorder.stop();
      rejectOnce(abortedVideoError());
    };

    const closeResources = () => {
      if (resourcesClosed) return;
      resourcesClosed = true;
      preloader.close();
      if (ownsRenderer) renderer.close();
      stream.getTracks?.().forEach((track) => track.stop());
      options.signal?.removeEventListener("abort", onAbort);
    };

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      closeResources();
      reject(error);
    };

    recorder.onerror = (event) => {
      const error = event?.error instanceof Error
        ? event.error
        : event instanceof Error ? event : new Error("Video kaydı sırasında hata oluştu.");
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Stream ve diğer kaynaklar aşağıdaki ortak temizleyicide kapanır.
        }
      }
      rejectOnce(error);
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    recorder.onstop = async () => {
      closeResources();
      if (!recordingSucceeded || settled) return;
      settled = true;
      if (recoverySaved && recordingSucceeded) {
        try {
          await options.recoveryStore.delete(recoveryId);
        } catch (error) {
          options.onRecoveryWarning?.(error);
        }
      }
      resolve({
        blob: new Blob(chunks, { type: mimeType }),
        keyText: encrypted.keyText,
        transferId: encrypted.transferId,
        sha256: encrypted.sha256,
        opticalSha256: fountain.metadata.sha256,
        durationSeconds: Math.ceil(schedule.length / profile.fps),
        mimeType,
        protocolVersion: OPTICAL_PROTOCOL_VERSION,
        profileId: profile.id,
      });
    };

    try {
      recorder.start();
    } catch (error) {
      rejectOnce(error instanceof Error ? error : new Error("Video kaydı başlatılamadı."));
      return;
    }
    const frameIntervalMs = Math.ceil(1000 / profile.fps);
    let frameIndex = 0;

    async function drawNextFrame() {
      if (settled) return;
      if (frameIndex >= schedule.length) {
        recordingSucceeded = true;
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }

      try {
        videoContext.fillStyle = "#ffffff";
        videoContext.fillRect(0, 0, profile.width, profile.height);
        preparedFrame.forEach((raster, regionIndex) => {
          drawRasterToCanvas(qrCanvases[regionIndex], raster);
          const region = regions[regionIndex];
          videoContext.drawImage(
            qrCanvases[regionIndex],
            region.x,
            region.y,
            region.size,
            region.size,
          );
        });

        frameIndex += 1;
        reportProgress(onProgress, "recording", Math.round((frameIndex / schedule.length) * 100));
        const earliestNextFrameAt = Date.now() + frameIntervalMs;
        preparedFrame = await preloader.takeNext();
        setTimeout(drawNextFrame, Math.max(0, earliestNextFrameAt - Date.now()));
      } catch (error) {
        if (recorder.state !== "inactive") recorder.stop();
        rejectOnce(error instanceof Error ? error : new Error("QR karesi çizilemedi."));
      }
    }

    void drawNextFrame();
  });
}

function createPreloader(renderer, schedule, options) {
  return createQrFramePreloader({
    schedule,
    signal: options.signal,
    maxBufferedFrames: options.maxBufferedFrames ?? 8,
    renderQr: (text, context) => renderer.render(text, context),
  });
}

function resolveQrRenderer(options) {
  if (options.qrRenderPool) return { renderer: options.qrRenderPool, owned: false };
  try {
    const factory = options.createQrRenderPool ?? createQrRenderPool;
    return { renderer: factory(), owned: true };
  } catch (error) {
    options.onPerformanceWarning?.(error);
    return { renderer: createMainThreadRenderer(options.rasterizeQrText), owned: true };
  }
}

function createMainThreadRenderer(customRasterize) {
  const rasterize = customRasterize ?? rasterizeQrText;
  return {
    async render(text, context) {
      return { ...context, ...rasterize(text) };
    },
    close() {},
  };
}

function drawRasterToCanvas(canvas, raster) {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("QR ara tuvali hazırlanamadı.");
  const imageData = context.createImageData(raster.width, raster.height);
  imageData.data.set(raster.pixels);
  context.putImageData(imageData, 0, 0);
}

function groupFrames(frameTexts, qrCount) {
  const groups = [];
  for (let index = 0; index < frameTexts.length; index += qrCount) {
    groups.push(frameTexts.slice(index, index + qrCount));
  }
  return groups;
}

function reportProgress(callback, stage, percent) {
  callback?.({ stage, percent });
}

function throwIfVideoAborted(signal) {
  if (signal?.aborted) throw abortedVideoError();
}

function abortedVideoError() {
  return new VideoTransferError("ABORTED", "QR video oluşturma iptal edildi.");
}
