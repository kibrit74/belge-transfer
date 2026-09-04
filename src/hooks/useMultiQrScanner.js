import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { createLiveQrDecodePool } from '../live-qr/decode-pool.js';

const CAMERA_ERROR = 'Kameraya erişilemedi. Kamera izinlerini veya donanımını kontrol edin.';

function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useMultiQrScanner({
  onDecodedBatch,
  enabled = true,
  facingMode = 'environment',
  paused = false,
  scanIntervalMs = 33,
  poolFactory = createLiveQrDecodePool,
} = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const poolRef = useRef(null);
  const timerRef = useRef(null);
  const videoFrameRef = useRef(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const scanRef = useRef(null);
  const optionsRef = useRef({ enabled, facingMode, paused, scanIntervalMs });
  const onDecodedBatchRef = useRef(onDecodedBatch);
  const [error, setError] = useState(null);
  const [cameraSettings, setCameraSettings] = useState(null);

  optionsRef.current = { enabled, facingMode, paused, scanIntervalMs };
  onDecodedBatchRef.current = onDecodedBatch;

  const stopScanning = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const video = videoRef.current;
    if (videoFrameRef.current !== null && typeof video?.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(videoFrameRef.current);
    }
    videoFrameRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const snapshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const cropSize = Math.max(1, Math.round(Math.min(width, height) * 0.62));
    const sourceX = Math.max(0, Math.round((width - cropSize) / 2));
    const sourceY = Math.max(0, Math.round((height - cropSize) / 2));
    const targetWidth = cropSize;
    const targetHeight = cropSize;
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(
      video,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      targetWidth,
      targetHeight,
    );
    return context.getImageData(0, 0, targetWidth, targetHeight);
  }, []);

  const fallbackDecode = useCallback(async (imageData) => {
    const video = videoRef.current;
    if (typeof globalThis.BarcodeDetector === 'function' && video) {
      try {
        const detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
        const codes = await detector.detect(video);
        const texts = codes.map((code) => code.rawValue).filter((text) => typeof text === 'string');
        if (texts.length > 0) return [...new Set(texts)];
      } catch {
        // Tarayıcıdaki yerleşik çözümleyici yoksa tek QR yedeğine ineriz.
      }
    }
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return code?.data ? [code.data] : [];
  }, []);

  const scheduleNextScan = () => {
    const next = optionsRef.current;
    if (!mountedRef.current || !next.enabled || next.paused) return;
    const currentVideo = videoRef.current;
    if (typeof currentVideo?.requestVideoFrameCallback === 'function') {
      videoFrameRef.current = currentVideo.requestVideoFrameCallback(() => scanRef.current?.());
    } else {
      timerRef.current = setTimeout(() => scanRef.current?.(), next.scanIntervalMs);
    }
  };

  scanRef.current = async () => {
    const generation = generationRef.current;
    const options = optionsRef.current;
    const video = videoRef.current;
    if (!mountedRef.current || !options.enabled || options.paused || !video || video.readyState < video.HAVE_ENOUGH_DATA) {
      if (
        mountedRef.current
        && options.enabled
        && !options.paused
        && video
        && video.readyState < video.HAVE_ENOUGH_DATA
      ) {
        timerRef.current = setTimeout(() => scanRef.current?.(), options.scanIntervalMs);
      }
      return;
    }
    const imageData = snapshot();
    if (!imageData) {
      scheduleNextScan();
      return;
    }
    const pool = poolRef.current;
    const decodePromise = pool ? pool.decode(imageData) : null;
    if (pool) scheduleNextScan();
    try {
      const result = decodePromise ? await decodePromise : null;
      if (generation !== generationRef.current || !mountedRef.current) return;
      const texts = !pool || result?.error ? await fallbackDecode(imageData) : (result?.texts ?? []);
      if (generation !== generationRef.current || !mountedRef.current) return;
      if (texts.length > 0) onDecodedBatchRef.current?.(texts);
    } catch {
      if (generation === generationRef.current && mountedRef.current) setError(CAMERA_ERROR);
    } finally {
      if (!pool && generation === generationRef.current) scheduleNextScan();
    }
  };

  const startScanning = useCallback(() => {
    stopScanning();
    const options = optionsRef.current;
    if (mountedRef.current && options.enabled && !options.paused) scanRef.current?.();
  }, [stopScanning]);

  const startCamera = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    stopScanning();
    stopStream();
    if (!optionsRef.current.enabled) return;
    let stream;
    try {
      const commonVideo = {
        facingMode: { ideal: optionsRef.current.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...commonVideo, frameRate: { exact: 60 } },
        });
      } catch (error) {
        if (error?.name !== 'OverconstrainedError') throw error;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...commonVideo, frameRate: { ideal: 30 } },
        });
      }
      if (generation !== generationRef.current || !mountedRef.current || !optionsRef.current.enabled) {
        stopMediaStream(stream);
        return;
      }
      const videoTrack = stream.getVideoTracks?.()[0];
      const capabilities = videoTrack?.getCapabilities?.();
      if (capabilities?.focusMode?.includes?.('continuous')) {
        try {
          await videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        } catch {
          // Odak ayarı destek görünse bile cihaz reddederse taramayı sürdür.
        }
      }
      setCameraSettings(videoTrack?.getSettings?.() ?? null);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (generation !== generationRef.current || !mountedRef.current || !optionsRef.current.enabled) {
        stopMediaStream(stream);
        return;
      }
      setError(null);
      startScanning();
    } catch {
      stopMediaStream(stream);
      if (generation === generationRef.current && mountedRef.current) {
        setCameraSettings(null);
        setError(CAMERA_ERROR);
      }
    }
  }, [startScanning, stopScanning, stopStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      stopScanning();
      stopStream();
      poolRef.current?.close();
      poolRef.current = null;
    };
  }, [stopScanning, stopStream]);

  useEffect(() => {
    if (!enabled) return undefined;
    let pool = null;
    try {
      pool = poolFactory();
      poolRef.current = pool;
      setError(null);
    } catch {
      // Worker açılamayan tarayıcılarda tek QR yedeği taramaya devam eder.
      setError(null);
    }
    return () => {
      pool?.close();
      if (poolRef.current === pool) poolRef.current = null;
    };
  }, [enabled, poolFactory]);

  useEffect(() => {
    if (enabled) {
      startCamera();
    } else {
      generationRef.current += 1;
      stopScanning();
      stopStream();
    }
  }, [enabled, facingMode, startCamera, stopScanning, stopStream]);

  useEffect(() => {
    if (!enabled) return;
    if (paused) {
      generationRef.current += 1;
      stopScanning();
    } else if (streamRef.current) {
      startScanning();
    }
  }, [enabled, paused, startScanning, stopScanning]);

  return { videoRef, canvasRef, error, cameraSettings, restartCamera: startCamera, stopScanning };
}
