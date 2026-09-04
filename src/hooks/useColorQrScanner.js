import { useCallback, useEffect, useRef, useState } from "react";

export const COLOR_SCAN_INTERVAL_MS = 167;

const CAMERA_PERMISSION_ERROR =
  "Kamera izni verilmedi. İzinleri kontrol edip yeniden deneyebilir veya dosya seçebilirsiniz.";
const CAMERA_ERROR =
  "Kameraya erişilemedi. Kamera bağlantısını kontrol edip yeniden deneyebilirsiniz.";
const DECODE_ERROR =
  "Renkli QR karesi çözümlenemedi. Lütfen kamerayı sabit tutup yeniden deneyin.";

function getCaptureSize(width, height) {
  const safeWidth = Math.max(1, width || 1);
  const safeHeight = Math.max(1, height || 1);
  const longEdge = Math.max(safeWidth, safeHeight);
  const shortEdge = Math.min(safeWidth, safeHeight);
  const scale = Math.min(1, 1280 / longEdge, 720 / shortEdge);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function useColorQrScanner({
  enabled,
  paused = false,
  facingMode = "environment",
  sessionId,
  workerClient,
  onFrame,
  scanIntervalMs = COLOR_SCAN_INTERVAL_MS,
}) {
  const effectiveScanIntervalMs = Number.isFinite(scanIntervalMs)
    ? Math.max(COLOR_SCAN_INTERVAL_MS, scanIntervalMs)
    : COLOR_SCAN_INTERVAL_MS;
  const videoRef = useRef(null);
  const attachedVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const mountedRef = useRef(false);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const stoppedStreamsRef = useRef(new WeakSet());
  const stoppedTracksRef = useRef(new WeakSet());
  const cameraRequestRef = useRef(0);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastScanAtRef = useRef(Number.NEGATIVE_INFINITY);
  const previousPausedRef = useRef(paused);
  const scanLiveRef = useRef(null);
  const onFrameRef = useRef(onFrame);
  const workerClientRef = useRef(workerClient);
  const optionsRef = useRef({
    enabled,
    paused,
    facingMode,
    sessionId,
    scanIntervalMs: effectiveScanIntervalMs,
  });
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  onFrameRef.current = onFrame;
  workerClientRef.current = workerClient;
  optionsRef.current = {
    enabled,
    paused,
    facingMode,
    sessionId,
    scanIntervalMs: effectiveScanIntervalMs,
  };

  const clearScanTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopStreamTracks = useCallback((stream) => {
    if (!stream || stoppedStreamsRef.current.has(stream)) return;
    stoppedStreamsRef.current.add(stream);
    stream?.getTracks().forEach((track) => {
      if (stoppedTracksRef.current.has(track)) return;
      stoppedTracksRef.current.add(track);
      track.stop();
    });
  }, []);

  const detachStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stopStreamTracks(stream);
    const video = videoRef.current ?? attachedVideoRef.current;
    if (video) video.srcObject = null;
    attachedVideoRef.current = null;
  }, [stopStreamTracks]);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    generationRef.current += 1;
    clearScanTimer();
    detachStream();
    if (mountedRef.current) setIsScanning(false);
  }, [clearScanTimer, detachStream]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < video.HAVE_ENOUGH_DATA) return null;

    const size = getCaptureSize(video.videoWidth, video.videoHeight);
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(video, 0, 0, size.width, size.height);
    return context.getImageData(0, 0, size.width, size.height);
  }, []);

  const scanCurrentFrame = useCallback(async () => {
    if (inFlightRef.current || !mountedRef.current) return null;

    const generation = generationRef.current;
    const options = optionsRef.current;
    const client = workerClientRef.current;
    if (!client?.decodeImage || !options.enabled || options.paused) return null;
    const now = Date.now();
    if (now - lastScanAtRef.current < COLOR_SCAN_INTERVAL_MS) return null;

    const imageData = captureFrame();
    if (!imageData) return null;

    inFlightRef.current = true;
    lastScanAtRef.current = now;
    try {
      const result = await client.decodeImage(options.sessionId, imageData);
      const currentOptions = optionsRef.current;
      const isCurrent = mountedRef.current
        && generation === generationRef.current
        && options.sessionId === currentOptions.sessionId
        && options.facingMode === currentOptions.facingMode
        && client === workerClientRef.current
        && currentOptions.enabled
        && !currentOptions.paused;

      if (!isCurrent) return null;
      setError(null);
      if (result !== null && result !== undefined) onFrameRef.current?.(result);
      return result ?? null;
    } catch (decodeError) {
      const isCurrent = mountedRef.current && generation === generationRef.current;
      if (isCurrent && decodeError?.code !== "STALE_SESSION") setError(DECODE_ERROR);
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [captureFrame]);

  const scheduleNextScan = useCallback((generation) => {
    const options = optionsRef.current;
    if (
      !mountedRef.current
      || generation !== generationRef.current
      || !streamRef.current
      || !options.enabled
      || options.paused
    ) return;

    clearScanTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      scanLiveRef.current?.(generation);
    }, options.scanIntervalMs);
  }, [clearScanTimer]);

  scanLiveRef.current = async (generation = generationRef.current) => {
    if (generation !== generationRef.current) return;
    await scanCurrentFrame();
    scheduleNextScan(generation);
  };

  const startCamera = useCallback(async () => {
    const requestId = cameraRequestRef.current + 1;
    cameraRequestRef.current = requestId;
    generationRef.current += 1;
    const generation = generationRef.current;
    clearScanTimer();
    detachStream();
    if (mountedRef.current) setIsScanning(false);
    if (!optionsRef.current.enabled) return;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: optionsRef.current.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (
        !mountedRef.current
        || requestId !== cameraRequestRef.current
        || !optionsRef.current.enabled
      ) {
        stopStreamTracks(stream);
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        attachedVideoRef.current = videoRef.current;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (
        !mountedRef.current
        || requestId !== cameraRequestRef.current
        || generation !== generationRef.current
        || !optionsRef.current.enabled
      ) {
        if (streamRef.current === stream) detachStream();
        else stopStreamTracks(stream);
        return;
      }

      setError(null);
      const shouldScan = !optionsRef.current.paused;
      setIsScanning(shouldScan);
      if (shouldScan) scanLiveRef.current?.(generation);
    } catch (cameraError) {
      if (streamRef.current === stream) detachStream();
      else stopStreamTracks(stream);
      if (!mountedRef.current || requestId !== cameraRequestRef.current) return;

      setIsScanning(false);
      const permissionDenied = cameraError?.name === "NotAllowedError"
        || cameraError?.name === "SecurityError";
      setError(permissionDenied ? CAMERA_PERMISSION_ERROR : CAMERA_ERROR);
    }
  }, [clearScanTimer, detachStream, stopStreamTracks]);

  const scanSnapshot = useCallback(() => scanCurrentFrame(), [scanCurrentFrame]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cameraRequestRef.current += 1;
      generationRef.current += 1;
      clearScanTimer();
      detachStream();
    };
  }, [clearScanTimer, detachStream]);

  useEffect(() => {
    if (enabled) startCamera();
    else stopCamera();
  }, [enabled, facingMode, sessionId, startCamera, stopCamera]);

  useEffect(() => {
    if (!enabled || !streamRef.current) return;
    if (previousPausedRef.current !== paused) {
      previousPausedRef.current = paused;
      generationRef.current += 1;
    }
    if (paused) {
      clearScanTimer();
      setIsScanning(false);
      return;
    }

    setIsScanning(true);
    scanLiveRef.current?.(generationRef.current);
  }, [clearScanTimer, enabled, paused]);

  return {
    videoRef,
    error,
    isScanning,
    restartCamera: startCamera,
    scanSnapshot,
    stopCamera,
  };
}
