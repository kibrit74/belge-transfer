import { useEffect, useRef, useState } from 'react';
import { encodeLiveFrameV2 } from './live-qr/frame-v2.js';
import { createLiveQrPackage } from './live-qr/package-v1.js';
import { MAX_LIVE_QR_INPUT_BYTES } from './live-qr/limits.js';
import { createLiveQrPrefetchPlayer } from './live-qr/prefetch-player.js';
import { selectLiveQrProfile } from './live-qr/profile-policy.js';
import { rasterizeLiveQrText } from './live-qr/qr-raster.js';
import { createLiveQrRenderPool } from './live-qr/render-pool.js';
import {
  createStripeFountainEncoder,
  MAX_PARITY_ROWS,
  STRIPE_DATA_COUNT,
} from './live-qr/stripe-fountain-v2.js';
import { validateTransferSelection } from './transfer/usage-policy.js';
import { completeTransferActivity, reserveTransferActivity } from './transfer/activity-client.js';

const PROFILE_LABELS = Object.freeze({
  compatible: 'Uyumlu',
  balanced: 'Dengeli',
  fast: 'Hızlı',
});

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function createTransferId() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const random = new Uint8Array(12);
  globalThis.crypto.getRandomValues(random);
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join('');
}

function drawRaster(canvas, raster, pixelSize) {
  const context = canvas?.getContext('2d');
  if (!context || typeof ImageData === 'undefined') return;
  const scratch = document.createElement('canvas');
  scratch.width = raster.width;
  scratch.height = raster.height;
  const scratchContext = scratch.getContext('2d');
  if (!scratchContext) return;
  scratchContext.putImageData(new ImageData(raster.pixels, raster.width, raster.height), 0, 0);
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pixelSize, pixelSize);
  context.drawImage(scratch, 0, 0, pixelSize, pixelSize);
}

export default function SendPanel({ user, maxInputBytes = MAX_LIVE_QR_INPUT_BYTES, onVaultDrop }) {
  const policyUser = user === undefined ? { id: 'component' } : user;
  const [fileInfo, setFileInfo] = useState(null);
  const [session, setSession] = useState(null);
  const [running, setRunning] = useState(false);
  const [symbolNumber, setSymbolNumber] = useState(0);
  const [readyGroupCount, setReadyGroupCount] = useState(0);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const canvasRefs = useRef([]);
  const groupRef = useRef(null);
  const playerRef = useRef(null);
  const wakeLockRef = useRef(null);
  const generationRef = useRef(0);
  const reservationRef = useRef(null);
  const selectedFileRef = useRef(null);

  useEffect(() => () => {
    generationRef.current += 1;
    playerRef.current?.stop();
    playerRef.current = null;
    wakeLockRef.current?.release?.();
    wakeLockRef.current = null;
    const reservation = reservationRef.current;
    if (reservation && !reservation.completed && !reservation.finalizing) {
      reservation.failed = true;
      void completeTransferActivity({
        user,
        reservationId: reservation.id,
        status: 'failed',
        completedAt: new Date(),
      });
    }
  }, [user]);

  async function processSelectedFile(file) {
    if (!file) return;
    selectedFileRef.current = file;
    const currentGeneration = generationRef.current + 1;
    generationRef.current = currentGeneration;
    const startedAt = new Date();
    let reservation = null;
    setError('');
    setReadyGroupCount(0);
    try {
      if (file.size > maxInputBytes) {
        throw new RangeError(
          `Canlı QR en fazla ${maxInputBytes / (1024 * 1024)} MiB destekler. Daha büyük dosyalar için Yakındaki Cihazlar veya VaultDrop kullanın.`,
        );
      }
      validateTransferSelection([file], { method: 'live_qr', user: policyUser });
      reservation = await reserveTransferActivity({ user, method: 'live_qr', files: [file], startedAt });
      const packaged = await createLiveQrPackage(file);
      const encoder = await createStripeFountainEncoder(packaged.bytes, { transferId: createTransferId() });
      const firstText = encodeLiveFrameV2(encoder.metadata, encoder.symbol(0));
      const { moduleCount } = rasterizeLiveQrText(firstText);
      const profile = selectLiveQrProfile({
        width: globalThis.innerWidth || 390,
        height: globalThis.innerHeight || 844,
        devicePixelRatio: globalThis.devicePixelRatio || 1,
        refreshRate: 60,
        moduleCount,
        preference: 'balanced',
      });
      if (!profile.supported || currentGeneration !== generationRef.current) {
        throw new Error('Bu ekran Canlı QR için yeterince büyük değil. VaultDrop ile güvenli paylaşımı kullanın.');
      }

      reservationRef.current = {
        id: reservation?.id ?? null,
        completed: false,
        failed: false,
        finalizing: false,
        generation: currentGeneration,
      };
      setFileInfo({ name: file.name, size: file.size, type: file.type || 'bilinmiyor' });
      setSession({ encoder, profile, packaged, generation: currentGeneration });
      setSymbolNumber(0);
      setRunning(true);
    } catch (caughtError) {
      if (reservation?.id) {
        try {
          await completeTransferActivity({
            user,
            reservationId: reservation.id,
            status: 'failed',
            completedAt: new Date(),
          });
        } catch {
          // Asıl hata kullanıcıya gösterilir; kota kaydı hatası akışı gölgelemez.
        }
      }
      if (currentGeneration !== generationRef.current) return;
      setSession(null);
      setFileInfo(null);
      setRunning(false);
      setError(caughtError instanceof Error && caughtError.message ? caughtError.message : 'Aktarım başlatılamadı.');
    }
  }

  useEffect(() => {
    if (!session) return undefined;
    let active = true;
    let pool = null;
    let symbolId = 0;
    let renderFrame = 0;
    let firstPresentation = true;
    const { encoder, profile } = session;
    const stripeCount = Math.ceil(encoder.metadata.sourceCount / STRIPE_DATA_COUNT);
    const symbolLimit = encoder.metadata.sourceCount + (stripeCount * MAX_PARITY_ROWS);

    try {
      pool = createLiveQrRenderPool();
    } catch {
      pool = null;
    }

    const createTexts = () => {
      const texts = Array.from({ length: profile.count }, (_, index) => {
        const currentId = (symbolId + index) % symbolLimit;
        return encodeLiveFrameV2(encoder.metadata, encoder.symbol(currentId));
      });
      symbolId = (symbolId + profile.count) % symbolLimit;
      return texts;
    };
    const renderFallback = (texts) => texts.map((text, regionIndex) => ({
      ...rasterizeLiveQrText(text),
      regionIndex,
    }));
    const renderGroup = async (texts) => {
      const frameIndex = renderFrame;
      renderFrame += 1;
      if (!pool) return renderFallback(texts);
      try {
        return await Promise.all(texts.map((text, regionIndex) => (
          pool.render(text, { frameIndex, regionIndex })
        )));
      } catch {
        pool.close();
        pool = null;
        return renderFallback(texts);
      }
    };

    async function finalizeFirstPresentation() {
      const reservation = reservationRef.current;
      if (!reservation || reservation.generation !== session.generation || reservation.finalizing
        || reservation.completed || reservation.failed) return;
      reservation.finalizing = true;
      try {
        await completeTransferActivity({
          user,
          reservationId: reservation.id,
          status: 'completed',
          completedAt: new Date(),
        });
        if (!active || generationRef.current !== session.generation) {
          await completeTransferActivity({
            user,
            reservationId: reservation.id,
            status: 'failed',
            completedAt: new Date(),
          });
          reservation.failed = true;
          return;
        }
        reservation.completed = true;
      } catch (caughtError) {
        try {
          await completeTransferActivity({
            user,
            reservationId: reservation.id,
            status: 'failed',
            completedAt: new Date(),
          });
        } catch {
          // İlk kesinleştirme hatası kullanıcıya gösterilir.
        }
        reservation.failed = true;
        if (!active || generationRef.current !== session.generation) return;
        playerRef.current?.stop();
        setRunning(false);
        setSession(null);
        setFileInfo(null);
        setError(caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : 'Aylık kullanım kaydı güvenceye alınamadı.');
      } finally {
        reservation.finalizing = false;
      }
    }

    const presentGroup = (rasters) => {
      if (!active) return;
      rasters.forEach((raster, regionIndex) => {
        drawRaster(canvasRefs.current[regionIndex], raster, profile.layout.qrPixelSize);
      });
      setSymbolNumber(symbolId || symbolLimit);
      if (firstPresentation) {
        firstPresentation = false;
        void finalizeFirstPresentation();
      }
    };

    const player = createLiveQrPrefetchPlayer({
      fps: profile.fps,
      depth: 3,
      createTexts,
      renderGroup,
      presentGroup,
      onQueueDepth: (count) => { if (active) setReadyGroupCount(count); },
    });
    playerRef.current = player;
    void player.start();

    return () => {
      active = false;
      player.stop();
      if (playerRef.current === player) playerRef.current = null;
      pool?.close();
    };
  }, [session, user]);

  function toggleRunning() {
    if (!playerRef.current) return;
    if (running) playerRef.current.pause();
    else playerRef.current.resume();
    setRunning((value) => !value);
  }

  async function showFullscreen() {
    try {
      await groupRef.current?.requestFullscreen?.();
      if (navigator.wakeLock?.request) wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      setError('Tam ekran açılamadı. Tarayıcı ayarlarını kontrol edin.');
    }
  }

  function reset() {
    generationRef.current += 1;
    playerRef.current?.stop();
    playerRef.current = null;
    wakeLockRef.current?.release?.();
    wakeLockRef.current = null;
    setRunning(false);
    setSession(null);
    setFileInfo(null);
    setSymbolNumber(0);
    setReadyGroupCount(0);
    setError('');
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (file) void processSelectedFile(file);
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const droppedFile = event.dataTransfer?.files?.[0];
    if (droppedFile) void processSelectedFile(droppedFile);
  }

  return (
    <div className="panel">
      {!session && (
        <label
          className={`dropzone ${isDragging ? 'drag-over' : ''}`.trim()}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            aria-label="Canlı QR ile gönderilecek belge"
            onClick={(event) => { event.target.value = ''; }}
            onChange={handleFile}
            hidden
          />
          <span className="dropzone-title">Dosya seç</span>
          <span className="dropzone-sub">Tek dosya veya ZIP, en fazla {maxInputBytes / (1024 * 1024)} MiB</span>
        </label>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {error && selectedFileRef.current && onVaultDrop && (
        <button type="button" className="btn-ghost" onClick={() => onVaultDrop(selectedFileRef.current)}>
          VaultDrop ile devam et
        </button>
      )}

      {session && (
        <>
          <div
            ref={groupRef}
            aria-label="Canlı QR grubu"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${session.profile.layout.columns}, ${session.profile.layout.qrCssSize}px)`,
              gap: `${session.profile.layout.gap}px`,
              justifyContent: 'center',
            }}
          >
            {Array.from({ length: session.profile.count }, (_, index) => (
              <canvas
                key={index}
                ref={(canvas) => { canvasRefs.current[index] = canvas; }}
                aria-label={`Canlı QR kodu ${index + 1}`}
                className="qr-canvas"
                style={{
                  width: session.profile.layout.qrCssSize,
                  height: session.profile.layout.qrCssSize,
                }}
              />
            ))}
          </div>
          <div className="meta">
            <div className="meta-row"><span className="meta-label">Dosya</span><span className="meta-value mono">{fileInfo.name}</span></div>
            <div className="meta-row"><span className="meta-label">Boyut</span><span className="meta-value mono">{formatSize(fileInfo.size)}</span></div>
            <div className="meta-row"><span className="meta-label">Profil</span><span className="meta-value">{PROFILE_LABELS[session.profile.id]}</span></div>
            <div className="meta-row"><span className="meta-label">Aktarım sembolü</span><span className="meta-value mono">{symbolNumber}</span></div>
            <div className="meta-row">
              <span className="meta-label">Hazır kare</span>
              <span className="meta-value mono" role="status" aria-label="Hazır kare kuyruğu">{readyGroupCount} / 3</span>
            </div>
            <div className="meta-row"><span className="meta-label">Aktarım kimliği</span><span className="meta-value mono">{session.encoder.metadata.transferId}</span></div>
          </div>
          <div className="actions">
            <button type="button" className="btn-ghost" onClick={toggleRunning}>{running ? 'Duraklat' : 'Devam et'}</button>
            {typeof Element !== 'undefined' && 'requestFullscreen' in Element.prototype && (
              <button type="button" className="btn-ghost" onClick={showFullscreen}>Tam ekran göster</button>
            )}
            <button type="button" className="btn-ghost" onClick={reset}>Yeni belge</button>
          </div>
          <p className="hint">Canlı QR şifreli değildir. Yakındaki cihazlar için kullanın; ekrana bakan başka bir kamera kodları tarar.</p>
        </>
      )}
    </div>
  );
}
