import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;
export const CAMERA_DECODE_TIMEOUT_MS = 1_200;

const CAMERA_ERROR_MESSAGE =
  "Kameraya erişilemedi. Kamera izinlerini veya donanımını kontrol edin.";

function createDecodeWorker() {
  if (typeof Worker === "undefined") return null;

  try {
    return new Worker(new URL("../workers/qr-decode.worker.js", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
}

function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useCameraScanner({
  onDecoded,
  enabled = true,
  facingMode = "environment",
  paused = false,
  scanIntervalMs = 70,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mountedRef = useRef(false);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const workerRef = useRef(null);
  const workerBusyRef = useRef(false);
  const decodeQueueRef = useRef(Promise.resolve());
  const decodeAttemptIdRef = useRef(0);
  const cancelActiveDecodeRef = useRef(null);
  const pendingDecodeCountRef = useRef(0);
  const decodeIdleResolversRef = useRef([]);
  const cameraRequestIdRef = useRef(0);
  const onDecodedRef = useRef(onDecoded);
  const optionsRef = useRef({ enabled, facingMode, paused, scanIntervalMs });
  const [error, setError] = useState(null);

  onDecodedRef.current = onDecoded;
  optionsRef.current = { enabled, facingMode, paused, scanIntervalMs };

  const stopScanning = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const resetBusyWorker = useCallback(() => {
    if (!workerBusyRef.current) return;

    const worker = workerRef.current;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    workerBusyRef.current = false;
    workerRef.current = mountedRef.current ? createDecodeWorker() : null;
  }, []);

  const decodeImageData = useCallback((imageData) => {
    const worker = workerRef.current;
    if (worker && !workerBusyRef.current) {
      workerBusyRef.current = true;
      return new Promise((resolve) => {
        const finish = (text) => {
          workerBusyRef.current = false;
          worker.onmessage = null;
          worker.onerror = null;
          resolve(text);
        };

        worker.onmessage = (event) => {
          const message = event.data;
          finish(message?.type === "decoded" ? message.text : null);
        };
        worker.onerror = () => finish(null);
        worker.postMessage({ type: "decode", imageData });
      });
    }

    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    return Promise.resolve(code?.data ?? null);
  }, []);

  const decodeCanvasNow = useCallback(
    async (source, attemptId) => {
      if (!source || !mountedRef.current) return null;

      if (detectorRef.current) {
        try {
          const codes = await detectorRef.current.detect(source);
          if (attemptId !== decodeAttemptIdRef.current || !mountedRef.current) return null;
          if (codes?.length > 0) return codes[0].rawValue;
        } catch {
          // BarcodeDetector destekli değilse veya geçici hata verirse jsQR yedeğine ineriz.
        }
        if (attemptId !== decodeAttemptIdRef.current || !mountedRef.current) return null;
      }

      const width = source.videoWidth || source.width || 640;
      const height = source.videoHeight || source.height || 360;
      const isCanvasSource =
        typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement;
      const canvas = isCanvasSource ? source : canvasRef.current ?? document.createElement("canvas");
      if (!isCanvasSource) {
        const scale = Math.min(1, 640 / width);
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));
        if (canvas.width !== targetWidth) canvas.width = targetWidth;
        if (canvas.height !== targetHeight) canvas.height = targetHeight;
      }
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;

      if (!isCanvasSource) {
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
      }
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      return decodeImageData(imageData);
    },
    [decodeImageData],
  );

  const decodeCanvasWithTimeout = useCallback(
    (source) => {
      const attemptId = decodeAttemptIdRef.current + 1;
      decodeAttemptIdRef.current = attemptId;

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          if (cancelActiveDecodeRef.current === cancel) {
            cancelActiveDecodeRef.current = null;
          }
          callback(value);
        };
        const cancel = () => {
          if (decodeAttemptIdRef.current === attemptId) {
            decodeAttemptIdRef.current += 1;
          }
          resetBusyWorker();
          finish(resolve, null);
        };
        const timeoutId = setTimeout(cancel, CAMERA_DECODE_TIMEOUT_MS);
        cancelActiveDecodeRef.current = cancel;

        decodeCanvasNow(source, attemptId).then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error),
        );
      });
    },
    [decodeCanvasNow, resetBusyWorker],
  );

  const waitForDecodeIdle = useCallback(() => {
    if (pendingDecodeCountRef.current === 0) return Promise.resolve();
    return new Promise((resolve) => {
      decodeIdleResolversRef.current.push(resolve);
    });
  }, []);

  const decodeCanvas = useCallback(
    (source) => {
      pendingDecodeCountRef.current += 1;

      const decode = async () => {
        try {
          return await decodeCanvasWithTimeout(source);
        } finally {
          pendingDecodeCountRef.current -= 1;
          if (pendingDecodeCountRef.current === 0) {
            const resolvers = decodeIdleResolversRef.current.splice(0);
            resolvers.forEach((resolve) => resolve());
          }
        }
      };

      const queuedDecode = decodeQueueRef.current.then(decode, decode);
      decodeQueueRef.current = queuedDecode.catch(() => null);
      return queuedDecode;
    },
    [decodeCanvasWithTimeout],
  );

  const scanLoopRef = useRef(null);
  scanLoopRef.current = async () => {
    if (!mountedRef.current) return;
    const options = optionsRef.current;
    const video = videoRef.current;

    if (options.enabled && !options.paused && video && video.readyState >= video.HAVE_ENOUGH_DATA) {
      const decodedText = await decodeCanvas(video);
      if (!mountedRef.current || optionsRef.current.paused || !optionsRef.current.enabled) return;
      if (decodedText) onDecodedRef.current?.(decodedText);
    }

    const nextOptions = optionsRef.current;
    if (mountedRef.current && nextOptions.enabled && !nextOptions.paused) {
      timerRef.current = setTimeout(() => scanLoopRef.current?.(), nextOptions.scanIntervalMs);
    }
  };

  const startScanning = useCallback(() => {
    stopScanning();
    if (mountedRef.current && optionsRef.current.enabled && !optionsRef.current.paused) {
      scanLoopRef.current?.();
    }
  }, [stopScanning]);

  const startCamera = useCallback(async () => {
    const requestId = cameraRequestIdRef.current + 1;
    cameraRequestIdRef.current = requestId;
    stopScanning();
    stopStream();
    if (!optionsRef.current.enabled) return;

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: optionsRef.current.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (
        requestId !== cameraRequestIdRef.current ||
        !mountedRef.current ||
        !optionsRef.current.enabled
      ) {
        stopMediaStream(stream);
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (
        requestId !== cameraRequestIdRef.current ||
        !mountedRef.current ||
        !optionsRef.current.enabled
      ) {
        stopMediaStream(stream);
        if (streamRef.current === stream) streamRef.current = null;
        if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
        return;
      }
      setError(null);
      startScanning();
    } catch {
      if (stream) {
        stopMediaStream(stream);
        if (streamRef.current === stream) streamRef.current = null;
        if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
      }
      if (mountedRef.current && requestId === cameraRequestIdRef.current) {
        setError(CAMERA_ERROR_MESSAGE);
      }
    }
  }, [startScanning, stopScanning, stopStream]);

  useEffect(() => {
    mountedRef.current = true;
    if (hasBarcodeDetector) {
      try {
        detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        detectorRef.current = null;
      }
    }
    workerRef.current = createDecodeWorker();

    return () => {
      mountedRef.current = false;
      cameraRequestIdRef.current += 1;
      cancelActiveDecodeRef.current?.();
      stopScanning();
      stopStream();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [stopScanning, stopStream]);

  useEffect(() => {
    if (enabled) {
      startCamera();
    } else {
      stopScanning();
      stopStream();
    }
  }, [enabled, facingMode, startCamera, stopScanning, stopStream]);

  useEffect(() => {
    if (!enabled) return;
    if (paused) {
      stopScanning();
    } else if (streamRef.current) {
      startScanning();
    }
  }, [enabled, paused, startScanning, stopScanning]);

  return {
    videoRef,
    canvasRef,
    error,
    decodeCanvas,
    waitForDecodeIdle,
    startScanning,
    stopScanning,
    restartCamera: startCamera,
  };
}
