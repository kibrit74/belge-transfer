import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scannerCallbacks = vi.hoisted(() => ({
  single: null,
  batch: null,
  singleEnabled: null,
  batchEnabled: null,
}));

vi.mock('../hooks/useCameraScanner.js', () => ({
  useCameraScanner(options) {
    scannerCallbacks.single = options.onDecoded;
    scannerCallbacks.singleEnabled = options.enabled;
    return {
      videoRef: { current: null },
      canvasRef: { current: null },
      error: null,
      stopScanning: vi.fn(),
      waitForDecodeIdle: vi.fn(async () => undefined),
      decodeCanvas: vi.fn(async () => null),
    };
  },
}));

vi.mock('../hooks/useMultiQrScanner.js', () => ({
  useMultiQrScanner(options) {
    scannerCallbacks.batch = options.onDecodedBatch;
    scannerCallbacks.batchEnabled = options.enabled;
    return {
      videoRef: { current: null },
      canvasRef: { current: null },
      error: null,
      stopScanning: vi.fn(),
    };
  },
}));

import ReceivePanel from '../ReceivePanel.jsx';

function makeClient() {
  return {
    accept: vi.fn(() => true),
    reset: vi.fn(),
    close: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  };
}

describe('Canlı QR alıcı protokol yönlendirmesi', () => {
  beforeEach(() => {
    scannerCallbacks.single = null;
    scannerCallbacks.batch = null;
    scannerCallbacks.singleEnabled = null;
    scannerCallbacks.batchEnabled = null;
  });

  it('PC ekranındaki çoklu QR için güçlü tarayıcıyı ilk kareden itibaren açar', () => {
    render(<ReceivePanel liveReceiveClient={makeClient()} />);

    expect(scannerCallbacks.batchEnabled).toBe(true);
    expect(scannerCallbacks.singleEnabled).toBe(false);
  });

  it('kameradan gelen tek QRL2 karesini canlı alıcı istemcisine yollar', () => {
    const client = makeClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    act(() => scannerCallbacks.single('QRL2|tek-kare'));

    expect(client.accept).toHaveBeenCalledWith(['QRL2|tek-kare']);
  });

  it('çoklu taramadaki QRL1 ve QRL2 karelerini birlikte canlı alıcı istemcisine yollar', () => {
    const client = makeClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    act(() => scannerCallbacks.batch(['QRL2|iki', 'geçersiz', 'QRL1|bir']));

    expect(client.accept).toHaveBeenCalledWith(['QRL2|iki', 'QRL1|bir']);
  });
});
