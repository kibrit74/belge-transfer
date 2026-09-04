import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ColorQrLabPage from "../ColorQrLabPage.jsx";
import { createFountainEncoder } from "../optical/fountain.js";
import { createColorPackageV2 } from "../optical/color-package-v2.js";

const scannerHarness = vi.hoisted(() => ({
  options: null,
  scanSnapshot: vi.fn(),
  stopCamera: vi.fn(),
}));
const ownedWorkerHarness = vi.hoisted(() => ({ clients: [], factory: vi.fn() }));
const packageHarness = vi.hoisted(() => ({ actualOpen: null, open: vi.fn() }));
const videoHarness = vi.hoisted(() => ({
  decode: vi.fn(),
  record: vi.fn(),
}));
const renderColorMatrixV2Mock = vi.hoisted(() => vi.fn(() => ({
  dimension: 31,
  cellSize: 8,
  size: 248,
})));

vi.mock("../hooks/useColorQrScanner.js", () => ({
  useColorQrScanner: vi.fn((options) => {
    scannerHarness.options = options;
    return {
      videoRef: { current: null },
      error: null,
      isScanning: false,
      restartCamera: vi.fn(),
      scanSnapshot: scannerHarness.scanSnapshot,
      stopCamera: scannerHarness.stopCamera,
    };
  }),
}));

vi.mock("../optical/color-matrix-canvas.js", () => ({
  renderColorMatrixV2: renderColorMatrixV2Mock,
}));

vi.mock("../workers/color-qr-client.js", () => ({
  createColorQrWorkerClient: ownedWorkerHarness.factory,
}));

vi.mock("../video/create-color-qr-video.js", () => ({
  recordPreparedColorSession: videoHarness.record,
}));

vi.mock("../video/decode-color-qr-video.js", () => ({
  decodeColorQrVideo: videoHarness.decode,
}));

vi.mock("../optical/color-package-v2.js", async (importOriginal) => {
  const actual = await importOriginal();
  packageHarness.actualOpen = actual.openColorPackageV2;
  return {
    ...actual,
    openColorPackageV2: (...args) => packageHarness.open(...args),
  };
});

describe("ColorQrLabPage UI", () => {
  let anchorClickMock;

  beforeEach(() => {
    scannerHarness.options = null;
    scannerHarness.scanSnapshot.mockReset().mockResolvedValue(null);
    scannerHarness.stopCamera.mockReset();
    renderColorMatrixV2Mock.mockClear();
    packageHarness.open.mockReset();
    packageHarness.open.mockImplementation((...args) => packageHarness.actualOpen(...args));
    videoHarness.record.mockReset();
    videoHarness.record.mockResolvedValue({
      blob: new Blob(["color-video"], { type: "video/webm" }),
      durationSeconds: 3,
      mimeType: "video/webm",
      profileId: "color_balanced",
      isColor: true,
    });
    videoHarness.decode.mockReset();
    ownedWorkerHarness.clients = [];
    ownedWorkerHarness.factory.mockReset();
    ownedWorkerHarness.factory.mockImplementation(() => {
      const client = fakeColorWorker();
      const preparePackage = client.preparePackage.getMockImplementation();
      let terminated = false;
      client.preparePackage.mockImplementation((...args) => (
        terminated
          ? Promise.reject(Object.assign(new Error("terminated"), { code: "WORKER_TERMINATED" }))
          : preparePackage(...args)
      ));
      client.terminate.mockImplementation(() => { terminated = true; });
      ownedWorkerHarness.clients.push(client);
      return client;
    });
    anchorClickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:verified-color-qr"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,qr");
  });

  it("laboratuvar sayfasını ve renkli QR bileşenlerini hatasız render eder", () => {
    render(<ColorQrLabPage workerClient={fakeColorWorker()} />);
    expect(screen.getByText(/Renkli QR \(Color Matrix\) Laboratuvarı/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gönder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Al" })).toBeInTheDocument();
  });

  it("sekme değiştirildiğinde Al sekmesini ve yöntem seçicilerini doğru render eder", () => {
    render(<ColorQrLabPage workerClient={fakeColorWorker()} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));
    expect(screen.getByText(/Kameradan tara/i)).toBeInTheDocument();
    expect(screen.getByText(/QR görsel\/video yükle/i)).toBeInTheDocument();
    expect(screen.getByText(/Fotoğraf Çek ve Tara/i)).toBeInTheDocument();
  });

  it("StrictMode etkisi yeniden kurulduktan sonra canlı sahip olunan Worker ile hazırlamaya devam eder", async () => {
    const { unmount } = render(
      <StrictMode>
        <ColorQrLabPage />
      </StrictMode>,
    );

    const input = await screen.findByLabelText("Renkli QR ile gönderilecek belge");
    fireEvent.change(input, { target: { files: [testFile(24, "strict.txt")] } });

    expect(await screen.findByText("1 ana sembol · 1 kurtarma sembolü")).toBeInTheDocument();
    const activeClient = ownedWorkerHarness.clients.at(-1);
    expect(activeClient.preparePackage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: "strict.txt" }),
    );
    expect(activeClient.terminate).not.toHaveBeenCalled();

    unmount();
  });

  it("Worker desteklenmiyorsa mount ve dosya seçiminden sonra kalıcı kullanıcı hatası gösterir", async () => {
    const unsupported = Object.assign(
      new Error("Bu tarayıcı renkli QR işlemlerini desteklemiyor."),
      { code: "COLOR_UNSUPPORTED" },
    );
    ownedWorkerHarness.factory.mockImplementation(() => { throw unsupported; });
    render(<ColorQrLabPage />);

    expect(await screen.findByText("Bu tarayıcı renkli QR işlemlerini desteklemiyor.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Renkli QR ile gönderilecek belge"), {
      target: { files: [testFile(24, "desteklenmeyen.txt")] },
    });

    expect(await screen.findByText("Bu tarayıcı renkli QR işlemlerini desteklemiyor.")).toBeInTheDocument();
    expect(screen.queryByText("Hazırlanıyor...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Görsel indir (PNG)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cihazda paylaş" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Panoya kopyala" })).toBeDisabled();
    expect(ownedWorkerHarness.clients).toHaveLength(0);
  });

  it("hazırlanan aktarımda sıkıştırma ve sembol sayılarını gösterir", async () => {
    const workerClient = fakeColorWorker({ sourceCount: 1, emittedSymbols: 2, savedPercent: 96 });
    render(<ColorQrLabPage workerClient={workerClient} />);

    fireEvent.change(screen.getByLabelText("Renkli QR ile gönderilecek belge"), {
      target: { files: [testFile(100 * 1024, "metin.txt")] },
    });

    expect(await screen.findByText("%96 daha küçük")).toBeInTheDocument();
    expect(screen.getByText("1 ana sembol · 1 kurtarma sembolü")).toBeInTheDocument();
  });

  it("çok kareli aktarımda tek PNG işlemlerini kapatır", async () => {
    const workerClient = fakeColorWorker({ sourceCount: 2, emittedSymbols: 3 });
    render(<ColorQrLabPage workerClient={workerClient} />);

    fireEvent.change(screen.getByLabelText("Renkli QR ile gönderilecek belge"), {
      target: { files: [testFile(1_000, "kanıt.bin")] },
    });

    expect(await screen.findByRole("button", { name: "Görsel indir (PNG)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Panoya kopyala" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cihazda paylaş" })).toBeDisabled();
    expect(screen.getByText(
      "Bu belge birden fazla renkli kare gerektiriyor; video veya canlı akış kullanın.",
    )).toBeInTheDocument();
  });

  it("tek kare PNG aktarımında animasyon karesi yerine sembol 0'ı yeniden çizer", async () => {
    const workerClient = fakeColorWorker({ sourceCount: 1, emittedSymbols: 2 });
    render(<ColorQrLabPage workerClient={workerClient} />);
    fireEvent.change(screen.getByLabelText("Renkli QR ile gönderilecek belge"), {
      target: { files: [testFile(12, "tek.txt")] },
    });

    const downloadButton = await screen.findByRole("button", { name: "Görsel indir (PNG)" });
    await waitFor(() => expect(downloadButton).toBeEnabled());
    workerClient.getFrame.mockClear();
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(workerClient.getFrame).toHaveBeenCalledWith(expect.any(String), 0);
      expect(anchorClickMock).toHaveBeenCalledTimes(1);
    });
  });

  it("yavaş yeni dosya okunurken eski tek-kare paylaşım işlemlerini hemen kapatır", async () => {
    const workerClient = fakeColorWorker();
    render(<ColorQrLabPage workerClient={workerClient} />);
    const input = screen.getByLabelText("Renkli QR ile gönderilecek belge");
    const downloadButton = await screen.findByRole("button", { name: "Görsel indir (PNG)" });
    await waitFor(() => expect(downloadButton).toBeEnabled());

    const slowBytes = deferred();
    fireEvent.change(input, {
      target: { files: [deferredFile("yavaş.bin", slowBytes.promise)] },
    });

    expect(screen.getByRole("button", { name: "Görsel indir (PNG)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cihazda paylaş" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Panoya kopyala" })).toBeDisabled();
  });

  it("yarışan iki dosya okumasında yalnız son seçimi Worker'a hazırlar", async () => {
    const workerClient = fakeColorWorker();
    render(<ColorQrLabPage workerClient={workerClient} />);
    await screen.findByText("1 ana sembol · 1 kurtarma sembolü");
    workerClient.preparePackage.mockClear();

    const firstBytes = deferred();
    const secondBytes = deferred();
    const input = screen.getByLabelText("Renkli QR ile gönderilecek belge");
    fireEvent.change(input, {
      target: { files: [deferredFile("ilk.bin", firstBytes.promise)] },
    });
    fireEvent.change(screen.getByLabelText("Renkli QR ile gönderilecek belge"), {
      target: { files: [deferredFile("son.bin", secondBytes.promise)] },
    });

    secondBytes.resolve(new Uint8Array([2]).buffer);
    await waitFor(() => expect(workerClient.preparePackage).toHaveBeenCalledTimes(1));
    expect(workerClient.preparePackage).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ name: "son.bin" }),
    );

    firstBytes.resolve(new Uint8Array([1]).buffer);
    await Promise.resolve();
    await Promise.resolve();
    expect(workerClient.preparePackage).toHaveBeenCalledTimes(1);
  });

  it("hash doğrulanmadan belge tamamlandı mesajı veya indirme üretmez", async () => {
    const workerClient = fakeColorWorker();
    render(<ColorQrLabPage workerClient={workerClient} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));

    await emitDecodedFrame({
      protocolVersion: "CRF2",
      transferId: "Ab12Cd34Ef56",
      sourceCount: 1,
      blockBytes: 1,
      originalBytes: 1,
      sha256: "A".repeat(43),
      symbolId: 0,
      data: new Uint8Array([7]),
    });

    expect(screen.queryByText("Belge tamamlandı.")).not.toBeInTheDocument();
    expect(anchorClickMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/bütünlük kontrolü/i)).toBeInTheDocument();
  });

  it("yalnız hash ve CQF2 paketi doğrulandıktan sonra indirme bağlantısını gösterir", async () => {
    const workerClient = fakeColorWorker();
    const transferId = "Ab12Cd34Ef56";
    const created = await createColorPackageV2({
      payload: new TextEncoder().encode("doğrulanmış belge"),
      name: "kanıt.txt",
      type: "text/plain",
      transferId,
    });
    const encoder = await createFountainEncoder(created.containerBytes, {
      transferId,
      blockBytes: 380,
      emissionRatio: 1,
    });
    const symbol = encoder.symbol(0);

    render(<ColorQrLabPage workerClient={workerClient} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));
    await emitDecodedFrame({
      protocolVersion: "CRF2",
      ...encoder.metadata,
      symbolId: symbol.symbolId,
      data: symbol.data,
    });

    expect(await screen.findByText("Belge tamamlandı.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dosyayı aç / indir" })).toHaveAttribute(
      "download",
      "kanıt.txt",
    );
    expect(anchorClickMock).not.toHaveBeenCalled();
  });

  it("yeni alım seçimi eski doğrulama sonucunun yayınlanmasını engeller", async () => {
    const workerClient = fakeColorWorker();
    const frame = await validReceiveFrame();
    const opening = deferred();
    packageHarness.open.mockReturnValueOnce(opening.promise);
    render(<ColorQrLabPage workerClient={workerClient} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));

    const oldVerification = emitDecodedFrame(frame);
    await waitFor(() => expect(packageHarness.open).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /QR görsel\/video yükle/i }));
    fireEvent.change(screen.getByLabelText("Renkli QR görseli veya videosu"), {
      target: { files: [testFile(20, "yeni.webm", "video/webm")] },
    });
    opening.resolve({
      payload: new Uint8Array([9]),
      name: "eski.txt",
      type: "text/plain",
    });
    await oldVerification;

    expect(screen.queryByText("Belge tamamlandı.")).not.toBeInTheDocument();
    expect(screen.queryByText("eski.txt")).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(anchorClickMock).not.toHaveBeenCalled();
  });

  it("URL oluşturulurken unmount olan eski alım sonucunu hemen geri toplar", async () => {
    const workerClient = fakeColorWorker();
    const frame = await validReceiveFrame();
    const view = render(<ColorQrLabPage workerClient={workerClient} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));
    URL.createObjectURL.mockImplementationOnce(() => {
      view.unmount();
      return "blob:stale-result";
    });

    await emitDecodedFrame(frame);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:stale-result");
    expect(anchorClickMock).not.toHaveBeenCalled();
  });

  it("hazırlanmış worker oturumunu kullanarak renkli QR videosu oluşturur", async () => {
    const workerClient = fakeColorWorker({ sourceCount: 2, emittedSymbols: 3 });
    render(<ColorQrLabPage workerClient={workerClient} />);
    await screen.findByText("2 ana sembol · 1 kurtarma sembolü");

    fireEvent.click(screen.getByRole("button", { name: "QR videosu oluştur" }));

    await waitFor(() => expect(videoHarness.record).toHaveBeenCalledWith(expect.objectContaining({
      client: workerClient,
      sessionId: expect.any(String),
      optical: expect.objectContaining({ sourceCount: 2, emittedSymbols: 3 }),
      options: {
        profile: expect.objectContaining({ id: "color_balanced" }),
        signal: expect.any(AbortSignal),
      },
      onProgress: expect.any(Function),
    })));
    expect(await screen.findByRole("link", { name: "Renkli QR videosunu indir" })).toHaveAttribute(
      "href",
      "blob:verified-color-qr",
    );
  });

  it("yeni renkli video URL'si geldiğinde eskisini, unmount sırasında son URL'yi iptal eder", async () => {
    URL.createObjectURL
      .mockReturnValueOnce("blob:ilk-video")
      .mockReturnValueOnce("blob:son-video");
    const view = render(<ColorQrLabPage workerClient={fakeColorWorker()} />);
    await screen.findByText("1 ana sembol · 1 kurtarma sembolü");
    const createButton = screen.getByRole("button", { name: "QR videosu oluştur" });

    fireEvent.click(createButton);
    await screen.findByRole("link", { name: "Renkli QR videosunu indir" });
    fireEvent.click(createButton);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:ilk-video"));
    view.unmount();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:son-video"));
  });

  it("video kaydı sürerken yeni dosya seçilirse geç tamamlanan kaydı yayımlamaz", async () => {
    const recording = deferred();
    videoHarness.record.mockReturnValueOnce(recording.promise);
    render(<ColorQrLabPage workerClient={fakeColorWorker()} />);
    await screen.findByText("1 ana sembol · 1 kurtarma sembolü");
    fireEvent.click(screen.getByRole("button", { name: "QR videosu oluştur" }));
    await waitFor(() => expect(videoHarness.record).toHaveBeenCalledTimes(1));
    const recordingSignal = videoHarness.record.mock.calls[0][0].options.signal;

    fireEvent.change(screen.getByLabelText("Renkli QR ile gönderilecek belge"), {
      target: { files: [testFile(24, "yeni-belge.txt")] },
    });
    expect(recordingSignal.aborted).toBe(true);
    recording.resolve({
      blob: new Blob(["geç-video"], { type: "video/webm" }),
      durationSeconds: 2,
      mimeType: "video/webm",
    });
    await recording.promise;
    await screen.findByText("yeni-belge.txt");
    await Promise.resolve();

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Renkli QR videosunu indir" })).not.toBeInTheDocument();
  });

  it("renkli QR videosunu çözüp CQF2 paketini anahtar ekranı olmadan açar ve oturumu temizler", async () => {
    const workerClient = fakeColorWorker();
    const created = await createColorPackageV2({
      payload: new TextEncoder().encode("video belgesi"),
      name: "video-belgesi.txt",
      type: "text/plain",
      transferId: "Ab12Cd34Ef56",
    });
    videoHarness.decode.mockResolvedValueOnce(created.containerBytes);
    render(<ColorQrLabPage workerClient={workerClient} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));
    fireEvent.click(screen.getByRole("button", { name: /QR görsel\/video yükle/i }));
    fireEvent.change(screen.getByLabelText("Renkli QR görseli veya videosu"), {
      target: { files: [testFile(20, "aktarim.webm", "video/webm")] },
    });

    expect(await screen.findByText("Belge tamamlandı.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dosyayı aç / indir" })).toHaveAttribute(
      "download",
      "video-belgesi.txt",
    );
    expect(screen.queryByText(/paket anahtarı/i)).not.toBeInTheDocument();
    expect(videoHarness.decode).toHaveBeenCalledWith(
      expect.objectContaining({ name: "aktarim.webm" }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
      expect.any(AbortSignal),
      expect.objectContaining({ workerClient, sessionId: expect.any(String) }),
    );
    const decodeSessionId = videoHarness.decode.mock.calls[0][3].sessionId;
    expect(workerClient.disposeSession).toHaveBeenCalledWith(decodeSessionId);
  });

  it("renkli video çözme başarısız olsa da alım oturumunu temizler", async () => {
    const workerClient = fakeColorWorker();
    videoHarness.decode.mockRejectedValueOnce(new Error("Video okunamadı."));
    render(<ColorQrLabPage workerClient={workerClient} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));
    fireEvent.click(screen.getByRole("button", { name: /QR görsel\/video yükle/i }));
    fireEvent.change(screen.getByLabelText("Renkli QR görseli veya videosu"), {
      target: { files: [testFile(20, "bozuk.webm", "video/webm")] },
    });

    expect(await screen.findByText("Video okunamadı.")).toBeInTheDocument();
    const decodeSessionId = videoHarness.decode.mock.calls[0][3].sessionId;
    expect(workerClient.disposeSession).toHaveBeenCalledWith(decodeSessionId);
  });

  it("video çözülürken alım yöntemi değişirse eski işi iptal edip sonucunu yayımlamaz", async () => {
    const decoding = deferred();
    const workerClient = fakeColorWorker();
    videoHarness.decode.mockReturnValueOnce(decoding.promise);
    render(<ColorQrLabPage workerClient={workerClient} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));
    fireEvent.click(screen.getByRole("button", { name: /QR görsel\/video yükle/i }));
    fireEvent.change(screen.getByLabelText("Renkli QR görseli veya videosu"), {
      target: { files: [testFile(20, "aktarim.webm", "video/webm")] },
    });
    await waitFor(() => expect(videoHarness.decode).toHaveBeenCalledTimes(1));
    const [, , signal, options] = videoHarness.decode.mock.calls[0];

    fireEvent.click(screen.getByRole("button", { name: /Kameradan tara/i }));

    expect(signal.aborted).toBe(true);
    expect(workerClient.disposeSession).toHaveBeenCalledWith(options.sessionId);
    decoding.resolve((await createColorPackageV2({
      payload: new Uint8Array([7]),
      name: "eski.txt",
      type: "text/plain",
      transferId: "Ab12Cd34Ef56",
    })).containerBytes);
    await decoding.promise;
    await Promise.resolve();

    expect(screen.queryByText("Belge tamamlandı.")).not.toBeInTheDocument();
    expect(screen.queryByText("eski.txt")).not.toBeInTheDocument();
  });

  it("eski fotoğraf taraması yöntem değişiminden sonra meşgul durumunu taşımaz", async () => {
    const snapshot = deferred();
    scannerHarness.scanSnapshot.mockReturnValueOnce(snapshot.promise);
    render(<ColorQrLabPage workerClient={fakeColorWorker()} />);
    fireEvent.click(screen.getByRole("button", { name: "Al" }));
    fireEvent.click(screen.getByRole("button", { name: "Fotoğraf Çek ve Tara" }));
    expect(screen.getByRole("button", { name: "Fotoğraf analiz ediliyor..." })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /QR görsel\/video yükle/i }));
    fireEvent.click(screen.getByRole("button", { name: /Kameradan tara/i }));

    expect(screen.getByRole("button", { name: "Fotoğraf Çek ve Tara" })).toBeEnabled();
    snapshot.resolve(null);
    await snapshot.promise;
  });
});

function fakeColorWorker({ sourceCount = 1, emittedSymbols = 2, savedPercent = 0 } = {}) {
  const originalSize = 100 * 1024;
  const storedSize = Math.round(originalSize * (1 - savedPercent / 100));
  return {
    preparePackage: vi.fn().mockResolvedValue({
      transferId: "Ab12Cd34Ef56",
      sourceCount,
      emittedSymbols,
      blockBytes: 380,
      originalBytes: storedSize,
      compressionStats: {
        compression: savedPercent > 0 ? "zlib" : "none",
        originalSize,
        storedSize,
        savedBytes: originalSize - storedSize,
        savedPercent,
      },
    }),
    getFrame: vi.fn().mockResolvedValue({ frameBytes: new Uint8Array([1, 2, 3]) }),
    decodeImage: vi.fn().mockResolvedValue(null),
    disposeSession: vi.fn(),
    terminate: vi.fn(),
  };
}

function testFile(size, name, type = "application/octet-stream") {
  const bytes = new Uint8Array(size).fill(65);
  const file = new File([bytes], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: vi.fn().mockResolvedValue(bytes.buffer),
  });
  return file;
}

function deferredFile(name, arrayBufferPromise, type = "application/octet-stream") {
  const file = new File([new Uint8Array([0])], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: vi.fn(() => arrayBufferPromise),
  });
  return file;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function validReceiveFrame() {
  const transferId = "Ab12Cd34Ef56";
  const created = await createColorPackageV2({
    payload: new TextEncoder().encode("gecikmiş belge"),
    name: "eski.txt",
    type: "text/plain",
    transferId,
  });
  const encoder = await createFountainEncoder(created.containerBytes, {
    transferId,
    blockBytes: 380,
    emissionRatio: 1,
  });
  const symbol = encoder.symbol(0);
  return {
    protocolVersion: "CRF2",
    ...encoder.metadata,
    symbolId: symbol.symbolId,
    data: symbol.data,
  };
}

async function emitDecodedFrame(frame) {
  await scannerHarness.options.onFrame({ frame });
}
