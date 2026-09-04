import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({
  liveCleanup: vi.fn(),
  apiRequest: vi.fn(),
  peerFactory: vi.fn(),
}));

vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('../config/feature-flags.js', () => ({
  getFeatureFlags: () => ({
    nearbyEnabled: true,
    liveQr10MiBEnabled: true,
    liveQrFastProfileEnabled: false,
  }),
}));

vi.mock('../SendPanel.jsx', async () => {
  const { useEffect } = await import('react');
  return {
    default: function MockSendPanel() {
      useEffect(() => () => lifecycle.liveCleanup(), []);
      return <p>Canlı QR gönderim paneli</p>;
    },
  };
});

vi.mock('../api/client.js', () => ({
  apiRequest: (...args) => lifecycle.apiRequest(...args),
}));

vi.mock('../nearby/peer-session.js', () => ({
  createNearbyPeerSession: (...args) => lifecycle.peerFactory(...args),
}));

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function pendingForever() {
  return new Promise(() => {});
}

vi.mock('../SecurePackagePanel.jsx', () => ({
  default: () => <p>VaultDrop paket paneli</p>,
}));

vi.mock('../ReceivePanel.jsx', () => ({
  default: () => <p>Canlı QR alım paneli</p>,
}));
import TransferMethodSelector from '../TransferMethodSelector.jsx';
import TransferPage from '../pages/TransferPage.jsx';
import {
  TRANSFER_METHODS,
  recommendTransferMethod,
} from '../transfer/method-registry.js';

const MIB = 1024 * 1024;

describe('üç yöntemli ürün yönlendirmesi', () => {
  beforeEach(() => {
    lifecycle.liveCleanup.mockClear();
    lifecycle.apiRequest.mockReset();
    lifecycle.apiRequest.mockImplementation(pendingForever);
    lifecycle.peerFactory.mockReset();
    window.history.replaceState({}, '', '/transfer');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/transfer');
  });

  it.each([
    ['yan yana ve kameralı', {
      proximity: 'near', sameNetwork: false, sensitive: false,
      sizeBytes: 3 * MIB, cameraAvailable: true,
    }, 'live'],
    ['aynı ağdaki iki bilgisayar', {
      proximity: 'near', sameNetwork: true, sensitive: false,
      sizeBytes: 25 * MIB, cameraAvailable: false,
    }, 'nearby'],
    ['uzaktaki cihaz', {
      proximity: 'remote', sameNetwork: false, sensitive: false,
      sizeBytes: 10 * MIB, cameraAvailable: false,
    }, 'package'],
    ['hassas dosya', {
      proximity: 'near', sameNetwork: true, sensitive: true,
      sizeBytes: 1 * MIB, cameraAvailable: true,
    }, 'package'],
  ])('%s için doğru ana yöntemi seçer', (_name, input, expected) => {
    expect(recommendTransferMethod(input).primary).toBe(expected);
  });

  it('kullanıcıya yalnız üç aktif yöntemi gösterir ve seçimi bildirir', () => {
    const onChange = vi.fn();
    render(
      <TransferMethodSelector
        activeMethod="package"
        onChange={onChange}
        methods={TRANSFER_METHODS.map((method) => ({ ...method, enabled: true }))}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Canlı QR/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yakındaki Cihazlar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VaultDrop/ })).toBeInTheDocument();
    expect(screen.queryByText(/QR Video|Renkli QR/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Yakındaki Cihazlar/ }));
    expect(onChange).toHaveBeenCalledWith('nearby');
  });

  it('gerçek aktarım sayfasında yöntem değiştirirken önceki ağır paneli kapatır', async () => {
    render(<TransferPage />);
    expect(await screen.findByText('VaultDrop paket paneli')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Canlı QR/ }));
    expect(await screen.findByText('Canlı QR gönderim paneli')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Yakındaki Cihazlar/ }));
    expect(await screen.findByRole('heading', { name: 'Aynı ağdaki cihaza gönder' })).toBeInTheDocument();
    expect(lifecycle.liveCleanup).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /VaultDrop/ }));
    expect(await screen.findByText('VaultDrop paket paneli')).toBeInTheDocument();
  });

  it('davet alımından VaultDrop’a geçince cleanupı bir kez çalıştırır ve gecikmiş katılımı yok sayar', async () => {
    const pendingJoin = deferred();
    lifecycle.apiRequest.mockReturnValueOnce(pendingJoin.promise);
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    window.history.replaceState({}, '', '/transfer?nearby=ABC234');

    render(<TransferPage />);

    expect(await screen.findByText('Yakındaki bir cihaz sana bağlantı daveti gönderdi.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bağlan' }));
    await waitFor(() => expect(lifecycle.apiRequest).toHaveBeenCalledTimes(1));
    const [, joinOptions] = lifecycle.apiRequest.mock.calls[0];
    expect(joinOptions.signal).toBeInstanceOf(AbortSignal);
    expect(joinOptions.signal.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /VaultDrop/ }));
    expect(await screen.findByText('VaultDrop paket paneli')).toBeInTheDocument();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(joinOptions.signal.aborted).toBe(true);

    await act(async () => {
      pendingJoin.resolve({
        code: 'ABC234',
        token: 'HOST_SECRET',
        expiresAt: '2026-08-14T12:05:00.000Z',
      });
      await pendingJoin.promise;
    });

    expect(lifecycle.peerFactory).not.toHaveBeenCalled();
    expect(screen.getByText('VaultDrop paket paneli')).toBeInTheDocument();
    expect(screen.queryByText('HOST_SECRET')).not.toBeInTheDocument();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(joinOptions.signal.aborted).toBe(true);
    abortSpy.mockRestore();
  });
});
