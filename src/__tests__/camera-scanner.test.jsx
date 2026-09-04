import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMERA_DECODE_TIMEOUT_MS,
  useCameraScanner,
} from "../hooks/useCameraScanner.js";

const { BarcodeDetectorMock, barcodeDetectMock, jsQrMock } = vi.hoisted(() => {
  const barcodeDetectMock = vi.fn();
  const BarcodeDetectorMock = vi.fn(function BarcodeDetector() {
    return { detect: barcodeDetectMock };
  });
  Object.defineProperty(window, "BarcodeDetector", {
    configurable: true,
    value: BarcodeDetectorMock,
  });
  return { BarcodeDetectorMock, barcodeDetectMock, jsQrMock: vi.fn() };
});
vi.mock("jsqr", () => ({ default: jsQrMock }));

function Harness({ facingMode = "environment", enabled = true, paused = false, onReady }) {
  const scanner = useCameraScanner({
    onDecoded: () => {},
    enabled,
    facingMode,
    paused,
    scanIntervalMs: 70,
  });

  useEffect(() => {
    onReady?.(scanner);
  }, [onReady, scanner]);

  return (
    <>
      {scanner.error && <p>{scanner.error}</p>}
      <video ref={scanner.videoRef} muted playsInline />
      <canvas ref={scanner.canvasRef} hidden />
    </>
  );
}

describe("useCameraScanner", () => {
  let stops;

  beforeEach(() => {
    vi.useFakeTimers();
    stops = [];
    jsQrMock.mockReset();
    jsQrMock.mockReturnValue(null);
    barcodeDetectMock.mockReset();
    BarcodeDetectorMock.mockClear();
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockImplementation(() => {
          const stop = vi.fn();
          stops.push(stop);
          return Promise.resolve({ getTracks: () => [{ stop }] });
        }),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
        width: 1,
        height: 1,
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("unmount sırasında kamera track'lerini kapatır", async () => {
    const { unmount } = render(<Harness />);
    await flush();

    unmount();

    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kamera yönü değişince eski akışı kapatır ve yeni akış başlatır", async () => {
    const { rerender } = render(<Harness facingMode="environment" />);
    await flush();

    rerender(<Harness facingMode="user" />);
    await flush();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(stops[0]).toHaveBeenCalledTimes(1);
  });

  it("geç dönen eski kamera akışını kapatır ve yeni akışı korur", async () => {
    let resolveOldStream;
    const oldStop = vi.fn();
    const newStop = vi.fn();
    const oldStream = { getTracks: () => [{ stop: oldStop }] };
    const newStream = { getTracks: () => [{ stop: newStop }] };
    navigator.mediaDevices.getUserMedia
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveOldStream = resolve;
        }),
      )
      .mockResolvedValueOnce(newStream);

    const { container, rerender } = render(<Harness facingMode="environment" />);
    await flush();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    rerender(<Harness facingMode="user" />);
    await flush();
    const video = container.querySelector("video");
    expect(video.srcObject).toBe(newStream);

    resolveOldStream(oldStream);
    await flush();

    expect(oldStop).toHaveBeenCalledTimes(1);
    expect(newStop).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(newStream);
  });

  it("video oynatılamazsa akışı kapatır ve bağlantıyı temizler", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(stream);
    HTMLMediaElement.prototype.play.mockRejectedValueOnce(new Error("play failed"));

    const { container } = render(<Harness />);
    await flush();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(container.querySelector("video").srcObject).toBeNull();
    expect(
      screen.getByText("Kameraya erişilemedi. Kamera izinlerini veya donanımını kontrol edin."),
    ).toBeInTheDocument();
  });

  it("aynı anda birden fazla canlı tarama zamanlayıcısı bırakmaz", async () => {
    render(<Harness />);
    await flush();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
  });

  it("paused durumunda canlı taramayı durdurur", async () => {
    const { rerender } = render(<Harness paused={false} />);
    await flush();

    rerender(<Harness paused />);
    await flush();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("kamera izni reddedilirse Türkçe hata gösterir", async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error("denied"));
    render(<Harness />);
    await flush();

    expect(screen.getByText("Kameraya erişilemedi. Kamera izinlerini veya donanımını kontrol edin.")).toBeInTheDocument();
  });

  it("canlı çözüm sürerken dış çözümü sıraya alır", async () => {
    let resolveLiveDecode;
    barcodeDetectMock
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveLiveDecode = resolve;
        }),
      )
      .mockResolvedValueOnce([]);
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: BarcodeDetectorMock,
    });

    let scanner;
    render(<Harness onReady={(value) => { scanner = value; }} />);
    await flush();

    expect(barcodeDetectMock).toHaveBeenCalledTimes(1);
    const externalDecode = scanner.decodeCanvas(scanner.videoRef.current);
    expect(barcodeDetectMock).toHaveBeenCalledTimes(1);

    let idle = false;
    scanner.waitForDecodeIdle().then(() => {
      idle = true;
    });
    await flush();
    expect(idle).toBe(false);

    resolveLiveDecode([]);
    await act(async () => {
      await externalDecode;
    });

    expect(barcodeDetectMock).toHaveBeenCalledTimes(2);
    expect(idle).toBe(true);
  });

  it("takılı çözüm zaman aşımından sonra yeni çözümü çalıştırır", async () => {
    let resolveStaleDecode;
    barcodeDetectMock
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveStaleDecode = resolve;
        }),
      )
      .mockResolvedValueOnce([{ rawValue: "yeni-kare" }]);
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: BarcodeDetectorMock,
    });

    let scanner;
    render(<Harness onReady={(value) => { scanner = value; }} />);
    await flush();
    expect(barcodeDetectMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAMERA_DECODE_TIMEOUT_MS);
    });
    scanner.stopScanning();

    await expect(scanner.decodeCanvas(scanner.videoRef.current)).resolves.toBe("yeni-kare");

    resolveStaleDecode([]);
    await flush();

    expect(barcodeDetectMock).toHaveBeenCalledTimes(2);
    expect(jsQrMock).not.toHaveBeenCalled();
  });

  it("aynı boyuttaki kamera karelerinde tuvali yeniden boyutlandırmaz", async () => {
    let scanner;
    render(<Harness onReady={(value) => { scanner = value; }} />);
    await flush();
    scanner.stopScanning();

    const canvas = scanner.canvasRef.current;
    let width = canvas.width;
    let height = canvas.height;
    let widthSetCount = 0;
    let heightSetCount = 0;
    Object.defineProperty(canvas, "width", {
      configurable: true,
      get: () => width,
      set: (value) => {
        width = value;
        widthSetCount += 1;
      },
    });
    Object.defineProperty(canvas, "height", {
      configurable: true,
      get: () => height,
      set: (value) => {
        height = value;
        heightSetCount += 1;
      },
    });

    await scanner.decodeCanvas(scanner.videoRef.current);
    await scanner.decodeCanvas(scanner.videoRef.current);

    expect({ width, height }).toEqual({ width: 640, height: 360 });
    expect(widthSetCount).toBe(0);
    expect(heightSetCount).toBe(0);
  });
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
