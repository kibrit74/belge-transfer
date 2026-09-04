import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLOR_SCAN_INTERVAL_MS,
  useColorQrScanner,
} from "../hooks/useColorQrScanner.js";

function Harness({
  enabled = true,
  paused = false,
  facingMode = "environment",
  sessionId = "session-1",
  workerClient,
  onFrame,
  onReady,
  scanIntervalMs,
}) {
  const scanner = useColorQrScanner({
    enabled,
    paused,
    facingMode,
    sessionId,
    workerClient,
    onFrame,
    scanIntervalMs,
  });

  useEffect(() => {
    onReady?.(scanner);
  }, [onReady, scanner]);

  return (
    <>
      {scanner.error && <p>{scanner.error}</p>}
      <output data-testid="scanning">{String(scanner.isScanning)}</output>
      <video ref={scanner.videoRef} muted playsInline />
    </>
  );
}

describe("useColorQrScanner", () => {
  let context;
  let stop;
  let stream;

  beforeEach(() => {
    vi.useFakeTimers();
    stop = vi.fn();
    stream = { getTracks: () => [{ stop }] };

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1920);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(1080);

    context = {
      drawImage: vi.fn(),
      getImageData: vi.fn((x, y, width, height) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      })),
      imageSmoothingEnabled: true,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ilk decode bitmeden ikinci analizi başlatmaz", async () => {
    const firstDecode = deferred();
    const workerClient = {
      decodeImage: vi.fn()
        .mockImplementationOnce(() => firstDecode.promise)
        .mockResolvedValue(null),
    };

    render(
      <Harness workerClient={workerClient} onFrame={vi.fn()} scanIntervalMs={1} />,
    );
    await flush();

    expect(COLOR_SCAN_INTERVAL_MS).toBe(167);
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(1);

    firstDecode.resolve(null);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COLOR_SCAN_INTERVAL_MS - 1);
    });
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(2);
  });

  it("eski oturumun geç dönen sonucunu onFrame'e göndermez", async () => {
    const oldDecode = deferred();
    const workerClient = {
      decodeImage: vi.fn().mockImplementationOnce(() => oldDecode.promise),
    };
    const onFrame = vi.fn();

    const { rerender } = render(
      <Harness sessionId="session-old" workerClient={workerClient} onFrame={onFrame} />,
    );
    await flush();

    rerender(
      <Harness sessionId="session-new" workerClient={workerClient} onFrame={onFrame} />,
    );
    await flush();

    oldDecode.resolve({ frameId: 4 });
    await flush();

    expect(workerClient.decodeImage).toHaveBeenCalledWith(
      "session-old",
      expect.objectContaining({ width: 1280, height: 720 }),
    );
    expect(onFrame).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COLOR_SCAN_INTERVAL_MS);
    });
    expect(workerClient.decodeImage).toHaveBeenLastCalledWith(
      "session-new",
      expect.any(Object),
    );
  });

  it("izin reddinden sonra restartCamera ile yeniden deneyip hatayı temizler", async () => {
    const permissionError = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    navigator.mediaDevices.getUserMedia
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(stream);
    const workerClient = { decodeImage: vi.fn().mockResolvedValue(null) };
    let scanner;

    render(
      <Harness
        workerClient={workerClient}
        onFrame={vi.fn()}
        onReady={(value) => { scanner = value; }}
      />,
    );
    await flush();

    expect(screen.getByText(/Kamera izni verilmedi/i)).toBeInTheDocument();
    expect(screen.getByTestId("scanning")).toHaveTextContent("false");

    await act(async () => {
      await scanner.restartCamera();
    });
    await flush();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Kamera izni verilmedi/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("scanning")).toHaveTextContent("true");
  });

  it("unmount sırasında her track'i bir kez durdurup zamanlayıcıyı temizler", async () => {
    const workerClient = { decodeImage: vi.fn().mockResolvedValue(null) };
    const { container, unmount } = render(
      <Harness workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();

    const video = container.querySelector("video");
    expect(video.srcObject).toBe(stream);

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disabled ve paused durumunda yeni decode başlatmaz", async () => {
    const workerClient = { decodeImage: vi.fn().mockResolvedValue(null) };
    const { rerender } = render(
      <Harness enabled={false} workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();

    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(workerClient.decodeImage).not.toHaveBeenCalled();

    rerender(
      <Harness enabled paused workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(workerClient.decodeImage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("yakalanan kareyi oranı bozmadan 1280x720 sınırına indirir", async () => {
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(4000);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(2000);
    const workerClient = { decodeImage: vi.fn().mockResolvedValue(null) };

    render(<Harness workerClient={workerClient} onFrame={vi.fn()} />);
    await flush();

    expect(workerClient.decodeImage).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ width: 1280, height: 640 }),
    );
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.any(HTMLVideoElement),
      0,
      0,
      1280,
      640,
    );
    expect(context.imageSmoothingEnabled).toBe(false);
  });

  it("scanSnapshot canlı decode sürerken ikinci worker çağrısı açmaz", async () => {
    const activeDecode = deferred();
    const workerClient = { decodeImage: vi.fn(() => activeDecode.promise) };
    let scanner;
    render(
      <Harness
        workerClient={workerClient}
        onFrame={vi.fn()}
        onReady={(value) => { scanner = value; }}
      />,
    );
    await flush();

    await expect(scanner.scanSnapshot()).resolves.toBeNull();
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(1);

    activeDecode.resolve(null);
    await flush();
  });

  it("snapshot ve canlı tarama arasında ortak 167 ms hız kapısı uygular", async () => {
    const firstDecode = deferred();
    const workerClient = {
      decodeImage: vi.fn()
        .mockImplementationOnce(() => firstDecode.promise)
        .mockResolvedValue(null),
    };
    let scanner;
    render(
      <Harness
        workerClient={workerClient}
        onFrame={vi.fn()}
        onReady={(value) => { scanner = value; }}
      />,
    );
    await flush();
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(1);

    firstDecode.resolve(null);
    await flush();

    await expect(scanner.scanSnapshot()).resolves.toBeNull();
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COLOR_SCAN_INTERVAL_MS - 1);
    });
    await expect(scanner.scanSnapshot()).resolves.toBeNull();
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(2);

    await expect(scanner.scanSnapshot()).resolves.toBeNull();
    expect(workerClient.decodeImage).toHaveBeenCalledTimes(2);
  });

  it("bekleyen eski kamera isteğinde oturum değişirse güncel kamera isteğini başlatır", async () => {
    const oldRequest = deferred();
    const oldStop = vi.fn();
    const newStop = vi.fn();
    const oldStream = { getTracks: () => [{ stop: oldStop }] };
    const newStream = { getTracks: () => [{ stop: newStop }] };
    navigator.mediaDevices.getUserMedia
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce(newStream);
    const workerClient = { decodeImage: vi.fn().mockResolvedValue(null) };

    const { container, rerender } = render(
      <Harness sessionId="session-old" workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    rerender(
      <Harness sessionId="session-new" workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);

    oldRequest.resolve(oldStream);
    await flush();

    expect(oldStop).toHaveBeenCalledTimes(1);
    expect(newStop).not.toHaveBeenCalled();
    expect(container.querySelector("video").srcObject).toBe(newStream);
    expect(screen.getByTestId("scanning")).toHaveTextContent("true");
    expect(workerClient.decodeImage).toHaveBeenCalledWith(
      "session-new",
      expect.any(Object),
    );
  });

  it("disabled olduğunda aktif kamerayı ve tarama durumunu temizler", async () => {
    const workerClient = { decodeImage: vi.fn().mockResolvedValue(null) };
    const { container, rerender } = render(
      <Harness workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();
    expect(screen.getByTestId("scanning")).toHaveTextContent("true");

    rerender(
      <Harness enabled={false} workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(container.querySelector("video").srcObject).toBeNull();
    expect(screen.getByTestId("scanning")).toHaveTextContent("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("paused olduğunda kamera açık kalsa da isScanning false olur", async () => {
    const workerClient = { decodeImage: vi.fn().mockResolvedValue(null) };
    const { container, rerender } = render(
      <Harness workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();

    rerender(
      <Harness paused workerClient={workerClient} onFrame={vi.fn()} />,
    );
    await flush();

    expect(container.querySelector("video").srcObject).toBe(stream);
    expect(stop).not.toHaveBeenCalled();
    expect(screen.getByTestId("scanning")).toHaveTextContent("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("STALE_SESSION hatasını yoksayar, diğer decode hatalarını Türkçe gösterir", async () => {
    const staleError = Object.assign(new Error("stale"), { code: "STALE_SESSION" });
    const workerClient = {
      decodeImage: vi.fn()
        .mockRejectedValueOnce(staleError)
        .mockRejectedValueOnce(new Error("worker failed")),
    };

    render(<Harness workerClient={workerClient} onFrame={vi.fn()} />);
    await flush();
    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COLOR_SCAN_INTERVAL_MS);
    });

    expect(screen.getByText(/Renkli QR karesi çözümlenemedi/i)).toBeInTheDocument();
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}
