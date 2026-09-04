import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseFrameMock, sessionMock, useCameraScannerMock } = vi.hoisted(() => ({
  parseFrameMock: vi.fn(),
  sessionMock: {
    accept: vi.fn(),
    progress: vi.fn(),
    getState: vi.fn(),
    assemble: vi.fn(),
    reset: vi.fn(),
  },
  useCameraScannerMock: vi.fn(),
}));

vi.mock('../hooks/useCameraScanner.js', () => ({
  useCameraScanner: useCameraScannerMock,
}));

vi.mock('../protocol', () => ({
  parseFrame: parseFrameMock,
}));

vi.mock('../transfer/receive-session', () => ({
  createReceiveSession: () => sessionMock,
}));

import ReceivePanel from '../ReceivePanel.jsx';

describe('kaldırılan QR Video alım yolu', () => {
  let onDecoded;

  beforeEach(() => {
    vi.clearAllMocks();
    useCameraScannerMock.mockImplementation((options) => {
      onDecoded = options.onDecoded;
      return {
        videoRef: { current: null },
        canvasRef: { current: null },
        error: null,
        decodeCanvas: vi.fn(),
        stopScanning: vi.fn(),
        waitForDecodeIdle: vi.fn(async () => undefined),
      };
    });
    parseFrameMock.mockReturnValue({
      protocolVersion: 'QRT3',
      transferId: 'Vid123456789',
    });
  });

  it('QRT3 karesini kabul etmez ve eski anahtar arayüzünü açmaz', () => {
    render(<ReceivePanel />);

    let result;
    act(() => {
      result = onDecoded('QRT3-kare');
    });

    expect(result).toEqual({ accepted: false, reason: 'unsupported-protocol' });
    expect(sessionMock.accept).not.toHaveBeenCalled();
    expect(screen.queryByText(/QR video/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/QR video anahtarı/i)).not.toBeInTheDocument();
  });
});
