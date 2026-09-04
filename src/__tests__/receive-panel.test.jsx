import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scannerState = vi.hoisted(() => ({
  batchEnabled: null,
  singleEnabled: null,
  batchStop: vi.fn(),
  singleStop: vi.fn(),
  restartCamera: vi.fn(),
  batchVideoRef: { current: null },
  singleVideoRef: { current: null },
  batchCanvasRef: { current: null },
  singleCanvasRef: { current: null },
}));

vi.mock("../hooks/useCameraScanner.js", () => ({
  useCameraScanner(options) {
    scannerState.singleEnabled = options.enabled;
    return {
      videoRef: scannerState.singleVideoRef,
      canvasRef: scannerState.singleCanvasRef,
      error: null,
      stopScanning: scannerState.singleStop,
      waitForDecodeIdle: vi.fn(async () => undefined),
      decodeCanvas: vi.fn(async () => null),
      restartCamera: vi.fn(),
    };
  },
}));

vi.mock("../hooks/useMultiQrScanner.js", () => ({
  useMultiQrScanner(options) {
    scannerState.batchEnabled = options.enabled;
    return {
      videoRef: scannerState.batchVideoRef,
      canvasRef: scannerState.batchCanvasRef,
      error: null,
      stopScanning: scannerState.batchStop,
      restartCamera: scannerState.restartCamera,
    };
  },
}));

import ReceivePanel from "../ReceivePanel.jsx";

function createReceiveClient() {
  let listener = null;
  const client = {
    accept: vi.fn(() => true),
    reset: vi.fn(),
    close: vi.fn(),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener;
      return vi.fn();
    }),
  };
  return { client, emit: (message) => listener?.(message) };
}

describe("ReceivePanel Canlı QR alımı", () => {
  beforeEach(() => {
    scannerState.batchEnabled = null;
    scannerState.singleEnabled = null;
    scannerState.batchStop.mockReset();
    scannerState.singleStop.mockReset();
    scannerState.restartCamera.mockReset();
    scannerState.batchVideoRef.current = null;
    scannerState.singleVideoRef.current = null;
    scannerState.batchCanvasRef.current = null;
    scannerState.singleCanvasRef.current = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("kamerayı açar açmaz PC'nin iki veya dört QR'ını okuyabilen tarayıcıyı kullanır", () => {
    const { client } = createReceiveClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    expect(scannerState.batchEnabled).toBe(true);
    expect(scannerState.singleEnabled).toBe(false);
    expect(scannerState.batchVideoRef.current).toBeInstanceOf(HTMLVideoElement);
    expect(screen.getByLabelText("Canlı QR tarayıcı")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Taramayı başlat" })).not.toBeInTheDocument();
  });

  it("worker'ın doğruladığı dosya için indirme bağlantısı gösterir ve kamerayı kapatır", async () => {
    const { client, emit } = createReceiveClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    act(() => {
      emit({
        type: "complete",
        result: {
          file: new File(["doğrulandı"], "tablolar.zip", { type: "application/zip" }),
          sha256: "A".repeat(43),
        },
      });
    });

    expect(await screen.findByRole("link", { name: "Dosyayı indir" }))
      .toHaveAttribute("download", "tablolar.zip");
    expect(scannerState.batchStop).toHaveBeenCalledTimes(1);
  });

  it("taramadan çıkınca çoklu taramayı kapatır ve yeniden açınca temiz oturum başlatır", () => {
    const { client } = createReceiveClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    fireEvent.click(screen.getByRole("button", { name: "Taramadan çık" }));
    expect(scannerState.batchStop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Taramayı yeniden aç" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Taramayı yeniden aç" }));
    expect(client.reset).toHaveBeenCalledTimes(1);
    expect(scannerState.batchEnabled).toBe(true);
    expect(screen.getByLabelText("Canlı QR tarayıcı")).toBeInTheDocument();
  });

  it("alımdaki hatada görünür sıfırlama yolu sunar", () => {
    const { client, emit } = createReceiveClient();
    render(<ReceivePanel liveReceiveClient={client} />);

    act(() => emit({ type: "error" }));

    expect(screen.getByRole("button", { name: "Alımı sıfırla" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alımı sıfırla" }));
    expect(client.reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Alımı sıfırla" })).not.toBeInTheDocument();
  });
});
