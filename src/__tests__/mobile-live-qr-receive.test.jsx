import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveQrReceiveScanner from '../LiveQrReceiveScanner.jsx';
import { shouldUseImmersiveLiveQrLayout } from '../live-qr/immersive-layout.js';
import { normalizeReceiveProgress } from '../live-qr/receive-progress.js';
import ReceivePanel from '../ReceivePanel.jsx';

const originalRequestFullscreen = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'requestFullscreen',
);

describe('mobil Canlı QR alım yüzeyi', () => {
  afterEach(() => {
    cleanup();
    document.body.classList.remove('live-qr-scanner-open');
    document.body.classList.remove('live-qr-scanner-immersive');
    if (originalRequestFullscreen) {
      Object.defineProperty(Element.prototype, 'requestFullscreen', originalRequestFullscreen);
    } else {
      delete Element.prototype.requestFullscreen;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('ilerleme değerlerini güvenli aralığa sınırlar', () => {
    expect(normalizeReceiveProgress({ collected: 150, total: 100 })).toEqual({
      collected: 100,
      total: 100,
      percentage: 100,
      determinate: true,
    });
    expect(normalizeReceiveProgress({ collected: -4, total: Number.NaN })).toEqual({
      collected: 0,
      total: 0,
      percentage: 0,
      determinate: false,
    });
  });

  it('yatay tutulan geniş telefonlarda da tam ekran taramayı korur', () => {
    expect(shouldUseImmersiveLiveQrLayout({
      viewportWidth: 844,
      hasCoarsePointer: true,
    })).toBe(true);
    expect(shouldUseImmersiveLiveQrLayout({
      viewportWidth: 844,
      hasCoarsePointer: false,
    })).toBe(false);
  });

  it('masaüstü site görünümündeki telefonda da tam ekran taramayı açar', () => {
    expect(shouldUseImmersiveLiveQrLayout({
      viewportWidth: 980,
      screenWidth: 384,
      screenHeight: 844,
      hasCoarsePointer: false,
    })).toBe(true);
  });

  it('masaüstü site görünümündeki telefon için tarayıcıyı gerçekten tüm ekrana yerleştirir', () => {
    vi.stubGlobal('innerWidth', 980);
    vi.stubGlobal('screen', { width: 384, height: 844 });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));

    renderScanner();

    expect(screen.getByLabelText('Canlı QR tarayıcı')).toHaveClass('is-immersive');
    expect(document.body).toHaveClass('live-qr-scanner-immersive');
    expect(screen.getByLabelText('Canlı QR tarayıcı').parentElement).toBe(document.body);
  });

  it('mobil cihaz bilgisini ekran ölçüsünden bağımsız tanır', () => {
    expect(shouldUseImmersiveLiveQrLayout({
      viewportWidth: 1200,
      screenWidth: 1200,
      screenHeight: 800,
      hasCoarsePointer: false,
      isMobileDevice: true,
    })).toBe(true);
  });

  it('toplam bilinmeden sahte yüzde yerine QR bekleme durumunu gösterir', () => {
    renderScanner();

    const progressbar = screen.getByRole('progressbar', {
      name: 'Canlı QR alım ilerlemesi',
    });
    expect(progressbar).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Bekliyor')).toBeInTheDocument();
    expect(screen.getByText('QR bekleniyor…')).toBeInTheDocument();
    expect(screen.getByLabelText('Canlı QR tarayıcı')).toHaveClass('live-receive-scanner');
    expect(document.body).toHaveClass('live-qr-scanner-open');
  });

  it('mobil taramada kamera, hedef, ilerleme ve kontrolleri tek tam ekran yüzeyde tutar', () => {
    renderScanner();

    const cameraSurface = screen.getByLabelText('Canlı QR kamera ve tarama alanı');
    expect(cameraSurface).toContainElement(screen.getByRole('button', { name: 'Taramadan çık' }));
    expect(cameraSurface).toContainElement(screen.getByRole('button', { name: 'Kamerayı çevir' }));
    expect(cameraSurface).toContainElement(screen.getByRole('progressbar', {
      name: 'Canlı QR alım ilerlemesi',
    }));
  });

  it('benzersiz alınan parçaları büyük yüzde ve erişilebilir çubukla gösterir', () => {
    renderScanner({ progress: { collected: 42, total: 100 }, status: 'receiving', elapsedSeconds: 65 });

    expect(screen.getByText('%42')).toBeInTheDocument();
    expect(screen.getByText('42 / 100 parça alındı')).toBeInTheDocument();
    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Canlı QR alım ilerlemesi' }))
      .toHaveAttribute('aria-valuenow', '42');
  });

  it('mobil kamera yüzeyinde ayrıca tam ekran düğmesi göstermez', () => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    renderScanner();

    expect(screen.queryByRole('button', { name: 'Gerçek tam ekran' })).not.toBeInTheDocument();
  });

  it('çıkış, kamera çevirme ve yeniden deneme eylemlerini dışarı bildirir', () => {
    const onExit = vi.fn();
    const onToggleCamera = vi.fn();
    const onRetry = vi.fn();
    renderScanner({
      error: 'Kameraya erişilemedi.',
      onExit,
      onToggleCamera,
      onRetry,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Taramadan çık' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kamerayı çevir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onToggleCamera).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('mobil Canlı QR ReceivePanel entegrasyonu', () => {
  afterEach(() => {
    cleanup();
    document.body.classList.remove('live-qr-scanner-open');
    vi.restoreAllMocks();
  });

  it('worker ilerlemesini tam ekran tarayıcıda gösterir', async () => {
    prepareCamera();
    const { client, emit } = createReceiveClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    emit({
      type: 'progress',
      state: 'collecting',
      progress: { solved: 25, sourceCount: 100 },
    });

    expect(await screen.findByLabelText('Canlı QR tarayıcı')).toBeInTheDocument();
    expect(screen.queryByText('Daha iyi tarama için')).not.toBeInTheDocument();
    expect(screen.getByText('%25')).toBeInTheDocument();
    expect(screen.getByText('25 / 100 parça alındı')).toBeInTheDocument();
  });

  it('worker 0 / 0 başlangıç bilgisi gönderdiğinde QR bekleme durumunu korur', async () => {
    prepareCamera();
    const { client, emit } = createReceiveClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    act(() => {
      emit({
        type: 'progress',
        state: 'idle',
        progress: { solved: 0, sourceCount: 0 },
      });
    });

    expect(screen.getByText('QR kodu kameraya gösterin')).toBeInTheDocument();
    expect(screen.getByText('QR bekleniyor…')).toBeInTheDocument();
  });

  it('taramadan çıkınca kamerayı kapatır ve temiz bir yeniden başlama sunar', async () => {
    prepareCamera();
    const { client, emit } = createReceiveClient();
    render(<ReceivePanel liveReceiveClient={client} />);
    emit({
      type: 'progress',
      state: 'collecting',
      progress: { solved: 25, sourceCount: 100 },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Taramadan çık' }));
    expect(screen.queryByLabelText('Canlı QR tarayıcı')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Taramayı yeniden aç' }));
    expect(await screen.findByLabelText('Canlı QR tarayıcı')).toBeInTheDocument();
    expect(screen.getByText('QR bekleniyor…')).toBeInTheDocument();
    expect(client.reset).toHaveBeenCalledTimes(1);
  });

  it('doğrulanan dosyada tarayıcıyı kaldırıp indirme bağlantısını gösterir', async () => {
    prepareCamera();
    const { client, emit } = createReceiveClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    emit({
      type: 'complete',
      result: {
        file: new File(['doğrulandı'], 'tablolar.zip', { type: 'application/zip' }),
        sha256: 'A'.repeat(43),
      },
    });

    expect(await screen.findByRole('link', { name: 'Dosyayı indir' }))
      .toHaveAttribute('download', 'tablolar.zip');
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
    expect(screen.getByText('Aktarım süresi: 00:00')).toBeInTheDocument();
    expect(screen.queryByLabelText('Canlı QR tarayıcı')).not.toBeInTheDocument();
  });
});

function renderScanner({
  progress = { collected: 0, total: 0 },
  status = 'waiting',
  error = null,
  onExit = vi.fn(),
  onToggleCamera = vi.fn(),
  onRetry = vi.fn(),
  elapsedSeconds = 0,
} = {}) {
  return render(
    <LiveQrReceiveScanner
      videoRef={createRef()}
      progress={progress}
      status={status}
      error={error}
      onExit={onExit}
      onToggleCamera={onToggleCamera}
      onRetry={onRetry}
      elapsedSeconds={elapsedSeconds}
    />,
  );
}

function createReceiveClient() {
  let subscriber = null;
  const client = {
    accept: vi.fn(() => true),
    reset: vi.fn(),
    close: vi.fn(),
    subscribe: vi.fn((listener) => {
      subscriber = listener;
      return vi.fn();
    }),
  };
  return {
    client,
    emit(message) {
      subscriber?.(message);
    },
  };
}

function prepareCamera() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
        getVideoTracks: () => [],
      }),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(0);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
  });
}
