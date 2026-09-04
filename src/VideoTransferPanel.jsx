import { useEffect, useRef, useState } from "react";
import { decryptContainer } from "./crypto/encrypted-container.js";
import { readFileAsArrayBuffer, sha256Base64Url } from "./protocol/hash.js";
import {
  getTotalFileSize,
  prepareTransferFile,
  validateBatchFiles,
  VIDEO_BATCH_MAX_BYTES,
} from "./transfer/batch-files.js";
import { validateTransferSelection } from "./transfer/usage-policy.js";
import {
  completeTransferActivity,
  reserveTransferActivity,
} from "./transfer/activity-client.js";
import { createQrVideo } from "./video/create-qr-video.js";
import { COLOR_VIDEO_MAIN_ENABLED, getOpticalProfile } from "./optical/profiles.js";
import { decodeQrVideo } from "./video/decode-qr-video.js";
import { VIDEO_OPTIONS } from "./video/frame-schedule.js";
import { estimateOpticalVideo, OPTICAL_PROFILES } from "./optical/profiles.js";
import { createQrVideoRecoveryStore } from "./video/qr-video-recovery-store.js";
import { shareFile } from "./transfer/native-share.js";

const COPY_ERROR = "Anahtar panoya kopyalanamadı. Lütfen izinleri kontrol edin.";

const CREATE_STAGES = [
  ["encrypting", "Şifreleme"],
  ["encoding", "Kurtarma parçaları"],
  ["preparing", "QR kareleri hazırlanıyor…"],
  ["recording", "Video kaydediliyor…"],
  ["complete", "Tamamlandı"],
];

const PROFILE_DESCRIPTIONS = Object.freeze({
  balanced: "Daha hızlı · iki standart QR",
  compatible: "Daha geniş cihaz uyumu · tek standart QR",
  color_balanced: "Gerçek dört renkli matris · deneysel cihaz uyumu",
});

const COLOR_CREATE_STAGE = ["compressing", "Sıkıştırma"];

function getCompressionMessage(result) {
  if (!result?.isColor || !result.compressionStats) return null;
  return result.compressionStats.savedPercent > 0
    ? `Renkli QR verisi %${result.compressionStats.savedPercent} küçültüldü`
    : "Dosya zaten sıkıştırılmış; özgün boyut korundu";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getTimeStr() {
  return new Date().toLocaleTimeString("tr-TR");
}

function startDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function VideoTransferPanel({
  view = "both",
  user,
  recoveryStore: providedRecoveryStore,
  colorVideoMainEnabled = COLOR_VIDEO_MAIN_ENABLED,
}) {
  const policyUser = user === undefined ? { id: "component" } : user;
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);
  const [sha, setSha] = useState("");
  const [isShaCalculating, setIsShaCalculating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [createError, setCreateError] = useState("");
  const [videoResult, setVideoResult] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [logs, setLogs] = useState([]);
  const [profileId, setProfileId] = useState("balanced");
  const [createStage, setCreateStage] = useState("idle");
  const [keySafetyConfirmed, setKeySafetyConfirmed] = useState(false);
  const [recoveryRecords, setRecoveryRecords] = useState([]);
  const [activeRecoveryRecord, setActiveRecoveryRecord] = useState(null);
  const [recoveryWarning, setRecoveryWarning] = useState("");

  const [decodeFile, setDecodeFile] = useState(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [scanPercent, setScanPercent] = useState(0);
  const [decodeProgress, setDecodeProgress] = useState({ collected: 0, total: 0 });
  const [decodeElapsedSeconds, setDecodeElapsedSeconds] = useState(0);
  const [decodedPackageBytes, setDecodedPackageBytes] = useState(null);
  const [videoKeyText, setVideoKeyText] = useState("");
  const [openedResult, setOpenedResult] = useState(null);
  const [openedUrl, setOpenedUrl] = useState("");
  const [openError, setOpenError] = useState("");
  const [isOpening, setIsOpening] = useState(false);

  const videoUrlRef = useRef("");
  const openedUrlRef = useRef("");
  const shareFileObjRef = useRef(null);
  const mountedRef = useRef(false);
  const fileVersionRef = useRef(0);
  const decodeVersionRef = useRef(0);
  const decodeControllerRef = useRef(null);
  const decodeTimerRef = useRef(null);
  const openGenerationRef = useRef(0);
  const createControllerRef = useRef(null);
  const recoveryStoreRef = useRef(null);
  if (!recoveryStoreRef.current) {
    recoveryStoreRef.current = providedRecoveryStore ?? createQrVideoRecoveryStore();
  }

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      openGenerationRef.current += 1;
      decodeControllerRef.current?.abort();
      stopDecodeTimer();
      createControllerRef.current?.abort();
      revokeVideoUrl();
      revokeOpenedUrl();
    };
  }, []);

  useEffect(() => {
    let active = true;
    recoveryStoreRef.current.list()
      .then((records) => { if (active) setRecoveryRecords(records); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  function addLog(msg) {
    setLogs((prev) => [...prev, `[${getTimeStr()}] ${msg}`]);
  }

  function revokeVideoUrl() {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = "";
    }
    setVideoUrl("");
  }

  function revokeOpenedUrl() {
    if (openedUrlRef.current) {
      URL.revokeObjectURL(openedUrlRef.current);
      openedUrlRef.current = "";
    }
    setOpenedUrl("");
  }

  function stopDecodeTimer() {
    if (decodeTimerRef.current !== null) {
      clearInterval(decodeTimerRef.current);
      decodeTimerRef.current = null;
    }
  }

  function startDecodeTimer(version) {
    stopDecodeTimer();
    setDecodeElapsedSeconds(0);
    decodeTimerRef.current = setInterval(() => {
      if (mountedRef.current && decodeVersionRef.current === version) {
        setDecodeElapsedSeconds((seconds) => seconds + 1);
      }
    }, 1_000);
  }

  function handleFileSelect(event) {
    selectFiles(Array.from(event.target.files ?? []));
  }

  function removeFile(indexToRemove) {
    selectFiles(files.filter((_, index) => index !== indexToRemove));
  }

  async function selectFiles(selectedFiles) {
    createControllerRef.current?.abort();
    createControllerRef.current = null;
    const version = fileVersionRef.current + 1;
    fileVersionRef.current = version;

    setFiles([]);
    setFile(null);
    setSha("");
    setIsShaCalculating(false);
    setCreateError("");
    setVideoResult(null);
    setCopyStatus("");
    setProgress(0);
    setCreateStage("idle");
    setKeySafetyConfirmed(false);
    setIsCreating(false);
    setLogs([]);
    revokeVideoUrl();

    if (selectedFiles.length === 0) return;

    try {
      validateTransferSelection(selectedFiles, { method: "qr_video", user: policyUser });
      validateBatchFiles(selectedFiles);
    } catch (error) {
      setCreateError(errorMessage(error, "Dosyalar seçilemedi."));
      return;
    }

    setFiles(selectedFiles);
    const totalSize = getTotalFileSize(selectedFiles);
    if (totalSize > VIDEO_BATCH_MAX_BYTES) return;
    setIsShaCalculating(true);

    setLogs([
      `[${getTimeStr()}] ${selectedFiles.length} dosya seçildi (${formatSize(totalSize)}).`,
      `[${getTimeStr()}] Adım 1/3: Aktarım dosyası hazırlanıyor...`,
    ]);

    try {
      const preparedFile = await prepareTransferFile(selectedFiles);
      if (!mountedRef.current || fileVersionRef.current !== version) return;
      setFile(preparedFile);
      addLog(
        selectedFiles.length > 1
          ? "Adım 1/3: Dosyalar ZIP arşivinde birleştirildi."
          : "Adım 1/3: Dosya hazırlandı.",
      );
      addLog("Adım 2/3: Dosya içeriği belleğe yükleniyor...");

      const arrayBuf = await readFileAsArrayBuffer(preparedFile);
      addLog("Adım 2/3: Dosya içeriği okundu.");
      addLog("Adım 3/3: SHA-256 bütünlük özeti hesaplanıyor...");

      const calculatedSha = await sha256Base64Url(new Uint8Array(arrayBuf));
      if (mountedRef.current && fileVersionRef.current === version) {
        setSha(calculatedSha);
        addLog(`Adım 3/3: SHA-256 tamamlandı (${calculatedSha.substring(0, 16)}...)`);
        addLog("Hazır! 'QR video oluştur' butonuna basabilirsiniz.");
      }
    } catch (error) {
      if (mountedRef.current && fileVersionRef.current === version) {
        const msg = errorMessage(error, "Dosya özeti hesaplanamadı.");
        setCreateError(msg);
        addLog(`HATA: ${msg}`);
      }
    } finally {
      if (mountedRef.current && fileVersionRef.current === version) {
        setIsShaCalculating(false);
      }
    }
  }

  const totalSize = getTotalFileSize(files);
  const isTooLarge = totalSize > VIDEO_BATCH_MAX_BYTES;
  const estimatedInputSize = file?.size ?? totalSize;
  const isWarningSize = estimatedInputSize > VIDEO_OPTIONS.warningBytes && !isTooLarge;
  const estimate = estimatedInputSize
    ? estimateOpticalVideo({ byteLength: estimatedInputSize + 512, profileId })
    : null;
  const estimatedSeconds = estimate?.durationSeconds ?? 0;
  const createStages = profileId === "color_balanced"
    ? [COLOR_CREATE_STAGE, ...CREATE_STAGES]
    : CREATE_STAGES;
  const compressionMessage = getCompressionMessage(videoResult);

  async function handleCreateVideo() {
    if (!file || !sha || isShaCalculating || isTooLarge || !keySafetyConfirmed) return;

    setIsCreating(true);
    setCreateError("");
    setCopyStatus("");
    setVideoResult(null);
    setProgress(0);
    setCreateStage("encrypting");
    revokeVideoUrl();

    const currentVersion = fileVersionRef.current;
    createControllerRef.current?.abort();
    const createController = new AbortController();
    createControllerRef.current = createController;
    const startedAt = new Date();
    let reservation = null;
    addLog("QR video akışı başlatılıyor...");
    addLog("AES-256-GCM ile şifreleniyor ve QR kareleri çiziliyor...");

    try {
      reservation = await reserveTransferActivity({
        user, method: "qr_video", files, startedAt,
      });
      const profile = getOpticalProfile(profileId);
      const result = await createQrVideo(file, {
        ...VIDEO_OPTIONS,
        profileId,
        signal: createController.signal,
        holdFrames: profile.holdFrames ?? 1,
        recoveryStore: recoveryStoreRef.current,
        onRecoveryWarning: () => setRecoveryWarning(
          "Yarım kalan işlem bu cihazda saklanamadı; aktarım yine devam ediyor.",
        ),
        onPerformanceWarning: () => setRecoveryWarning(
          "Bu cihazda paralel QR hazırlama kullanılamadı; video daha yavaş hazırlanabilir.",
        ),
      }, (nextProgress) => {
        if (mountedRef.current && fileVersionRef.current === currentVersion) {
          setCreateStage(nextProgress.stage);
          setProgress(Math.round(nextProgress.percent));
        }
      });

      if (!mountedRef.current || fileVersionRef.current !== currentVersion) {
        await completeTransferActivity({
          user, reservationId: reservation?.id, status: "failed", completedAt: new Date(),
        });
        return;
      }

      const finalized = await completeTransferActivity({
        user, reservationId: reservation?.id, status: "completed", completedAt: new Date(),
      });
      if (!mountedRef.current || fileVersionRef.current !== currentVersion) return;

      const url = URL.createObjectURL(result.blob);
      videoUrlRef.current = url;
      setVideoUrl(url);
      setVideoResult(result);
      setCreateStage("complete");

      const resultExt = result.mimeType?.includes("mp4") ? "mp4" : "webm";
      const resultDownloadName = `belgeaktar-${result.transferId}.${resultExt}`;
      try {
        shareFileObjRef.current = new File([result.blob], resultDownloadName, {
          type: result.mimeType || result.blob.type || "video/webm",
        });
      } catch {
        shareFileObjRef.current = null;
      }
      if (reservation?.id && !finalized) {
        addLog("UYARI: Aylık kullanım kaydı şu anda doğrulanamadı.");
      }
      addLog("BAŞARILI: QR video dosyası oluşturuldu.");
      addLog("Videoyu indirebilir ve anahtarı kopyalayabilirsiniz.");
    } catch (error) {
      try {
        await completeTransferActivity({
          user, reservationId: reservation?.id, status: "failed", completedAt: new Date(),
        });
      } catch {
        // Tamamlanan kayıt güvenceye alınamadıysa ikincil bırakma hatası ana hatayı gölgelememeli.
      }
      if (error?.code !== "ABORTED"
        && mountedRef.current && fileVersionRef.current === currentVersion) {
        const msg = errorMessage(error, "QR video oluşturulamadı.");
        setCreateError(msg);
        addLog(`HATA: ${msg}`);
      }
    } finally {
      if (createControllerRef.current === createController) {
        createControllerRef.current = null;
      }
      if (mountedRef.current && fileVersionRef.current === currentVersion) {
        setIsCreating(false);
      }
    }
  }

  async function copyKey() {
    if (!videoResult?.keyText) return;
    setCopyStatus("");

    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(videoResult.keyText);
      setCopyStatus("Anahtar panoya kopyalandı.");
      addLog("Anahtar panoya kopyalandı. Ayrı kanaldan iletin.");
    } catch {
      setCopyStatus(COPY_ERROR);
      addLog(`HATA: ${COPY_ERROR}`);
    }
  }

  async function shareVideo() {
    if (!videoResult?.blob) return;
    setShareStatus("");

    // Use pre-built File to keep navigator.share() synchronous with user activation
    let fileToShare = shareFileObjRef.current;
    if (!fileToShare) {
      try {
        fileToShare = new File([videoResult.blob], downloadName, {
          type: videoResult.mimeType || videoResult.blob.type || "video/webm",
        });
      } catch {
        setShareStatus("Bu tarayıcıda dosya paylaşımı desteklenmiyor; videoyu indirebilirsin.");
        return;
      }
    }

    try {
      const result = await shareFile({
        file: fileToShare,
        title: "VaultDrop QR Video",
        text: "Şifreli QR Video. Anahtar ayrı iletilecek.",
      });
      if (result.shared) {
        setShareStatus("Telefonun paylaşım menüsü açıldı.");
      } else if (result.reason === "denied") {
        // Activation expired or browser blocked — fall back to download
        if (videoUrl) startDownload(videoUrl, downloadName);
        setShareStatus("Paylaşım menüsü açılamadı; video otomatik indirildi. Dosyayı mesajlaşma uygulamasından belge olarak paylaşabilirsin.");
      } else {
        setShareStatus("Bu tarayıcıda dosya paylaşımı desteklenmiyor; videoyu indirebilirsin.");
      }
    } catch (error) {
      setShareStatus(error.message || "Video paylaşılamadı; videoyu indirebilirsin.");
    }
  }

  function handleDecodeFile(event) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (selectedFile && !/\.(?:mp4|webm)$/i.test(selectedFile.name)) {
      setOpenError("Lütfen MP4 veya WebM biçiminde bir QR video seçin.");
      return;
    }
    selectDecodeFile(selectedFile);
  }

  function handleDecodeDrop(event) {
    event.preventDefault();
    const selectedFile = event.dataTransfer.files?.[0] ?? null;
    if (!selectedFile || !/\.(?:mp4|webm)$/i.test(selectedFile.name)) {
      setOpenError("Lütfen MP4 veya WebM biçiminde bir QR video seçin.");
      return;
    }
    selectDecodeFile(selectedFile);
  }

  function selectDecodeFile(selectedFile) {
    decodeControllerRef.current?.abort();
    decodeVersionRef.current += 1;
    stopDecodeTimer();
    openGenerationRef.current += 1;
    setIsOpening(false);
    setDecodeFile(selectedFile);
    setIsDecoding(false);
    setScanPercent(0);
    setDecodeProgress({ collected: 0, total: 0 });
    setDecodeElapsedSeconds(0);
    setDecodedPackageBytes(null);
    setVideoKeyText("");
    setOpenedResult(null);
    setOpenError("");
    revokeOpenedUrl();
  }

  async function deleteRecoveryRecord(record) {
    try {
      await recoveryStoreRef.current.delete(record.id);
      setRecoveryRecords((records) => records.filter((item) => item.id !== record.id));
      if (activeRecoveryRecord?.id === record.id) setActiveRecoveryRecord(null);
    } catch {
      setRecoveryWarning("Yarım kalan işlem silinemedi.");
    }
  }

  async function handleDecodeVideo() {
    if (!decodeFile) return;
    decodeControllerRef.current?.abort();
    openGenerationRef.current += 1;
    setIsOpening(false);
    const controller = new AbortController();
    decodeControllerRef.current = controller;
    const version = decodeVersionRef.current + 1;
    decodeVersionRef.current = version;
    startDecodeTimer(version);

    setIsDecoding(true);
    setScanPercent(0);
    setOpenError("");
    setDecodedPackageBytes(null);
    setOpenedResult(null);
    revokeOpenedUrl();

    try {
      const bytes = await decodeQrVideo(
        decodeFile,
        {
          onProgress: (nextProgress) => {
            if (mountedRef.current && decodeVersionRef.current === version) {
              setDecodeProgress(nextProgress);
            }
          },
          onScanProgress: ({ percent }) => {
            if (mountedRef.current && decodeVersionRef.current === version) {
              const numericPercent = Number(percent);
              const boundedPercent = Number.isFinite(numericPercent)
                ? Math.min(100, Math.max(0, Math.round(numericPercent)))
                : 0;
              setScanPercent(boundedPercent);
            }
          },
        },
        controller.signal,
        {
          allowColor: false,
          recoveryStore: recoveryStoreRef.current,
          recoveryRecord: activeRecoveryRecord,
          onRecoveryWarning: () => setRecoveryWarning(
            "Tarama ilerlemesi bu cihazda saklanamadı; tarama yine devam ediyor.",
          ),
        },
      );

      if (!mountedRef.current || decodeVersionRef.current !== version) return;
      setDecodedPackageBytes(bytes);
      if (activeRecoveryRecord) {
        setRecoveryRecords((records) => records.filter(
          (record) => record.id !== activeRecoveryRecord.id,
        ));
        setActiveRecoveryRecord(null);
      }
      setOpenError("");
    } catch (error) {
      if (mountedRef.current && decodeVersionRef.current === version) {
        setOpenError(errorMessage(error, "QR video çözülemedi."));
      }
    } finally {
      if (mountedRef.current && decodeVersionRef.current === version) {
        setIsDecoding(false);
        stopDecodeTimer();
      }
    }
  }

  async function handleOpenVideoPackage() {
    if (!decodedPackageBytes || !videoKeyText.trim()) return;
    const generation = openGenerationRef.current + 1;
    openGenerationRef.current = generation;
    const isCurrent = () => mountedRef.current && openGenerationRef.current === generation;

    setIsOpening(true);
    setOpenError("");
    setOpenedResult(null);
    revokeOpenedUrl();

    try {
      const result = await decryptContainer(decodedPackageBytes, videoKeyText.trim());
      if (!isCurrent()) return;
      const url = URL.createObjectURL(result.file);
      if (!isCurrent()) {
        URL.revokeObjectURL(url);
        return;
      }
      openedUrlRef.current = url;
      setOpenedUrl(url);
      setOpenedResult(result);
      startDownload(url, result.file.name);
    } catch (error) {
      if (isCurrent()) {
        setOpenError(errorMessage(error, "Paket açılamadı. Anahtarı kontrol edin."));
      }
    } finally {
      if (isCurrent()) setIsOpening(false);
    }
  }

  const ext = videoResult?.mimeType?.includes("mp4") ? "mp4" : "webm";
  const downloadName = videoResult ? `belgeaktar-${videoResult.transferId}.${ext}` : "";
  const showCreate = view === "both" || view === "create";
  const showOpen = view === "both" || view === "open";
  const recoveredPercent = decodeProgress.total > 0
    ? Math.min(100, Math.round((decodeProgress.collected / decodeProgress.total) * 100))
    : 0;

  const decodeElapsedTime = `${Math.floor(decodeElapsedSeconds / 60)}:${String(
    decodeElapsedSeconds % 60,
  ).padStart(2, "0")}`;

  return (
    <div className="video-transfer">
      {showCreate && (
        <section className="package-section" aria-labelledby="video-create-title">
        <div className="section-heading">
          <h2 id="video-create-title">QR video ile aktarım</h2>
          <p>Şifreli paketi QR karelerinden oluşan bir video olarak kaydedin.</p>
        </div>

        <fieldset className="optical-profile-choice">
          <legend>Video profili</legend>
          {Object.values(OPTICAL_PROFILES).map((profile) => (
            <label
              key={profile.id}
              className={`${profileId === profile.id ? "active" : ""} ${profile.id === "color_balanced" && !colorVideoMainEnabled ? "disabled" : ""}`.trim()}
            >
              <input
                type="radio"
                name="optical-profile"
                value={profile.id}
                checked={profileId === profile.id}
                disabled={profile.id === "color_balanced" && !colorVideoMainEnabled}
                onChange={() => setProfileId(profile.id)}
              />
              <span className="profile-label-row">
                <strong>{profile.id === "color_balanced" ? "Renkli Dengeli" : profile.label}</strong>
                {profile.id === "color_balanced" && (
                  <span className="profile-experimental-badge">Deneysel</span>
                )}
              </span>
              <small>{PROFILE_DESCRIPTIONS[profile.id]}</small>
              {profile.id === "color_balanced" && (
                <span className="profile-recommendation">
                  {colorVideoMainEnabled
                    ? "Gerçek telefon testleri tamamlandı; yine de daha stabil seçenek Dengeli profildir."
                    : "Android ve iPhone kontrollü ışık testleri kaydedilene kadar kapalı. Daha stabil seçenek: Dengeli."}
                </span>
              )}
            </label>
          ))}
        </fieldset>

        <label className="dropzone compact">
          <input
            aria-label="QR video yapılacak belge"
            type="file"
            multiple
            onClick={(event) => {
              event.target.value = "";
            }}
            onChange={handleFileSelect}
            hidden
          />
          <span className="dropzone-title">Dosyaları seç</span>
          <span className="dropzone-sub">En fazla 15 dosya · toplam 15 MiB</span>
        </label>

        <section className="qr-video-send-guide" aria-labelledby="qr-video-send-guide-title">
          <div className="qr-video-send-guide-heading">
            <span className="qr-video-send-guide-icon" aria-hidden="true">↗</span>
            <div>
              <h3 id="qr-video-send-guide-title">QR videoyu doğru gönder</h3>
              <p>WhatsApp veya Telegram'da videoyu medya değil, belge olarak ilet.</p>
            </div>
          </div>

          <div className="qr-video-send-steps" aria-label="QR video gönderme adımları" role="list">
            <div className="qr-video-send-step" role="listitem">
              <span className="qr-video-send-step-number" aria-hidden="true">1</span>
              <strong>QR videoyu oluştur</strong>
            </div>
            <span className="qr-video-send-arrow" aria-hidden="true">→</span>
            <div className="qr-video-send-step" role="listitem">
              <span className="qr-video-send-step-number" aria-hidden="true">2</span>
              <strong>Ataç → Belge / Dosya</strong>
            </div>
            <span className="qr-video-send-arrow" aria-hidden="true">→</span>
            <div className="qr-video-send-step" role="listitem">
              <span className="qr-video-send-step-number" aria-hidden="true">3</span>
              <strong>Alıcı QR videoyu açar</strong>
            </div>
          </div>

          <div className="qr-video-send-choices">
            <div className="qr-video-send-choice is-unsafe">
              <span className="qr-video-send-choice-icon" aria-hidden="true">×</span>
              <div>
                <strong>Galeriden video olarak gönderme</strong>
                <span>Uygulama videoyu küçültebilir; QR kareleri bozulabilir.</span>
              </div>
            </div>
            <div className="qr-video-send-choice is-safe">
              <span className="qr-video-send-choice-icon" aria-hidden="true">✓</span>
              <div>
                <strong>Belge / Dosya olarak gönder</strong>
                <span>QR kareleri olduğu gibi kalır, alıcı videoyu açabilir.</span>
              </div>
            </div>
          </div>

          <p className="qr-video-key-note">
            <span aria-hidden="true">🔑</span>
            Anahtarı video ile aynı mesajda değil, ayrı kanaldan gönder.
          </p>
        </section>

        {files.length > 0 && (
          <div className="meta">
            <div className="meta-row">
              <span className="meta-label">Seçim</span>
              <span className="meta-value mono">{files.length} dosya</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Toplam boyut</span>
              <span className="meta-value mono">{formatSize(totalSize)}</span>
            </div>
            <ul className="batch-file-list" aria-label="Seçilen dosyalar">
              {files.map((selectedFile, index) => (
                <li
                  className="batch-file-item"
                  key={`${selectedFile.name}-${selectedFile.size}-${index}`}
                >
                  <span className="batch-file-name mono">{selectedFile.name}</span>
                  <span className="batch-file-size">{formatSize(selectedFile.size)}</span>
                  <button
                    type="button"
                    className="batch-file-remove"
                    aria-label={`${selectedFile.name} dosyasını kaldır`}
                    onClick={() => removeFile(index)}
                  >
                    Kaldır
                  </button>
                </li>
              ))}
            </ul>
            <div className="meta-row">
              <span className="meta-label">SHA-256</span>
              <span className="meta-value mono breakable">
                {sha ? sha : isShaCalculating ? "Hesaplanıyor..." : "Hesaplanamadı"}
              </span>
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="status-logs-box">
            <div className="status-logs-title">İlerleme adımları</div>
            <ul className="status-logs-list">
              {logs.map((log, idx) => (
                <li key={idx} className="status-log-item">
                  {log}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isTooLarge && (
          <p className="error">
            QR Video için dosyaların toplam boyutu en fazla 15 MiB olabilir. Lütfen "Şifreli Paket" yöntemini kullanın.
          </p>
        )}

        {isWarningSize && (
          <p className="hint" style={{ color: "#e6a23c" }}>
            Tahmini süre: yaklaşık {estimatedSeconds} saniye. Bu süre aylık kullanım kotası değildir.
          </p>
        )}

        {recoveryWarning && <p className="warning">{recoveryWarning}</p>}
        {createError && <p className="error">{createError}</p>}

        <ol
          className={`transfer-stages ${profileId === "color_balanced" ? "color-profile" : ""}`}
          aria-label="QR video oluşturma aşamaları"
        >
          {createStages.map(([id, label]) => (
            <li key={id} className={createStage === id ? "active" : ""}>{label}</li>
          ))}
        </ol>

        <label className="key-safety-confirmation">
          <input
            type="checkbox"
            checked={keySafetyConfirmed}
            onChange={(event) => setKeySafetyConfirmed(event.target.checked)}
          />
          <span>Anahtarı ayrı ve güvenli bir kanalda saklayacağımı onaylıyorum.</span>
        </label>

        <div className="actions">
          <button
            type="button"
            className="btn-solid"
            disabled={!file || !sha || isShaCalculating || isTooLarge || isCreating || !keySafetyConfirmed}
            onClick={handleCreateVideo}
          >
            {isCreating ? `Hazırlanıyor... %${progress}` : "QR video oluştur"}
          </button>
        </div>

        {videoResult && videoUrl && (
          <div className="result video-result-card">
            <div className="video-preview-frame">
              <video
                className="video-preview"
                src={videoUrl}
                controls
                loop
                playsInline
                aria-label="Oluşturulan QR video önizlemesi"
              />
            </div>
            <p className="qr-video-result-reminder">
              <strong>Gönderirken:</strong> Ataç → Belge / Dosya seç. Galeriden video olarak gönderme.
            </p>
            {compressionMessage && <p className="color-compression-result">{compressionMessage}</p>}
            <div className="actions">
              <button type="button" className="btn-solid" onClick={shareVideo}>
                Videoyu paylaş
              </button>
              <a className="btn-solid download-result-action" href={videoUrl} download={downloadName}>
                QR videoyu indir (.{ext})
              </a>
              <button type="button" className="btn-ghost" onClick={copyKey}>
                Anahtarı kopyala
              </button>
            </div>
            {copyStatus && (
              <p className={copyStatus === COPY_ERROR ? "error" : "hint"}>{copyStatus}</p>
            )}
            {shareStatus && <p className="hint">{shareStatus}</p>}
          </div>
        )}
        </section>
      )}

      {showOpen && (
        <section className="package-section" aria-labelledby="video-open-title">
        <div className="section-heading">
          <h2 id="video-open-title">QR videoyu aç</h2>
          <p>Video yalnızca şifreli paketi çıkarır; dosyayı açmak için ayrı anahtar gerekir.</p>
        </div>

        {recoveryRecords.filter((record) => record.direction === "incoming").map((record) => (
          <div className="recovery-notice" key={record.id}>
            <div>
              <strong>Yarım kalan QR taraması</strong>
              <small>{record.symbols?.length ?? 0} parça cihazda güvende</small>
            </div>
            <div className="actions">
              <button type="button" className="btn-solid" onClick={() => setActiveRecoveryRecord(record)}>
                Devam et
              </button>
              <button type="button" className="btn-ghost" onClick={() => deleteRecoveryRecord(record)}>
                Yarım kalan işlemi sil
              </button>
            </div>
          </div>
        ))}

        {activeRecoveryRecord && (
          <p className="hint">Kaldığınız yer seçildi. Devam etmek için QR videoyu seçin.</p>
        )}

        <label
          className="dropzone compact"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDecodeDrop}
        >
          <input
            aria-label="Çözülecek QR video"
            type="file"
            accept="*/*"
            onClick={(event) => {
              event.target.value = "";
            }}
            onChange={handleDecodeFile}
            hidden
          />
          <span className="dropzone-title">QR video seç veya sürükleyip bırak</span>
          <span className="dropzone-sub">MP4 veya WebM · dosya-belge olarak alınan video</span>
        </label>

        {decodeFile && <p className="hint mono">{decodeFile.name}</p>}

        {(decodeFile || scanPercent > 0) && (
          <div className="video-decode-progress" aria-live="polite">
            <span>Video taraması: %{scanPercent}</span>
            <span>Kurtarılan veri: %{recoveredPercent}</span>
            {isDecoding && <span>Geçen süre: {decodeElapsedTime}</span>}
          </div>
        )}

        {isDecoding && decodeElapsedSeconds >= 180 && (
          <p className="hint" role="status">
            Bu cihazda QR Video taraması uzun sürüyor. Büyük dosyalarda Şifreli Paket daha hızlıdır.
          </p>
        )}

        {decodeProgress.total > 0 && (
          <div className="meta-row">
            <span className="meta-label">Toplanan kare</span>
            <span className="meta-value mono">
              {decodeProgress.collected} / {decodeProgress.total}
            </span>
          </div>
        )}

        <div className="actions">
          <button
            type="button"
            className="btn-solid"
            disabled={!decodeFile || isDecoding}
            onClick={handleDecodeVideo}
          >
            {isDecoding ? `Video taranıyor... %${scanPercent}` : "QR videoyu tara"}
          </button>
        </div>

        {decodedPackageBytes && (
          <p className="hint">Video tarandı. Dosyayı indirmek için ayrı anahtarı girin.</p>
        )}

        {decodedPackageBytes && (
          <>
            <label className="field">
              <span>Video paket anahtarı</span>
              <textarea
                value={videoKeyText}
                onChange={(event) => setVideoKeyText(event.target.value)}
                rows={3}
                autoComplete="off"
                spellCheck="false"
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="btn-solid"
                disabled={!videoKeyText.trim() || isOpening}
                onClick={handleOpenVideoPackage}
              >
                {isOpening ? "Doğrulanıyor..." : "Dosyayı doğrula ve indir"}
              </button>
            </div>
          </>
        )}

        {openError && <p className="error">{openError}</p>}

        {openedResult && openedUrl && (
          <div className="result">
            <div className="meta">
              <div className="meta-row">
                <span className="meta-label">Dosya</span>
                <span className="meta-value mono">{openedResult.file.name}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">SHA-256</span>
                <span className="meta-value mono breakable">{openedResult.sha256}</span>
              </div>
            </div>
            <a className="btn-solid download-result-action" href={openedUrl} download={openedResult.file.name}>
              Özgün dosyayı indir
            </a>
          </div>
        )}
        </section>
      )}
    </div>
  );
}
