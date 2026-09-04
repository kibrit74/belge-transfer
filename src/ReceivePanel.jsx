import { useEffect, useRef, useState } from "react";
import { useCameraScanner } from "./hooks/useCameraScanner.js";
import { useMultiQrScanner } from "./hooks/useMultiQrScanner.js";
import { createLiveQrReceiveClient } from "./live-qr/receive-client.js";
import LiveQrReceiveScanner from "./LiveQrReceiveScanner.jsx";
import { parseFrame } from "./protocol";
import { createReceiveSession } from "./transfer/receive-session";

const BURST_IDLE_WAIT_TIMEOUT_MS = 1_500;

export default function ReceivePanel({ liveReceiveClient } = {}) {
  const sessionRef = useRef(null);
  const resultUrlRef = useRef(null);
  const mountedRef = useRef(false);
  const burstCountdownTimerRef = useRef(null);
  const burstRecordTimerRef = useRef(null);
  const burstResolveRef = useRef(null);
  const burstStatusTimerRef = useRef(null);
  const burstIdleWaitTimerRef = useRef(null);
  const burstIdleWaitResolveRef = useRef(null);
  const burstRecordingRef = useRef(false);
  const burstDecodeInFlightRef = useRef(false);
  const burstAcceptingFramesRef = useRef(false);
  const liveClientRef = useRef(null);
  const liveUnsubscribeRef = useRef(null);
  const liveReceiveClientRef = useRef(liveReceiveClient);
  const liveMessageHandlerRef = useRef(null);
  const transferStartedAtRef = useRef(Date.now());

  const [receiveError, setReceiveError] = useState(null);
  const [progress, setProgress] = useState({ collected: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [receiveFailed, setReceiveFailed] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [burstRecording, setBurstRecording] = useState(false);
  const [burstStatus, setBurstStatus] = useState("");
  const [liveMode, setLiveMode] = useState(true);
  const [liveStatus, setLiveStatus] = useState("waiting");
  const [scannerDismissed, setScannerDismissed] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  if (sessionRef.current === null) sessionRef.current = createReceiveSession();

  const scanner = useCameraScanner({
    onDecoded: handleDecoded,
    enabled: !scannerDismissed && !liveMode && !result && !receiveFailed,
    facingMode,
    paused: burstRecording,
  });
  const liveScanner = useMultiQrScanner({
    onDecodedBatch: handleLiveQrBatch,
    enabled: !scannerDismissed && liveMode && !result && !receiveFailed,
    facingMode,
  });

  useEffect(() => {
    mountedRef.current = true;
    const injectedClient = liveReceiveClientRef.current;
    if (injectedClient && !liveClientRef.current) {
      liveClientRef.current = injectedClient;
      liveUnsubscribeRef.current = injectedClient.subscribe((message) => {
        liveMessageHandlerRef.current?.(message);
      });
    }
    return () => {
      mountedRef.current = false;
      burstRecordingRef.current = false;
      burstAcceptingFramesRef.current = false;
      finishBurstRecording();
      liveUnsubscribeRef.current?.();
      liveUnsubscribeRef.current = null;
      liveClientRef.current?.close();
      liveClientRef.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (result || scannerDismissed || receiveFailed) return undefined;
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - transferStartedAtRef.current) / 1000)));
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [receiveFailed, result, scannerDismissed]);

  function clearBurstTimers() {
    if (burstCountdownTimerRef.current) {
      clearInterval(burstCountdownTimerRef.current);
      burstCountdownTimerRef.current = null;
    }
    if (burstRecordTimerRef.current) {
      clearInterval(burstRecordTimerRef.current);
      burstRecordTimerRef.current = null;
    }
    if (burstStatusTimerRef.current) {
      clearTimeout(burstStatusTimerRef.current);
      burstStatusTimerRef.current = null;
    }
    if (burstIdleWaitTimerRef.current) {
      clearTimeout(burstIdleWaitTimerRef.current);
      burstIdleWaitTimerRef.current = null;
    }
    const resolveIdleWait = burstIdleWaitResolveRef.current;
    burstIdleWaitResolveRef.current = null;
    resolveIdleWait?.(false);
  }

  function finishBurstRecording() {
    burstAcceptingFramesRef.current = false;
    clearBurstTimers();
    const resolveBurst = burstResolveRef.current;
    burstResolveRef.current = null;
    resolveBurst?.();
  }

  function finishBurstUi() {
    burstRecordingRef.current = false;
    if (mountedRef.current) setBurstRecording(false);
  }

  function waitForDecodeIdleWithTimeout() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (isIdle) => {
        if (settled) return;
        settled = true;
        if (burstIdleWaitTimerRef.current) {
          clearTimeout(burstIdleWaitTimerRef.current);
          burstIdleWaitTimerRef.current = null;
        }
        if (burstIdleWaitResolveRef.current === finish) {
          burstIdleWaitResolveRef.current = null;
        }
        resolve(isIdle);
      };

      burstIdleWaitResolveRef.current = finish;
      burstIdleWaitTimerRef.current = setTimeout(
        () => finish(false),
        BURST_IDLE_WAIT_TIMEOUT_MS,
      );
      scanner.waitForDecodeIdle().then(() => finish(true), () => finish(false));
    });
  }

  function toggleCamera() {
    setFacingMode((current) => (current === "environment" ? "user" : "environment"));
  }

  async function triggerBurstRecording() {
    const video = scanner.videoRef.current;
    if (
      burstRecordingRef.current ||
      burstDecodeInFlightRef.current ||
      !mountedRef.current ||
      !video ||
      video.readyState < video.HAVE_ENOUGH_DATA
    ) {
      return;
    }

    burstRecordingRef.current = true;
    setBurstRecording(true);
    scanner.stopScanning();
    if (burstStatusTimerRef.current) {
      clearTimeout(burstStatusTimerRef.current);
      burstStatusTimerRef.current = null;
    }

    const scannerIsIdle = await waitForDecodeIdleWithTimeout();
    if (!scannerIsIdle) {
      if (mountedRef.current && burstRecordingRef.current) {
        setBurstStatus("Önceki kamera çözümü zaman aşımına uğradı. Lütfen yeniden deneyin.");
      }
      finishBurstUi();
      return;
    }
    if (
      !mountedRef.current ||
      !burstRecordingRef.current ||
      sessionRef.current.getState() === "complete"
    ) {
      finishBurstUi();
      return;
    }

    burstAcceptingFramesRef.current = true;

    let newlyFound = 0;
    try {
      let scannedFrames = 0;

      const updateBurstStatus = () => {
        if (!mountedRef.current) return;
        setBurstStatus(`Video taranıyor: ${scannedFrames} kare tarandı`);
      };

      burstCountdownTimerRef.current = setInterval(updateBurstStatus, 200);
      updateBurstStatus();

      await new Promise((resolve) => {
        burstResolveRef.current = resolve;
        burstRecordTimerRef.current = setInterval(() => {
          if (
            !mountedRef.current ||
            !burstRecordingRef.current ||
            burstDecodeInFlightRef.current
          ) {
            return;
          }

          scannedFrames += 1;
          burstDecodeInFlightRef.current = true;
          scanner
            .decodeCanvas(video)
            .then((text) => {
              if (!mountedRef.current || !burstAcceptingFramesRef.current || !text) return;

              const accepted = handleDecoded(text);
              if (accepted.accepted) newlyFound += 1;
              if (sessionRef.current.getState() === "complete") finishBurstRecording();
            })
            .catch(() => null)
            .finally(() => {
              burstDecodeInFlightRef.current = false;
            });
        }, 40);
      });

    } finally {
      finishBurstUi();
    }

    if (!mountedRef.current || sessionRef.current.getState() === "complete") return;
    setBurstStatus(
      newlyFound > 0
        ? `Video taramasında ${newlyFound} yeni kare çözüldü.`
        : "Video taraması tamamlandı.",
    );
    burstStatusTimerRef.current = setTimeout(() => {
      burstStatusTimerRef.current = null;
      if (mountedRef.current) setBurstStatus("");
    }, 4000);
  }

  function toggleBurstRecording() {
    if (burstRecordingRef.current) {
      finishBurstRecording();
      finishBurstUi();
      return;
    }

    void triggerBurstRecording();
  }

  function handleDecoded(text) {
    if (isLiveQrText(text)) return handleLiveQrText(text);
    const frame = parseFrame(text);
    if (!frame) return { accepted: false, reason: "invalid-frame" };
    if (frame.protocolVersion === "QRT3") {
      return { accepted: false, reason: "unsupported-protocol" };
    }

    const accepted = sessionRef.current.accept(frame);
    if (!accepted.accepted) {
      if (sessionRef.current.getState() === "failed") showReceiveFailure();
      return accepted;
    }

    setProgress(sessionRef.current.progress());
    setLiveStatus("receiving");

    if (sessionRef.current.getState() === "complete") {
      const assembled = sessionRef.current.assemble();
      if (assembled) {
        const { bytes, metadata } = assembled;

        const mime = metadata.mime ?? "application/octet-stream";
        const fileName = metadata.name ?? `belgeaktar-${metadata.transferId}.bta`;
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = url;
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - transferStartedAtRef.current) / 1000)));
        setResult({ url, name: fileName });
        scanner.stopScanning();

        try {
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch {
          // Otomatik indirme engellenirse görünür indirme bağlantısı kalır.
        }
      } else if (sessionRef.current.getState() === "failed") {
        showReceiveFailure();
      }
    }

    return accepted;
  }

  function getLiveClient() {
    if (liveClientRef.current) return liveClientRef.current;
    const client = liveReceiveClient ?? createLiveQrReceiveClient();
    liveClientRef.current = client;
    liveUnsubscribeRef.current = client.subscribe(handleLiveQrMessage);
    return client;
  }

  function handleLiveQrText(text) {
    try {
      setLiveMode(true);
      const accepted = getLiveClient().accept([text]);
      return accepted ? { accepted: true } : { accepted: false, reason: "worker-closed" };
    } catch {
      showReceiveFailure();
      return { accepted: false, reason: "live-qr-unavailable" };
    }
  }

  function handleLiveQrBatch(texts) {
    const liveQrTexts = texts.filter(isLiveQrText);
    if (liveQrTexts.length === 0) return;
    try {
      getLiveClient().accept(liveQrTexts);
    } catch {
      showReceiveFailure();
    }
  }

  function handleLiveQrMessage(message) {
    if (!mountedRef.current || !message) return;
    if (message.type === "progress") {
      const collected = message.progress?.solved ?? 0;
      const total = message.progress?.sourceCount ?? 0;
      setLiveMode(true);
      setLiveStatus(message.state === "verifying"
        ? "verifying"
        : total > 0 ? "receiving" : "waiting");
      setProgress({ collected, total });
      return;
    }
    if (message.type === "error") {
      showReceiveFailure();
      return;
    }
    if (message.type !== "complete" || !(message.result?.file instanceof File)) return;

    const file = message.result.file;
    const url = URL.createObjectURL(file);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = url;
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - transferStartedAtRef.current) / 1000)));
    setResult({ url, name: file.name, verified: true });
    scanner.stopScanning();
    liveScanner.stopScanning();
  }

  function reset() {
    transferStartedAtRef.current = Date.now();
    setElapsedSeconds(0);
    sessionRef.current.reset();
    setProgress({ collected: 0, total: 0 });
    setReceiveError(null);
    setReceiveFailed(false);
    setLiveMode(true);
    setLiveStatus("waiting");
    setScannerDismissed(false);
    liveClientRef.current?.reset();
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
  }

  function dismissScanner() {
    finishBurstRecording();
    finishBurstUi();
    scanner.stopScanning();
    liveScanner.stopScanning();
    setScannerDismissed(true);
  }

  function resumeScanner() {
    transferStartedAtRef.current = Date.now();
    setElapsedSeconds(0);
    sessionRef.current.reset();
    liveClientRef.current?.reset();
    setProgress({ collected: 0, total: 0 });
    setReceiveError(null);
    setReceiveFailed(false);
    setLiveMode(true);
    setLiveStatus("waiting");
    setScannerDismissed(false);
  }

  function retryScanner() {
    if (receiveFailed) {
      reset();
      return;
    }
    setReceiveError(null);
    if (liveMode) {
      void liveScanner.restartCamera();
    } else {
      void scanner.restartCamera();
    }
  }

  function showReceiveFailure() {
    setReceiveError("Alım başarısız oldu. Alımı sıfırlayıp yeniden deneyin.");
    setReceiveFailed(true);
    scanner.stopScanning();
    liveScanner.stopScanning();
  }

  liveMessageHandlerRef.current = handleLiveQrMessage;

  const error = receiveError || scanner.error || liveScanner.error;

  return (
    <div className="panel">
      {error && scannerDismissed && <p className="error">{error}</p>}
      {receiveFailed && !result && (
        <button type="button" className="btn-ghost" onClick={reset}>
          Alımı sıfırla
        </button>
      )}

      {!result && (
        <>
          {!scannerDismissed && (
            <LiveQrReceiveScanner
              videoRef={liveMode ? liveScanner.videoRef : scanner.videoRef}
              progress={progress}
              status={liveStatus}
              error={error}
              onToggleCamera={toggleCamera}
              onExit={dismissScanner}
              onRetry={retryScanner}
              elapsedSeconds={elapsedSeconds}
            />
          )}
          <canvas ref={liveMode ? liveScanner.canvasRef : scanner.canvasRef} hidden />

          {scannerDismissed && (
            <div className="receive-resume">
              <p>Canlı QR taraması durduruldu.</p>
              <button type="button" className="btn-solid" onClick={resumeScanner}>
                Taramayı yeniden aç
              </button>
            </div>
          )}

          {!scannerDismissed && !liveMode && <div className="receive-controls">
            <button
              type="button"
              className="btn-solid receive-scan-button"
              onClick={toggleBurstRecording}
            >
              {burstRecording ? "Taramayı durdur" : "Taramayı başlat"}
            </button>
          </div>}

          {burstStatus && (
            <p className="hint receive-status">
              {burstStatus}
            </p>
          )}

        </>
      )}

      {result && (
        <div className="result">
          <span className="dropzone-title">Belge tamamlandı.</span>
          <span className="meta-value mono">{result.name}</span>
          <p className="hint receive-success">
            {result.verified
              ? "Dosya doğrulandı. İndirmeye hazır."
              : "Dosya indirmesi otomatik başlatıldı."}
          </p>
          <p className="hint receive-elapsed-result">Aktarım süresi: {formatElapsedTime(elapsedSeconds)}</p>
          <a className="btn-solid download-result-action" href={result.url} target="_blank" rel="noreferrer" download={result.name}>
            {result.verified ? "Dosyayı indir" : "Dosyayı aç / indir"}
          </a>
          <button type="button" className="btn-ghost" onClick={reset}>
            Tekrar dene
          </button>
        </div>
      )}
    </div>
  );
}

function formatElapsedTime(elapsedSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isLiveQrText(text) {
  return typeof text === "string" && (text.startsWith("QRL1|") || text.startsWith("QRL2|"));
}
