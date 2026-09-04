import { useEffect, useRef, useState } from "react";
import { decryptContainer } from "./crypto/encrypted-container.js";
import { readFileAsArrayBuffer } from "./protocol/hash.js";
import {
  getTotalFileSize,
  validateBatchFiles,
} from "./transfer/batch-files.js";
import { validateTransferSelection } from "./transfer/usage-policy.js";
import {
  completeTransferActivity,
  reserveTransferActivity,
} from "./transfer/activity-client.js";
import { createVaultDropPackageClient } from "./workers/vaultdrop-package-client.js";

const COPY_ERROR = "Anahtar panoya kopyalanamadı. Lütfen izinleri kontrol edin. Anahtarı elle göster düğmesini kullanabilirsiniz.";
const CREATE_STAGE_LABELS = {
  archive: "Dosyalar hazırlanıyor",
  read: "Dosya okunuyor",
  compress: "Akıllı sıkıştırma uygulanıyor",
  encrypt: "Şifreleniyor",
  complete: "Paket hazır",
};

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

export default function SecurePackagePanel({ view = "both", user, packageClient, initialFile = null }) {
  const policyUser = user === undefined ? { id: "component" } : user;
  const [sourceFiles, setSourceFiles] = useState([]);
  const [packageResult, setPackageResult] = useState(null);
  const [packageUrl, setPackageUrl] = useState("");
  const [createError, setCreateError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [manualKeyAvailable, setManualKeyAvailable] = useState(false);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState(null);
  const [createLogs, setCreateLogs] = useState([]);

  const [containerFile, setContainerFile] = useState(null);
  const [keyText, setKeyText] = useState("");
  const [decryptedResult, setDecryptedResult] = useState(null);
  const [decryptedUrl, setDecryptedUrl] = useState("");
  const [decryptError, setDecryptError] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [openLogs, setOpenLogs] = useState([]);

  const packageUrlRef = useRef("");
  const decryptedUrlRef = useRef("");
  const mountedRef = useRef(false);
  const createVersionRef = useRef(0);
  const createAbortRef = useRef(null);
  const ownedPackageClientRef = useRef(null);
  const packageClientRef = useRef(packageClient ?? null);
  const decryptVersionRef = useRef(0);
  const consumedInitialFileRef = useRef(null);
  const selectSourceFilesRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      createVersionRef.current += 1;
      createAbortRef.current?.abort();
      createAbortRef.current = null;
      revokePackageUrl();
      revokeDecryptedUrl();
    };
  }, []);

  useEffect(() => {
    if (packageClient) {
      packageClientRef.current = packageClient;
      return undefined;
    }

    const ownedClient = createVaultDropPackageClient();
    ownedPackageClientRef.current = ownedClient;
    packageClientRef.current = ownedClient;

    return () => {
      if (ownedPackageClientRef.current === ownedClient) {
        ownedClient.close();
        ownedPackageClientRef.current = null;
      }
      if (packageClientRef.current === ownedClient) {
        packageClientRef.current = null;
      }
    };
  }, [packageClient]);

  useEffect(() => {
    if (view === "open" || !initialFile || consumedInitialFileRef.current === initialFile) return;
    consumedInitialFileRef.current = initialFile;
    selectSourceFilesRef.current?.([initialFile]);
  }, [initialFile, view]);

  function addCreateLog(msg) {
    setCreateLogs((prev) => [...prev, `[${getTimeStr()}] ${msg}`]);
  }

  function addOpenLog(msg) {
    setOpenLogs((prev) => [...prev, `[${getTimeStr()}] ${msg}`]);
  }

  function handleSourceFile(event) {
    selectSourceFiles(Array.from(event.target.files ?? []));
  }

  function removeSourceFile(indexToRemove) {
    selectSourceFiles(sourceFiles.filter((_, index) => index !== indexToRemove));
  }

  function selectSourceFiles(files) {
    createAbortRef.current?.abort();
    createAbortRef.current = null;
    createVersionRef.current += 1;
    setSourceFiles([]);
    setPackageResult(null);
    setCreateError("");
    setCopyStatus("");
    setManualKeyAvailable(false);
    setIsKeyVisible(false);
    setIsCreating(false);
    setCreateProgress(null);
    setCreateLogs([]);
    revokePackageUrl();

    if (files.length === 0) return;

    try {
      validateTransferSelection(files, { method: "secure_package", user: policyUser });
      validateBatchFiles(files);
    } catch (error) {
      setCreateError(errorMessage(error, "Dosyalar seçilemedi."));
      return;
    }

    setSourceFiles(files);
    setCreateLogs([
      `[${getTimeStr()}] ${files.length} dosya seçildi (${formatSize(getTotalFileSize(files))}).`,
    ]);
  }

  selectSourceFilesRef.current = selectSourceFiles;

  async function createPackage() {
    if (sourceFiles.length === 0 || isCreating) return;

    createAbortRef.current?.abort();
    const controller = new AbortController();
    createAbortRef.current = controller;
    const version = createVersionRef.current + 1;
    createVersionRef.current = version;

    setIsCreating(true);
    setCreateError("");
    setCopyStatus("");
    setManualKeyAvailable(false);
    setIsKeyVisible(false);
    setPackageResult(null);
    setCreateProgress(null);
    revokePackageUrl();

    const startedAt = new Date();
    let reservation = null;
    const isCurrentCreate = () => (
      mountedRef.current && createVersionRef.current === version
    );
    const failReservation = async () => {
      try {
        await completeTransferActivity({
          user,
          reservationId: reservation?.id,
          status: "failed",
          completedAt: new Date(),
        });
      } catch {
        // İkincil kota kaydı hatası, asıl paketleme hatasını gölgelememeli.
      }
    };

    try {
      reservation = await reserveTransferActivity({
        user, method: "secure_package", files: sourceFiles, startedAt,
      });
      if (!isCurrentCreate()) {
        await failReservation();
        return;
      }

      const activePackageClient = packageClientRef.current;
      if (!activePackageClient) {
        throw new Error("Paket hazırlama istemcisi başlatılamadı.");
      }
      const encrypted = await activePackageClient.create(sourceFiles, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!isCurrentCreate()) return;
          const percent = Number(progress?.percent);
          if (!Number.isFinite(percent) || !CREATE_STAGE_LABELS[progress?.stage]) return;
          setCreateProgress({
            stage: progress.stage,
            percent: Math.max(0, Math.min(100, Math.round(percent))),
          });
        },
      });
      if (!isCurrentCreate()) {
        await failReservation();
        return;
      }

      const downloadName = `vaultdrop-${encrypted.transferId}.vdrop`;
      if (reservation?.id) {
        const finalized = await completeTransferActivity({
          user, reservationId: reservation.id, status: "completed", completedAt: new Date(),
        });
        if (!finalized) {
          throw new Error("Aylık kullanım kaydı güvenceye alınamadı.");
        }
      }
      if (!isCurrentCreate()) {
        await failReservation();
        return;
      }

      const url = URL.createObjectURL(encrypted.blob);
      packageUrlRef.current = url;
      setPackageUrl(url);
      setPackageResult({ ...encrypted, downloadName });
      setCreateProgress({ stage: "complete", percent: 100 });
      startDownload(url, downloadName);
      addCreateLog("BAŞARILI: .vdrop VaultDrop paketi oluşturuldu!");
      addCreateLog(".vdrop indirmesi başlatıldı. Anahtarı ayrı kanaldan iletin.");
    } catch (error) {
      await failReservation();
      if (isCurrentCreate()) {
        setPackageResult(null);
        setCreateProgress(null);
        const msg = errorMessage(error, "Şifreli paket oluşturulamadı.");
        setCreateError(msg);
        addCreateLog(`HATA: ${msg}`);
      }
    } finally {
      if (isCurrentCreate()) {
        setIsCreating(false);
        if (createAbortRef.current === controller) {
          createAbortRef.current = null;
        }
      }
    }
  }

  async function copyKey() {
    if (!packageResult?.keyText) return;
    setCopyStatus("");

    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(packageResult.keyText);
      setCopyStatus("Anahtar kopyalandı. .vdrop paketinden farklı bir kanalda gönderin.");
      addCreateLog("Anahtar panoya kopyalandı. Lütfen ayrı kanaldan iletin.");
    } catch {
      setCopyStatus(COPY_ERROR);
      setManualKeyAvailable(true);
      setIsKeyVisible(false);
      addCreateLog(`HATA: ${COPY_ERROR}`);
    }
  }

  function handleContainerFile(event) {
    const file = event.target.files?.[0] ?? null;
    setContainerFile(file);
    setDecryptError("");
    setDecryptedResult(null);
    setIsDecrypting(false);
    setOpenLogs([]);
    decryptVersionRef.current += 1;
    revokeDecryptedUrl();

    if (file) {
      setOpenLogs([`[${getTimeStr()}] VaultDrop paketi seçildi: ${file.name} (${formatSize(file.size)})`]);
    }
  }

  function handleKeyText(event) {
    setKeyText(event.target.value);
    setDecryptError("");
    setDecryptedResult(null);
    setIsDecrypting(false);
    decryptVersionRef.current += 1;
    revokeDecryptedUrl();
  }

  async function decryptPackage() {
    if (!containerFile || !keyText.trim()) return;
    setIsDecrypting(true);
    setDecryptError("");
    setDecryptedResult(null);
    revokeDecryptedUrl();

    const version = decryptVersionRef.current + 1;
    decryptVersionRef.current = version;

    addOpenLog("Adım 1/2: VaultDrop paketi okunuyor...");

    try {
      const containerBuf = await readFileAsArrayBuffer(containerFile);
      addOpenLog("Adım 2/2: AES-256-GCM ile paket çözülüyor...");
      const result = await decryptContainer(containerBuf, keyText.trim());
      if (!mountedRef.current || decryptVersionRef.current !== version) return;

      const url = URL.createObjectURL(result.file);
      decryptedUrlRef.current = url;
      setDecryptedUrl(url);
      setDecryptedResult(result);
      addOpenLog(`BAŞARILI: Paket çözüldü! Orijinal dosya: ${result.file.name}`);
    } catch (error) {
      if (mountedRef.current && decryptVersionRef.current === version) {
        const msg = errorMessage(error, "Paket çözülemedi. Anahtarı ve dosyayı kontrol edin.");
        setDecryptError(msg);
        addOpenLog(`HATA: ${msg}`);
      }
    } finally {
      if (mountedRef.current && decryptVersionRef.current === version) {
        setIsDecrypting(false);
      }
    }
  }

  function revokePackageUrl() {
    if (packageUrlRef.current) {
      URL.revokeObjectURL(packageUrlRef.current);
      packageUrlRef.current = "";
    }
    setPackageUrl("");
  }

  function revokeDecryptedUrl() {
    if (decryptedUrlRef.current) {
      URL.revokeObjectURL(decryptedUrlRef.current);
      decryptedUrlRef.current = "";
    }
    setDecryptedUrl("");
  }

  const showCreate = view === "both" || view === "create";
  const showOpen = view === "both" || view === "open";

  return (
    <div className="secure-package">
      {showCreate && (
        <section className="package-section" aria-labelledby="create-package-title">
        <div className="section-heading">
          <h2 id="create-package-title">VaultDrop paketi hazırla</h2>
          <p>Anahtar ayrı kalır; paket tek başına okunamaz.</p>
        </div>

        <label className="dropzone compact">
          <input
            aria-label="Paketlenecek belge"
            type="file"
            multiple={user !== null}
            onClick={(e) => {
              e.target.value = "";
            }}
            onChange={handleSourceFile}
            hidden
          />
          <span className="dropzone-title">Dosya seç</span>
          <span className="dropzone-sub">{user === null ? "Misafir: tek dosya · toplam 10 MiB" : "En fazla 15 dosya · toplam 50 MiB"}</span>
        </label>

        <p className="warning">Anahtarı paketle aynı mesajda göndermeyin</p>

        {sourceFiles.length > 0 && (
          <div className="meta">
            <div className="meta-row">
              <span className="meta-label">Seçim</span>
              <span className="meta-value mono">{sourceFiles.length} dosya</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Toplam boyut</span>
              <span className="meta-value mono">{formatSize(getTotalFileSize(sourceFiles))}</span>
            </div>
            <ul className="batch-file-list" aria-label="Seçilen dosyalar">
              {sourceFiles.map((file, index) => (
                <li className="batch-file-item" key={`${file.name}-${file.size}-${index}`}>
                  <span className="batch-file-name mono">{file.name}</span>
                  <span className="batch-file-size">{formatSize(file.size)}</span>
                  <button
                    type="button"
                    className="batch-file-remove"
                    aria-label={`${file.name} dosyasını kaldır`}
                    onClick={() => removeSourceFile(index)}
                  >
                    Kaldır
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {createProgress && (
          <div className="status-logs-box" role="status">
            <div className="status-logs-title">
              {CREATE_STAGE_LABELS[createProgress.stage]} · %{createProgress.percent}
            </div>
          </div>
        )}

        {createLogs.length > 0 && (
          <div className="status-logs-box">
            <div className="status-logs-title">İlerleme Adımları</div>
            <ul className="status-logs-list">
              {createLogs.map((log, idx) => (
                <li key={idx} className="status-log-item">
                  <span className="log-icon">➔</span> {log}
                </li>
              ))}
            </ul>
          </div>
        )}

        {createError && <p className="error">{createError}</p>}

        <div className="actions">
          <button
            type="button"
            className="btn-solid"
            disabled={sourceFiles.length === 0 || isCreating}
            onClick={createPackage}
          >
            {isCreating ? "Hazırlanıyor..." : "VaultDrop paketi oluştur"}
          </button>
          {isCreating && (
            <button
              type="button"
              className="btn-ghost"
              aria-label="Paket oluşturmayı iptal et"
              onClick={() => createAbortRef.current?.abort()}
            >
              Paket oluşturmayı iptal et
            </button>
          )}
        </div>

        {packageResult && packageUrl && (
          <div className="result">
            <ol className="package-share-steps">
              <li>1. .vdrop paketini gönder</li>
              <li>2. Anahtarı farklı bir kanaldan gönder</li>
            </ol>
            <a className="btn-solid download-result-action" href={packageUrl} download={packageResult.downloadName}>
              VaultDrop paketini indir
            </a>
            {packageResult.savedPercent > 0 && (
              <p className="hint">%{packageResult.savedPercent} daha küçük</p>
            )}
            <div className="meta">
              <div className="meta-row">
                <span className="meta-label">SHA-256</span>
                <span className="meta-value mono breakable">{packageResult.sha256}</span>
              </div>
            </div>
            <button type="button" className="btn-ghost" onClick={copyKey}>
              Anahtarı kopyala
            </button>
            {manualKeyAvailable && !isKeyVisible && (
              <button type="button" className="btn-ghost" onClick={() => setIsKeyVisible(true)}>
                Anahtarı elle göster
              </button>
            )}
            {isKeyVisible && (
              <div className="manual-key-fallback">
                <label>
                  <span>Geçici paket anahtarı</span>
                  <textarea readOnly value={packageResult.keyText} />
                </label>
                <button type="button" className="btn-ghost" onClick={() => setIsKeyVisible(false)}>
                  Anahtarı gizle
                </button>
              </div>
            )}
            <p className="warning">
              Paket ile anahtarı aynı konuşmada paylaşmayın. Anahtar kaybolursa paket kurtarılamaz.
            </p>
            {copyStatus && (
              <p
                className={copyStatus === COPY_ERROR ? "error" : "hint"}
                role={copyStatus === COPY_ERROR ? "alert" : "status"}
              >
                {copyStatus}
              </p>
            )}
          </div>
        )}
        </section>
      )}

      {showOpen && (
        <section className="package-section" aria-labelledby="open-package-title">
        <div className="section-heading">
          <h2 id="open-package-title">Şifreli paketi aç</h2>
          <p>Paketi seçin, ayrı kanaldan aldığınız anahtarı buraya yapıştırın.</p>
        </div>

        <label className="dropzone compact">
          <input
            aria-label="VaultDrop paket dosyası"
            type="file"
            accept=".vdrop,.bta,application/vnd.vaultdrop.package,application/x-belgeaktar"
            onClick={(e) => {
              e.target.value = "";
            }}
            onChange={handleContainerFile}
            hidden
          />
          <span className="dropzone-title">VaultDrop paket dosyası</span>
          <span className="dropzone-sub">Karşı taraftan gelen şifreli dosya</span>
        </label>

        <label className="field">
          <span>Paket anahtarı</span>
          <textarea
            value={keyText}
            onChange={handleKeyText}
            rows={3}
            autoComplete="off"
            spellCheck="false"
          />
        </label>

        {openLogs.length > 0 && (
          <div className="status-logs-box">
            <div className="status-logs-title">İlerleme Adımları</div>
            <ul className="status-logs-list">
              {openLogs.map((log, idx) => (
                <li key={idx} className="status-log-item">
                  <span className="log-icon">➔</span> {log}
                </li>
              ))}
            </ul>
          </div>
        )}

        {decryptError && <p className="error">{decryptError}</p>}

        <div className="actions">
          <button
            type="button"
            className="btn-solid"
            disabled={!containerFile || !keyText.trim() || isDecrypting}
            onClick={decryptPackage}
          >
            {isDecrypting ? "Çözülüyor..." : "Paketi çöz"}
          </button>
        </div>

        {decryptedResult && decryptedUrl && (
          <div className="result">
            <div className="meta">
              <div className="meta-row">
                <span className="meta-label">Dosya</span>
                <span className="meta-value mono">{decryptedResult.file.name}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">SHA-256</span>
                <span className="meta-value mono breakable">{decryptedResult.sha256}</span>
              </div>
            </div>
            <a className="btn-solid download-result-action" href={decryptedUrl} download={decryptedResult.file.name}>
              Özgün dosyayı indir
            </a>
          </div>
        )}
        </section>
      )}
    </div>
  );
}
