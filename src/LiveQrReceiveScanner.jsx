import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shouldUseImmersiveLiveQrLayout } from './live-qr/immersive-layout.js';
import { normalizeReceiveProgress } from './live-qr/receive-progress.js';

const STATUS_TEXT = Object.freeze({
  waiting: 'QR kodu kameraya gösterin',
  receiving: 'Parçalar güvenli biçimde alınıyor',
  verifying: 'Dosya doğrulanıyor…',
});

function formatElapsedTime(elapsedSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getImmersiveLayoutState() {
  const hasCoarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches
    || (globalThis.navigator?.maxTouchPoints ?? 0) > 0;
  const isMobileDevice = globalThis.navigator?.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod|Mobile/i.test(globalThis.navigator?.userAgent ?? '');
  return shouldUseImmersiveLiveQrLayout({
    viewportWidth: globalThis.innerWidth,
    screenWidth: globalThis.screen?.width,
    screenHeight: globalThis.screen?.height,
    hasCoarsePointer,
    isMobileDevice,
  });
}

export default function LiveQrReceiveScanner({
  videoRef,
  progress,
  status = 'waiting',
  error = null,
  onExit,
  onToggleCamera,
  onRetry,
  elapsedSeconds = 0,
}) {
  const surfaceRef = useRef(null);
  const [isImmersive, setIsImmersive] = useState(getImmersiveLayoutState);
  const normalized = normalizeReceiveProgress(progress);

  useEffect(() => {
    document.body.classList.add('live-qr-scanner-open');

    return () => {
      document.body.classList.remove('live-qr-scanner-open');
    };
  }, []);

  useEffect(() => {
    const updateLayout = () => setIsImmersive(getImmersiveLayoutState());
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('live-qr-scanner-immersive', isImmersive);
    return () => document.body.classList.remove('live-qr-scanner-immersive');
  }, [isImmersive]);

  const progressAria = normalized.determinate
    ? {
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': normalized.percentage,
        'aria-valuetext': `${normalized.collected} / ${normalized.total} parça alındı`,
      }
    : { 'aria-valuetext': 'QR bekleniyor' };

  const scannerSurface = (
    <section
      ref={surfaceRef}
      className={isImmersive
        ? 'live-receive-scanner is-immersive'
        : 'live-receive-scanner'}
      aria-label="Canlı QR tarayıcı"
    >
      <div className="live-receive-camera" aria-label="Canlı QR kamera ve tarama alanı">
        <video ref={videoRef} muted playsInline className="video" />
        <div className="live-receive-target" aria-hidden="true" />
        <header className="live-receive-header">
          <div className="live-receive-heading">
            <strong>Canlı QR alınıyor</strong>
            <span role="status" aria-live="polite">
              {error || STATUS_TEXT[status] || STATUS_TEXT.waiting}
            </span>
          </div>
          <button
            type="button"
            className="live-receive-icon-button"
            onClick={onExit}
            aria-label="Taramadan çık"
          >
            ×
          </button>
        </header>

        <div className="live-receive-progress">
          <strong className={normalized.determinate
            ? 'live-receive-percentage'
            : 'live-receive-percentage is-waiting'}>
            {normalized.determinate ? `%${normalized.percentage}` : 'Bekliyor'}
          </strong>
          <div
            className={normalized.determinate
              ? 'live-receive-progress-track'
              : 'live-receive-progress-track is-indeterminate'}
            role="progressbar"
            aria-label="Canlı QR alım ilerlemesi"
            {...progressAria}
          >
            <span style={normalized.determinate ? { width: `${normalized.percentage}%` } : undefined} />
          </div>
          <span className="live-receive-progress-copy">
            {normalized.determinate
              ? `${normalized.collected} / ${normalized.total} parça alındı`
              : 'QR bekleniyor…'}
          </span>
          <time className="live-receive-elapsed" aria-label="Geçen süre">
            {formatElapsedTime(elapsedSeconds)}
          </time>
        </div>

        <div className="live-receive-actions">
          <button type="button" className="btn-ghost" onClick={onToggleCamera}>
            Kamerayı çevir
          </button>
          {error && (
            <button type="button" className="btn-solid" onClick={onRetry}>
              Tekrar dene
            </button>
          )}
        </div>
      </div>
    </section>
  );

  return isImmersive && globalThis.document?.body
    ? createPortal(scannerSurface, globalThis.document.body)
    : scannerSurface;
}
