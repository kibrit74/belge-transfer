import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completeTransferMock, reserveTransferMock } = vi.hoisted(() => ({
  completeTransferMock: vi.fn(),
  reserveTransferMock: vi.fn(),
}));

const { renderPoolMock } = vi.hoisted(() => ({
  renderPoolMock: vi.fn(),
}));

vi.mock('../transfer/activity-client.js', () => ({
  completeTransferActivity: completeTransferMock,
  reserveTransferActivity: reserveTransferMock,
}));

vi.mock('../live-qr/render-pool.js', () => ({
  createLiveQrRenderPool: renderPoolMock,
}));

import ReceivePanel from '../ReceivePanel.jsx';
import SendPanel from '../SendPanel.jsx';

describe('Canlı QR çoklu ekran akışı', () => {
  beforeEach(() => {
    reserveTransferMock.mockReset();
    completeTransferMock.mockReset();
    reserveTransferMock.mockResolvedValue({ id: 'reservation-1' });
    completeTransferMock.mockResolvedValue();
    renderPoolMock.mockImplementation(() => { throw new Error('Worker kullanılamıyor'); });
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1600 },
      innerHeight: { configurable: true, value: 900 },
      devicePixelRatio: { configurable: true, value: 1 },
    });
  });

  it('2 MiB altındaki ZIP için varsayılan Dengeli profilde tek büyük siyah-beyaz QR gösterir', async () => {
    render(<SendPanel user={{ id: 'member-1', plan: 'standard' }} />);
    fireEvent.change(screen.getByLabelText('Canlı QR ile gönderilecek belge'), {
      target: { files: [new File(['zip içeriği'], 'tablolar.zip', { type: 'application/zip' })] },
    });

    expect(await screen.findAllByLabelText(/Canlı QR kodu/)).toHaveLength(1);
    expect(screen.getByText('Dengeli')).toBeInTheDocument();
    expect(screen.getByText(/ekrana bakan başka bir kamera/i)).toBeInTheDocument();
  });

  it('gönderim workerına QRL2 metinleri verir ve üç hazır grubu görünür tutar', async () => {
    const pool = {
      render: vi.fn(async (text, { frameIndex, regionIndex }) => ({
        frameIndex,
        regionIndex,
        width: 1,
        height: 1,
        pixels: new Uint8ClampedArray([255, 255, 255, 255]),
      })),
      close: vi.fn(),
    };
    renderPoolMock.mockReturnValue(pool);
    render(<SendPanel user={{ id: 'member-1', plan: 'standard' }} />);

    fireEvent.change(screen.getByLabelText('Canlı QR ile gönderilecek belge'), {
      target: { files: [new File(['qrl2 içerik'], 'qrl2.zip', { type: 'application/zip' })] },
    });

    const queueStatus = await screen.findByRole('status', { name: 'Hazır kare kuyruğu' });
    await waitFor(() => expect(queueStatus).toHaveTextContent('3 / 3'));
    await waitFor(() => expect(pool.render).toHaveBeenCalled());
    expect(pool.render.mock.calls.every(([text]) => text.startsWith('QRL2|'))).toBe(true);
  });

  it('destekleyen tarayıcıda Canlı QR grubunu tam ekrana açar', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    render(<SendPanel user={{ id: 'member-1', plan: 'standard' }} />);
    fireEvent.change(screen.getByLabelText('Canlı QR ile gönderilecek belge'), {
      target: { files: [new File(['içerik'], 'ekran.zip', { type: 'application/zip' })] },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Tam ekran göster' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('Canlı QR tamamlanınca yalnız worker tarafından doğrulanmış dosya için indirme sunar', async () => {
    const client = {
      accept: vi.fn(() => true),
      reset: vi.fn(),
      close: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    };
    render(<ReceivePanel liveReceiveClient={client} />);

    expect(screen.getByLabelText('Canlı QR tarayıcı')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Taramayı başlat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kamerayı çevir' })).toBeInTheDocument();
    act(() => {
      client.subscribe.mock.calls[0]?.[0]({
        type: 'complete',
        result: { file: new File(['ok'], 'tablolar.zip', { type: 'application/zip' }), sha256: 'A'.repeat(43) },
      });
    });

    expect(await screen.findByRole('link', { name: 'Dosyayı indir' })).toHaveAttribute('download', 'tablolar.zip');
  });

  it('çalışan render workerı hata verirse ana yedekle gönderime devam eder', async () => {
    const pool = {
      render: vi.fn().mockRejectedValue(new Error('Worker sonradan durdu')),
      close: vi.fn(),
    };
    renderPoolMock.mockReturnValue(pool);
    render(<SendPanel user={{ id: 'member-1', plan: 'standard' }} />);

    fireEvent.change(screen.getByLabelText('Canlı QR ile gönderilecek belge'), {
      target: { files: [new File(['zip içeriği'], 'tablolar.zip', { type: 'application/zip' })] },
    });

    await screen.findAllByLabelText(/Canlı QR kodu/);
    await waitFor(() => expect(pool.close).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
