import { useCallback, useEffect, useRef, useState } from "react";
import SiteNavbar from "./components/SiteNavbar";
import { useColorQrScanner } from "./hooks/useColorQrScanner.js";
import { autoScanColorQrFromCanvas, decodeColorQrPackage } from "./optical/color-matrix.js";
import { renderColorMatrixV2 } from "./optical/color-matrix-canvas.js";
import { openColorPackageV2 } from "./optical/color-package-v2.js";
import { createColorReceiveSession } from "./optical/color-receive-session.js";
import { getOpticalProfile } from "./optical/profiles.js";
import { createTransferId } from "./protocol/transfer-id.js";
import { recordPreparedColorSession } from "./video/create-color-qr-video.js";
import { decodeColorQrVideo } from "./video/decode-color-qr-video.js";
import { createColorQrWorkerClient } from "./workers/color-qr-client.js";
import "./App.css";

const INITIAL_TEXT = "VaultDrop 2026 - Renkli QR Test Motoru";
const EMPTY_PROGRESS = { solved: 0, sourceCount: 0, accepted: 0, duplicates: 0 };

export default function ColorQrLabPage({ workerClient }) {
  const ownedWorkerRef = useRef(null);
  const ownedWorkerCleanupTimerRef = useRef(null);
  const [ownedWorker, setOwnedWorker] = useState(null);
  const ownedWorkerErrorRef = useRef(null);
  const [ownedWorkerError, setOwnedWorkerError] = useState(null);
  const colorWorker = workerClient ?? ownedWorker;
  const [activeTab, setActiveTab] = useState("send");
  const [receiveMethod, setReceiveMethod] = useState("camera");
  const [facingMode, setFacingMode] = useState("environment");
  const [selectedFile, setSelectedFile] = useState(null);
  const [inputText, setInputText] = useState(INITIAL_TEXT);
  const [cellSize, setCellSize] = useState(10);
  const [sendSessionId, setSendSessionId] = useState(() => createSessionId());
  const [sendInfo, setSendInfo] = useState(null);
  const [opticalMetadata, setOpticalMetadata] = useState(null);
  const [compressionStats, setCompressionStats] = useState(null);
  const [currentSymbolId, setCurrentSymbolId] = useState(0);
  const [isAnimatingStream, setIsAnimatingStream] = useState(true);
  const [sendStatus, setSendStatus] = useState("preparing");
  const [sendError, setSendError] = useState("");
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoMimeType, setVideoMimeType] = useState("video/webm");
  const [notification, setNotification] = useState("");
  const [receiveSessionId, setReceiveSessionId] = useState(() => createSessionId());
  const [receiveProgress, setReceiveProgress] = useState(EMPTY_PROGRESS);
  const [receiveStatus, setReceiveStatus] = useState("idle");
  const [receiveError, setReceiveError] = useState("");
  const [receiveFile, setReceiveFile] = useState(null);
  const [isDecodingReceiveFile, setIsDecodingReceiveFile] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState(null);
  const [legacyResult, setLegacyResult] = useState(null);
  const [isSnapshotScanning, setIsSnapshotScanning] = useState(false);
  const canvasRef = useRef(null);
  const sendSessionRef = useRef(sendSessionId);
  const sendGenerationRef = useRef(0);
  const receiveSessionRef = useRef(createColorReceiveSession());
  const receiveSessionIdRef = useRef(receiveSessionId);
  const receiveGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const lifecycleTokenRef = useRef(0);
  const verifiedUrlRef = useRef(null);
  const legacyUrlRef = useRef(null);
  const videoUrlRef = useRef(null);
  const receiveVideoControllerRef = useRef(null);
  const sendVideoControllerRef = useRef(null);

  useEffect(() => {
    if (workerClient) {
      ownedWorkerErrorRef.current = null;
      setOwnedWorkerError(null);
      return undefined;
    }
    if (ownedWorkerCleanupTimerRef.current !== null) {
      clearTimeout(ownedWorkerCleanupTimerRef.current);
      ownedWorkerCleanupTimerRef.current = null;
    }
    if (!ownedWorkerRef.current) {
      try {
        ownedWorkerRef.current = createColorQrWorkerClient();
        ownedWorkerErrorRef.current = null;
        setOwnedWorkerError(null);
      } catch (error) {
        ownedWorkerRef.current = null;
        ownedWorkerErrorRef.current = normalizeWorkerError(error);
        setOwnedWorkerError(ownedWorkerErrorRef.current);
      }
    }
    const activeOwnedWorker = ownedWorkerRef.current;
    setOwnedWorker(activeOwnedWorker);

    return () => {
      ownedWorkerCleanupTimerRef.current = setTimeout(() => {
        if (ownedWorkerRef.current !== activeOwnedWorker) return;
        activeOwnedWorker?.terminate();
        ownedWorkerRef.current = null;
        ownedWorkerCleanupTimerRef.current = null;
      }, 0);
    };
  }, [workerClient]);

  const clearVerifiedResults = useCallback(() => {
    if (verifiedUrlRef.current) URL.revokeObjectURL(verifiedUrlRef.current);
    if (legacyUrlRef.current) URL.revokeObjectURL(legacyUrlRef.current);
    verifiedUrlRef.current = null;
    legacyUrlRef.current = null;
    setVerifiedResult(null);
    setLegacyResult(null);
  }, []);

  const replaceVideoUrl = useCallback((nextUrl = "") => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = nextUrl || null;
    setVideoUrl(nextUrl);
  }, []);

  const isCurrentReceive = useCallback((generation) => (
    mountedRef.current && receiveGenerationRef.current === generation
  ), []);

  const handleColorFrame = useCallback(async ({ frame } = {}, expectedGeneration) => {
    const generation = expectedGeneration ?? receiveGenerationRef.current;
    const receiveSession = receiveSessionRef.current;
    if (!frame || !isCurrentReceive(generation)) return;
    const accepted = receiveSession.accept(frame);
    if (!isCurrentReceive(generation)) return;
    setReceiveProgress(receiveSession.progress());
    if (!accepted.accepted || receiveSession.getState() !== "complete") return;

    setReceiveStatus("verifying");
    setReceiveError("");
    try {
      const assembled = await receiveSession.assemble();
      if (!isCurrentReceive(generation)) return;
      if (!assembled) {
        setReceiveStatus("collecting");
        return;
      }
      const opened = await openColorPackageV2(assembled.bytes, {
        expectedTransferId: assembled.metadata.transferId,
      });
      if (!isCurrentReceive(generation)) return;
      if (verifiedUrlRef.current) URL.revokeObjectURL(verifiedUrlRef.current);
      const url = URL.createObjectURL(new Blob([opened.payload], {
        type: opened.type || "application/octet-stream",
      }));
      if (!isCurrentReceive(generation)) {
        URL.revokeObjectURL(url);
        return;
      }
      verifiedUrlRef.current = url;
      setVerifiedResult({ url, name: opened.name || "renkli-qr-belgesi.bin" });
      setReceiveStatus("verified");
    } catch (error) {
      if (!isCurrentReceive(generation)) return;
      setReceiveStatus("error");
      setReceiveError(colorErrorMessage(error));
    }
  }, [isCurrentReceive]);

  const scanner = useColorQrScanner({
    enabled: Boolean(colorWorker)
      && activeTab === "receive"
      && receiveMethod === "camera"
      && !verifiedResult,
    paused: receiveStatus === "verifying",
    facingMode,
    sessionId: receiveSessionId,
    workerClient: colorWorker,
    onFrame: handleColorFrame,
  });

  const beginSendPreparation = useCallback(() => {
    sendVideoControllerRef.current?.abort();
    sendVideoControllerRef.current = null;
    const generation = sendGenerationRef.current + 1;
    sendGenerationRef.current = generation;
    const oldSessionId = sendSessionRef.current;
    const nextSessionId = createSessionId();
    sendSessionRef.current = nextSessionId;
    setSendSessionId(nextSessionId);
    setSendInfo(null);
    setOpticalMetadata(null);
    setCompressionStats(null);
    setCurrentSymbolId(0);
    setIsRecordingVideo(false);
    setVideoProgress(null);
    replaceVideoUrl();
    const workerError = workerClient ? null : ownedWorkerErrorRef.current;
    setSendStatus(workerError ? "error" : "preparing");
    setSendError(workerError ? colorErrorMessage(workerError) : "");
    if (oldSessionId) colorWorker?.disposeSession(oldSessionId);
    return { generation, sessionId: nextSessionId, worker: colorWorker };
  }, [colorWorker, replaceVideoUrl, workerClient]);

  const preparePayload = useCallback(async ({ payload, name, type }, operation) => {
    const activeOperation = operation ?? beginSendPreparation();
    const activeWorker = activeOperation.worker;
    if (!activeWorker) {
      if (activeOperation.generation !== sendGenerationRef.current || !mountedRef.current) return;
      setSendStatus("error");
      setSendError(colorErrorMessage(
        workerClient ? null : ownedWorkerErrorRef.current,
      ));
      return;
    }

    try {
      const info = await activeWorker.preparePackage(activeOperation.sessionId, {
        payload,
        name,
        type,
        transferId: createTransferId(),
      });
      if (activeOperation.generation !== sendGenerationRef.current || !mountedRef.current) return;
      setSendInfo(info);
      setCompressionStats(info.compressionStats ?? null);
      setSendStatus("ready");
    } catch (error) {
      if (activeOperation.generation !== sendGenerationRef.current
        || !mountedRef.current
        || error?.code === "STALE_SESSION") return;
      setSendStatus("error");
      setSendError(colorErrorMessage(error));
    }
  }, [beginSendPreparation, workerClient]);

  useEffect(() => {
    if (selectedFile) return;
    const payload = new TextEncoder().encode(inputText || "");
    const operation = beginSendPreparation();
    preparePayload({ payload, name: "metin.txt", type: "text/plain" }, operation);
  }, [beginSendPreparation, inputText, preparePayload, selectedFile]);

  useEffect(() => {
    if (!sendInfo || !canvasRef.current || !colorWorker) return;
    let cancelled = false;
    colorWorker.getFrame(sendSessionId, currentSymbolId).then(({ frameBytes }) => {
      if (cancelled || !canvasRef.current) return;
      const rendered = renderColorMatrixV2(canvasRef.current, frameBytes, {
        cellSize: Math.max(8, cellSize),
      });
      setOpticalMetadata(rendered);
    }).catch((error) => {
      if (!cancelled && error?.code !== "STALE_SESSION") setSendError(colorErrorMessage(error));
    });
    return () => { cancelled = true; };
  }, [cellSize, colorWorker, currentSymbolId, sendInfo, sendSessionId]);

  useEffect(() => {
    if (!isAnimatingStream || !sendInfo || sendInfo.emittedSymbols <= 1) return undefined;
    const timer = setInterval(() => {
      setCurrentSymbolId((current) => (current + 1) % sendInfo.emittedSymbols);
    }, 140);
    return () => clearInterval(timer);
  }, [isAnimatingStream, sendInfo]);

  useEffect(() => {
    const lifecycleToken = lifecycleTokenRef.current + 1;
    lifecycleTokenRef.current = lifecycleToken;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sendGenerationRef.current += 1;
      receiveGenerationRef.current += 1;
      const sendSession = sendSessionRef.current;
      const receiveSession = receiveSessionIdRef.current;
      const activeWorker = colorWorker;
      receiveVideoControllerRef.current?.abort();
      sendVideoControllerRef.current?.abort();
      setTimeout(() => {
        if (lifecycleTokenRef.current !== lifecycleToken) return;
        if (sendSession) activeWorker?.disposeSession(sendSession);
        if (receiveSession) activeWorker?.disposeSession(receiveSession);
        if (verifiedUrlRef.current) URL.revokeObjectURL(verifiedUrlRef.current);
        if (legacyUrlRef.current) URL.revokeObjectURL(legacyUrlRef.current);
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        verifiedUrlRef.current = null;
        legacyUrlRef.current = null;
        videoUrlRef.current = null;
      }, 0);
    };
  }, [colorWorker]);

  async function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const operation = beginSendPreparation();
    setSelectedFile(file);
    const payload = new Uint8Array(await file.arrayBuffer());
    if (operation.generation !== sendGenerationRef.current || !mountedRef.current) return;
    await preparePayload({ payload, name: file.name, type: file.type }, operation);
  }

  async function renderPrimarySymbol() {
    if (!singleImageAllowed || !canvasRef.current) return false;
    const { frameBytes } = await colorWorker.getFrame(sendSessionId, 0);
    const rendered = renderColorMatrixV2(canvasRef.current, frameBytes, {
      cellSize: Math.max(8, cellSize),
    });
    setCurrentSymbolId(0);
    setOpticalMetadata(rendered);
    return true;
  }

  async function handleDownloadQrImage() {
    if (!await renderPrimarySymbol()) return;
    const anchor = document.createElement("a");
    anchor.href = canvasRef.current.toDataURL("image/png");
    anchor.download = `renkli-qr-${selectedFile?.name || "veri"}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function handleShareQrImage() {
    if (!await renderPrimarySymbol()) return;
    const blob = await canvasToBlob(canvasRef.current);
    if (!blob) return;
    const file = new File([blob], "renkli-qr.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Renkli QR Kodu", files: [file] });
      } else {
        await handleDownloadQrImage();
      }
    } catch (error) {
      if (error?.name !== "AbortError") setNotification("Paylaşım tamamlanamadı.");
    }
  }

  async function handleCopyQrImage() {
    if (!await renderPrimarySymbol()) return;
    const blob = await canvasToBlob(canvasRef.current);
    if (!blob || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setNotification("Panoya kopyalama bu tarayıcıda desteklenmiyor.");
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNotification("QR görseli panoya kopyalandı!");
    } catch {
      setNotification("Panoya kopyalama tamamlanamadı.");
    }
  }

  async function handleCreateColorVideo() {
    if (!colorWorker || sendStatus !== "ready" || !sendInfo || isRecordingVideo) return;
    const generation = sendGenerationRef.current;
    const sessionId = sendSessionRef.current;
    sendVideoControllerRef.current?.abort();
    const controller = new AbortController();
    sendVideoControllerRef.current = controller;
    setIsRecordingVideo(true);
    setVideoProgress({ stage: "recording", percent: 0 });
    setSendError("");

    try {
      const recorded = await recordPreparedColorSession({
        client: colorWorker,
        sessionId,
        optical: sendInfo,
        options: { profile: getOpticalProfile("color_balanced"), signal: controller.signal },
        onProgress: (nextProgress) => {
          if (mountedRef.current && sendGenerationRef.current === generation) {
            setVideoProgress(nextProgress);
          }
        },
      });
      if (!mountedRef.current || sendGenerationRef.current !== generation) return;
      const nextUrl = URL.createObjectURL(recorded.blob);
      if (!mountedRef.current || sendGenerationRef.current !== generation) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      setVideoMimeType(recorded.mimeType || recorded.blob.type || "video/webm");
      replaceVideoUrl(nextUrl);
    } catch (error) {
      if (error?.code !== "ABORTED"
        && mountedRef.current && sendGenerationRef.current === generation) {
        setSendError(colorErrorMessage(error));
      }
    } finally {
      if (sendVideoControllerRef.current === controller) {
        sendVideoControllerRef.current = null;
      }
      if (mountedRef.current && sendGenerationRef.current === generation) {
        setIsRecordingVideo(false);
      }
    }
  }

  async function handleTakeSnapshotAndScan() {
    const generation = receiveGenerationRef.current;
    setIsSnapshotScanning(true);
    try {
      const decoded = await scanner.scanSnapshot();
      if (!isCurrentReceive(generation)) return;
      if (!decoded) setNotification("Fotoğraftan Renkli QR okunamadı.");
    } catch (error) {
      if (isCurrentReceive(generation)) setNotification(colorErrorMessage(error));
    } finally {
      if (isCurrentReceive(generation)) setIsSnapshotScanning(false);
    }
  }

  function beginReceiveOperation(nextSessionId = createSessionId()) {
    const generation = receiveGenerationRef.current + 1;
    receiveGenerationRef.current = generation;
    const oldSessionId = receiveSessionIdRef.current;
    receiveVideoControllerRef.current?.abort();
    receiveVideoControllerRef.current = null;
    if (oldSessionId) colorWorker?.disposeSession(oldSessionId);
    receiveSessionRef.current = createColorReceiveSession();
    receiveSessionIdRef.current = nextSessionId;
    setReceiveSessionId(nextSessionId);
    clearVerifiedResults();
    setReceiveProgress(EMPTY_PROGRESS);
    setReceiveStatus("idle");
    setReceiveError("");
    setIsDecodingReceiveFile(false);
    setIsSnapshotScanning(false);
    return { generation, sessionId: nextSessionId };
  }

  function handleActiveTabChange(nextTab) {
    if (nextTab === activeTab) return;
    beginReceiveOperation();
    setActiveTab(nextTab);
    setReceiveFile(null);
    setNotification("");
  }

  function handleReceiveMethodChange(nextMethod) {
    if (nextMethod === receiveMethod) return;
    beginReceiveOperation();
    setReceiveMethod(nextMethod);
    setReceiveFile(null);
    setNotification("");
  }

  async function handleReceiveFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const operation = beginReceiveOperation(
      isVideo ? `lab-video:${createSessionId()}` : createSessionId(),
    );
    setReceiveFile(file);

    if (isVideo) {
      await handleReceiveVideo(file, operation);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setReceiveError("Lütfen bir PNG veya JPG görseli seçin.");
      return;
    }

    setIsDecodingReceiveFile(true);
    setReceiveStatus("scanning");
    setNotification("");
    let imageUrl = "";
    try {
      const image = new Image();
      imageUrl = URL.createObjectURL(file);
      image.src = imageUrl;
      await image.decode();
      if (!isCurrentReceive(operation.generation)) return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Görsel tuvali hazırlanamadı.");
      context.imageSmoothingEnabled = false;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = await colorWorker.decodeImage(operation.sessionId, imageData);
      if (!isCurrentReceive(operation.generation)) return;
      if (decoded?.frame) {
        await handleColorFrame(decoded, operation.generation);
      } else {
        handleLegacyImage(canvas, operation.generation);
      }
    } catch (error) {
      if (!isCurrentReceive(operation.generation)) return;
      setReceiveStatus("error");
      setReceiveError(colorErrorMessage(error));
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (isCurrentReceive(operation.generation)) setIsDecodingReceiveFile(false);
    }
  }

  async function handleReceiveVideo(file, operation) {
    const controller = new AbortController();
    receiveVideoControllerRef.current = controller;
    setIsDecodingReceiveFile(true);
    setReceiveStatus("scanning");
    setNotification("");

    try {
      const containerBytes = await decodeColorQrVideo(
        file,
        {
          onProgress: (nextProgress) => {
            if (!isCurrentReceive(operation.generation)) return;
            setReceiveProgress({ ...EMPTY_PROGRESS, ...nextProgress });
          },
        },
        controller.signal,
        {
          workerClient: colorWorker,
          sessionId: operation.sessionId,
        },
      );
      if (!isCurrentReceive(operation.generation)) return;
      setReceiveStatus("verifying");
      const opened = await openColorPackageV2(containerBytes);
      if (!isCurrentReceive(operation.generation)) return;
      const result = createDownloadResult(opened);
      if (!isCurrentReceive(operation.generation)) {
        URL.revokeObjectURL(result.url);
        return;
      }
      verifiedUrlRef.current = result.url;
      setVerifiedResult(result);
      setReceiveStatus("verified");
    } catch (error) {
      if (!isCurrentReceive(operation.generation) || error?.code === "ABORTED") return;
      setReceiveStatus("error");
      setReceiveError(colorErrorMessage(error));
    } finally {
      colorWorker?.disposeSession(operation.sessionId);
      if (receiveVideoControllerRef.current === controller) {
        receiveVideoControllerRef.current = null;
      }
      if (isCurrentReceive(operation.generation)) setIsDecodingReceiveFile(false);
    }
  }

  function handleLegacyImage(canvas, generation) {
    if (!isCurrentReceive(generation)) return;
    const scan = autoScanColorQrFromCanvas(canvas);
    if (scan?.status !== "SUCCESS" || !scan.bytes?.length) {
      setReceiveStatus("error");
      setReceiveError("Görselde geçerli bir renkli QR bulunamadı.");
      return;
    }
    const legacy = decodeColorQrPackage(scan.bytes);
    if (legacy.v !== "CQF1") {
      setReceiveStatus("error");
      setReceiveError("Görselde desteklenen bir renkli QR bulunamadı.");
      return;
    }
    if ((legacy.totalFrames ?? 1) > 1) {
      setReceiveStatus("error");
      setReceiveError("Eski çok kareli CQF1 aktarımı güvenli biçimde otomatik birleştirilemez.");
      return;
    }

    if (legacyUrlRef.current) URL.revokeObjectURL(legacyUrlRef.current);
    const url = URL.createObjectURL(new Blob([legacy.payload], {
      type: legacy.type || "application/octet-stream",
    }));
    if (!isCurrentReceive(generation)) {
      URL.revokeObjectURL(url);
      return;
    }
    legacyUrlRef.current = url;
    setLegacyResult({ url, name: legacy.name || "eski-renkli-qr-belgesi.bin" });
    setReceiveStatus("legacy");
  }

  function resetReceive() {
    beginReceiveOperation();
    setReceiveFile(null);
    setNotification("");
  }

  const singleImageAllowed = sendStatus === "ready" && sendInfo?.sourceCount === 1;
  const displayedSendError = sendError || (
    !workerClient && ownedWorkerError ? colorErrorMessage(ownedWorkerError) : ""
  );
  const repairCount = Math.max(0, (sendInfo?.emittedSymbols ?? 0) - (sendInfo?.sourceCount ?? 0));
  const progressPercent = receiveProgress.sourceCount
    ? Math.min(100, Math.round((receiveProgress.solved / receiveProgress.sourceCount) * 100))
    : 0;

  return (
    <div className="transfer-page">
      <SiteNavbar homeIcon />
      <main className="transfer-main">
        <div className="transfer-intro">
          <span className="eyebrow">Renkli QR (Color Matrix) Laboratuvarı</span>
          <p>
            4-Renk (2 Bit/Piksel) optik QR matrisi ile belgelerinizi orijinal uzantısıyla kodlayın, indirin veya kamera ile tarayıp çözün.
          </p>
        </div>

        <section className="transfer-shell">
          <nav className="tabs" aria-label="Renkli QR işlemi">
            <button type="button" className={`tab ${activeTab === "send" ? "active" : ""}`} onClick={() => handleActiveTabChange("send")}>Gönder</button>
            <button type="button" className={`tab ${activeTab === "receive" ? "active" : ""}`} onClick={() => handleActiveTabChange("receive")}>Al</button>
          </nav>

          {activeTab === "send" && (
            <div className="panel">
              {selectedFile ? (
                <div className="dropzone compact">
                  <span className="dropzone-title">{selectedFile.name}</span>
                  <span className="dropzone-sub">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                  <label className="btn-ghost color-file-reselect">
                    Farklı dosya seç
                    <input type="file" aria-label="Renkli QR ile gönderilecek belge" onChange={handleFileSelect} />
                  </label>
                </div>
              ) : (
                <label className="dropzone">
                  <span className="dropzone-title">Göndermek için belge seçin</span>
                  <span className="dropzone-sub">Resim (JPG, PNG), PDF, Belge veya Metin dosyası</span>
                  <input type="file" aria-label="Renkli QR ile gönderilecek belge" onChange={handleFileSelect} />
                </label>
              )}

              {!selectedFile && (
                <label className="field">
                  <span>Alternatif: Test Metni</span>
                  <textarea value={inputText} onChange={(event) => setInputText(event.target.value)} rows={3} />
                </label>
              )}

              <label className="field">
                <span>Piksel Hücre Boyutu: {cellSize}px</span>
                <input type="range" min={8} max={16} value={cellSize} onChange={(event) => setCellSize(Number(event.target.value))} />
              </label>

              <div className="qr-canvas color-qr-preview">
                {sendInfo?.emittedSymbols > 1 && (
                  <span className="color-frame-badge">Akış karesi {currentSymbolId + 1} / {sendInfo.emittedSymbols}</span>
                )}
                <canvas ref={canvasRef} />
              </div>

              {sendInfo?.emittedSymbols > 1 && (
                <button type="button" className="btn-ghost color-stream-toggle" onClick={() => setIsAnimatingStream((current) => !current)}>
                  {isAnimatingStream ? "Ekran akışını duraklat" : "Ekranda canlı akışı başlat"}
                </button>
              )}

              <div className="meta" aria-live="polite">
                <div className="meta-row">
                  <span className="meta-label">Sıkıştırma:</span>
                  <span className="meta-value mono">
                    {compressionStats ? `%${compressionStats.savedPercent} daha küçük` : sendStatus === "preparing" ? "Hazırlanıyor..." : "—"}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Aktarım sembolleri:</span>
                  <span className="meta-value mono">
                    {sendInfo ? `${sendInfo.sourceCount} ana sembol · ${repairCount} kurtarma sembolü` : "—"}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Grid kenarı:</span>
                  <span className="meta-value mono">
                    {opticalMetadata ? `${opticalMetadata.dimension} × ${opticalMetadata.dimension} hücre` : "—"}
                  </span>
                </div>
              </div>

              {sendInfo?.sourceCount > 1 && (
                <p className="warning">Bu belge birden fazla renkli kare gerektiriyor; video veya canlı akış kullanın.</p>
              )}
              {displayedSendError && <p className="error" role="alert">{displayedSendError}</p>}

              <div className="actions">
                <button type="button" className="btn-solid" disabled={!singleImageAllowed} onClick={handleDownloadQrImage}>Görsel indir (PNG)</button>
                <button
                  type="button"
                  className="btn-solid"
                  aria-describedby="color-video-note"
                  disabled={sendStatus !== "ready" || !colorWorker || isRecordingVideo}
                  onClick={handleCreateColorVideo}
                >
                  {isRecordingVideo ? "QR videosu hazırlanıyor..." : "QR videosu oluştur"}
                </button>
                <button type="button" className="btn-ghost" disabled={!singleImageAllowed} onClick={handleShareQrImage}>Cihazda paylaş</button>
                <button type="button" className="btn-ghost" disabled={!singleImageAllowed} onClick={handleCopyQrImage}>Panoya kopyala</button>
              </div>
              <p id="color-video-note" className="hint">
                {videoProgress
                  ? `Renkli video kaydı: %${Math.round(videoProgress.percent ?? 0)}`
                  : "Hazırlanan renkli QR karelerini WebM veya MP4 video olarak kaydeder."}
              </p>
              {videoUrl && (
                <div className="color-video-result">
                  <video src={videoUrl} controls playsInline aria-label="Laboratuvar renkli QR video önizlemesi" />
                  <a
                    className="btn-solid"
                    href={videoUrl}
                    download={`renkli-qr.${videoMimeType.includes("mp4") ? "mp4" : "webm"}`}
                  >
                    Renkli QR videosunu indir
                  </a>
                </div>
              )}
              {notification && <p className="hint" role="status">{notification}</p>}
            </div>
          )}

          {activeTab === "receive" && (
            <div className="panel">
              {verifiedResult ? (
                <div className="result">
                  <span className="dropzone-title">Belge tamamlandı.</span>
                  <span className="meta-value mono">{verifiedResult.name}</span>
                  <p className="hint">Bütünlük doğrulandı. İndirmeyi siz başlatabilirsiniz.</p>
                  <a className="btn-solid" href={verifiedResult.url} download={verifiedResult.name}>Dosyayı aç / indir</a>
                  <button type="button" className="btn-ghost" onClick={resetReceive}>Yeni aktarım</button>
                </div>
              ) : (
                <>
                  <div className="receive-method-selector">
                    <button type="button" className={`receive-method ${receiveMethod === "camera" ? "active" : ""}`} onClick={() => handleReceiveMethodChange("camera")}>
                      <span className="method-title">Kameradan tara</span>
                      <span className="method-description">Kamerayı açarak ekrandaki Renkli QR kodunu okutun</span>
                    </button>
                    <button type="button" className={`receive-method ${receiveMethod === "file" ? "active" : ""}`} onClick={() => handleReceiveMethodChange("file")}>
                      <span className="method-title">QR görsel/video yükle</span>
                      <span className="method-description">Size gönderilen Renkli QR görselini seçin</span>
                    </button>
                  </div>

                  {receiveMethod === "camera" && (
                    <div className="camera-scan-container">
                      <div className="video-frame">
                        {scanner.error ? (
                          <div className="camera-error-card">
                            <div className="error-title">Kamera açılamadı</div>
                            <p className="error-desc">{scanner.error}</p>
                            <button type="button" className="btn-solid" onClick={scanner.restartCamera}>Kamerayı yeniden başlat</button>
                          </div>
                        ) : (
                          <>
                            <video ref={scanner.videoRef} autoPlay playsInline muted className="video" />
                            <div className="scanner-overlay">
                              <div className="scanner-target" />
                              <span className="scanner-hint">Renkli QR kodunu kutuya getirin</span>
                            </div>
                            <div className="scan-live-badge">
                              <span className={`status-dot ${receiveStatus}`} />
                              <span className="badge-text">{receiveStatus === "verifying" ? "Doğrulanıyor" : "Canlı tarama"}</span>
                              <span className="frame-count">%{progressPercent}</span>
                            </div>
                          </>
                        )}
                        <button type="button" className="camera-switch" onClick={() => setFacingMode((mode) => mode === "environment" ? "user" : "environment")} title="Kamerayı değiştir" aria-label="Kamerayı değiştir">↻</button>
                      </div>
                      <div className="scan-progress-box" aria-live="polite">
                        <div className="scan-message">
                          {receiveProgress.sourceCount
                            ? `${receiveProgress.solved}/${receiveProgress.sourceCount} ana sembol çözüldü; ${receiveProgress.accepted} kare kabul edildi.`
                            : "Kamera aktif, CRF2 renkli QR bekleniyor..."}
                        </div>
                      </div>
                      <div className="scan-actions-row">
                        <button type="button" className="btn-solid btn-snapshot" onClick={handleTakeSnapshotAndScan} disabled={isSnapshotScanning}>
                          {isSnapshotScanning ? "Fotoğraf analiz ediliyor..." : "Fotoğraf Çek ve Tara"}
                        </button>
                      </div>
                    </div>
                  )}

                  {receiveMethod === "file" && (
                    <>
                      <label className="dropzone">
                        <span className="dropzone-title">{isDecodingReceiveFile ? "Çözülüyor..." : "QR Video veya Görsel Yükle"}</span>
                        <span className="dropzone-sub">{receiveFile ? receiveFile.name : ".png, .jpg, .webm veya .mp4 dosyası seçin"}</span>
                        <input type="file" accept="video/*,image/*" aria-label="Renkli QR görseli veya videosu" onChange={handleReceiveFileSelect} />
                      </label>
                      {isDecodingReceiveFile && receiveProgress.sourceCount > 0 && (
                        <p className="hint" aria-live="polite">
                          {receiveProgress.solved}/{receiveProgress.sourceCount} ana sembol çözüldü.
                        </p>
                      )}
                    </>
                  )}

                  {legacyResult && (
                    <div className="received-package">
                      <p className="warning">Bu tek kare CQF1 eski biçimidir ve yeni bütünlük doğrulamasını içermez.</p>
                      <a className="btn-ghost" href={legacyResult.url} download={legacyResult.name}>Eski biçim doğrulanamadı; dosyayı elle indir</a>
                    </div>
                  )}
                  {receiveError && <p className="error" role="alert">{receiveError}</p>}
                  {notification && <p className="hint" role="status">{notification}</p>}

                  <div className="receive-tip">
                    <span className="receive-tip-title">Nasıl çalışır?</span>
                    <span className="receive-tip-text">Yeni alım oturumu kareleri aktarım kimliğine göre ayırır; belge yalnız bütünlük kontrolünden sonra sunulur.</span>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function createSessionId() {
  return globalThis.crypto?.randomUUID?.() ?? `color-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeWorkerError(error) {
  if (error?.code === "COLOR_UNSUPPORTED") return error;
  return Object.assign(
    new Error("Bu tarayıcı renkli QR işlemlerini desteklemiyor."),
    { code: "COLOR_UNSUPPORTED" },
  );
}

function colorErrorMessage(error) {
  if (error?.code === "COLOR_UNSUPPORTED") {
    return "Bu tarayıcı renkli QR işlemlerini desteklemiyor.";
  }
  if (error?.code === "CONTAINER_HASH_MISMATCH") {
    return "Belge bütünlük kontrolünü geçemedi; dosya indirmeye açılmadı.";
  }
  if (error?.code === "TRANSFER_MISMATCH") {
    return "Okunan kareler farklı bir aktarıma ait.";
  }
  if (error?.code === "FILE_TOO_LARGE") {
    return "Belge renkli QR sınırını aşıyor.";
  }
  return error?.message || "Renkli QR işlemi tamamlanamadı.";
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function createDownloadResult(opened) {
  const url = URL.createObjectURL(new Blob([opened.payload], {
    type: opened.type || "application/octet-stream",
  }));
  return { url, name: opened.name || "renkli-qr-belgesi.bin" };
}
