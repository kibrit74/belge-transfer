import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createQrVideoMock, decodeQrVideoMock, decryptContainerMock, finalizeTransferMock, recordReceiveMock, reserveTransferMock, sha256Mock } = vi.hoisted(() => ({
  createQrVideoMock: vi.fn(),
  decodeQrVideoMock: vi.fn(),
  decryptContainerMock: vi.fn(),
  finalizeTransferMock: vi.fn(),
  recordReceiveMock: vi.fn(),
  reserveTransferMock: vi.fn(),
  sha256Mock: vi.fn(),
}));

vi.mock("../transfer/activity-client.js", () => ({
  completeTransferActivity: finalizeTransferMock,
  recordTransferActivity: vi.fn(),
  recordReceiveActivity: (...args) => {
    recordReceiveMock(...args);
    return globalThis.fetch("/api/transfers", { method: "POST" });
  },
  reserveTransferActivity: reserveTransferMock,
}));

vi.mock("../video/create-qr-video.js", () => ({
  createQrVideo: createQrVideoMock,
}));

vi.mock("../video/decode-qr-video.js", () => ({
  decodeQrVideo: decodeQrVideoMock,
}));

vi.mock("../crypto/encrypted-container.js", async (importOriginal) => ({
  ...(await importOriginal()),
  decryptContainer: decryptContainerMock,
}));

vi.mock("../protocol/hash.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sha256Base64Url: sha256Mock,
  };
});

import VideoTransferPanel from "../VideoTransferPanel";

const SECRET_KEY = "videoGizliAnahtar123456789012345";

function confirmKeySafety() {
  fireEvent.click(screen.getByRole("checkbox", { name: /anahtarı ayrı/i }));
}

describe("VideoTransferPanel UI", () => {
  let createObjectUrlMock;
  let revokeObjectUrlMock;
  let anchorClickMock;

  beforeEach(() => {
    createObjectUrlMock = vi.fn().mockReturnValue("blob:video-adresi");
    revokeObjectUrlMock = vi.fn();
    anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlMock,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue() },
    });
    sha256Mock.mockResolvedValue("ornek-video-sha256");
    reserveTransferMock.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    finalizeTransferMock.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    createQrVideoMock.mockResolvedValue({
      blob: new Blob(["video-bytes"], { type: "video/webm" }),
      keyText: SECRET_KEY,
      transferId: "Vid123456789",
      sha256: "ornek-video-sha256",
      durationSeconds: 6,
      mimeType: "video/webm",
    });
    decodeQrVideoMock.mockResolvedValue(new Uint8Array([66, 84, 65, 49]));
    decryptContainerMock.mockResolvedValue({
      file: new File(["doğrulanmış dosya"], "belge.pdf", { type: "application/pdf" }),
      sha256: "dogrulanmis-video-ozeti",
    });
  });

  it("aylık kota aşıldığında QR video üretimini başlatmaz", async () => {
    reserveTransferMock.mockRejectedValueOnce(new Error("Bu aktarım aylık paket kotanızı aşıyor."));
    render(<VideoTransferPanel view="create" user={{ id: "user-1", plan: "standard" }} />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["içerik"], "belge.pdf", { type: "application/pdf" })] },
    });
    confirmKeySafety();
    await waitFor(() => expect(screen.getByRole("button", { name: "QR video oluştur" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    expect(await screen.findByText("Bu aktarım aylık paket kotanızı aşıyor.")).toBeInTheDocument();
    expect(createQrVideoMock).not.toHaveBeenCalled();
  });

  afterEach(() => {
    cleanup();
    anchorClickMock.mockRestore();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
    vi.clearAllMocks();
  });

  it("QR videoyu belge olarak gönderme rehberini ve dosya seçiciyi gösterir", () => {
    render(<VideoTransferPanel />);

    expect(screen.getByRole("heading", { name: "QR videoyu doğru gönder" })).toBeInTheDocument();
    expect(screen.getByText("QR videoyu oluştur", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Ataç → Belge / Dosya", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Alıcı QR videoyu açar", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Galeriden video olarak gönderme")).toBeInTheDocument();
    expect(screen.getByText("Belge / Dosya olarak gönder")).toBeInTheDocument();
    expect(screen.getByText(/Anahtarı video ile aynı mesajda değil/)).toBeInTheDocument();
    expect(screen.getByLabelText("QR video yapılacak belge")).toBeInTheDocument();
  });

  it("açma görünümünde yalnız QR video seçimini gösterir", () => {
    render(<VideoTransferPanel view="open" />);

    expect(screen.getByLabelText("Çözülecek QR video")).toBeInTheDocument();
    expect(screen.queryByLabelText("QR video yapılacak belge")).not.toBeInTheDocument();
  });

  it("oluşturma görünümünde yalnız belge seçimini gösterir", () => {
    render(<VideoTransferPanel view="create" />);

    expect(screen.getByLabelText("QR video yapılacak belge")).toBeInTheDocument();
    expect(screen.queryByLabelText("Çözülecek QR video")).not.toBeInTheDocument();
  });

  it("QR video için en fazla 15 dosyaya izin verir", () => {
    render(<VideoTransferPanel view="create" />);

    expect(screen.getByLabelText("QR video yapılacak belge")).toHaveAttribute("multiple");
    expect(screen.getByText(/En fazla 15 dosya · toplam 15 MiB/)).toBeInTheDocument();
  });

  it("misafir kullanıcıya da çoklu QR Video seçimi sunar", () => {
    render(<VideoTransferPanel view="create" user={null} />);

    expect(screen.getByLabelText("QR video yapılacak belge")).toHaveAttribute("multiple");
    expect(screen.getByText(/En fazla 15 dosya · toplam 15 MiB/)).toBeInTheDocument();
  });

  it("çoklu seçimde dosyaları listeler ve istenen dosyayı kaldırır", async () => {
    render(<VideoTransferPanel view="create" />);
    const files = [new File(["ilk"], "ilk.pdf"), new File(["ikinci"], "ikinci.docx")];

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), { target: { files } });

    expect(await screen.findByText("ilk.pdf")).toBeInTheDocument();
    expect(screen.getByText("ikinci.docx")).toBeInTheDocument();
    expect(screen.getByText("2 dosya")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ikinci.docx dosyasını kaldır" }));

    await waitFor(() => expect(screen.queryByText("ikinci.docx")).not.toBeInTheDocument());
    expect(screen.getByText("1 dosya")).toBeInTheDocument();
  });

  it("dosya seçilince dosya adı ve SHA-256 özetini gösterir", async () => {
    render(<VideoTransferPanel />);
    const file = new File(["delil-video"], "belge.pdf", { type: "application/pdf" });

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("belge.pdf")).toBeInTheDocument();
    expect(await screen.findByText("ornek-video-sha256")).toBeInTheDocument();
  });

  it("StrictMode yeniden bağlanmasından sonra SHA-256 sonucunu gösterir", async () => {
    render(
      <StrictMode>
        <VideoTransferPanel />
      </StrictMode>,
    );
    const file = new File(["delil-video"], "belge.pdf", { type: "application/pdf" });

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("ornek-video-sha256")).toBeInTheDocument();
  });

  it("SHA-256 hesabı bitmeden QR video oluşturma düğmesini devre dışı bırakır", async () => {
    sha256Mock.mockImplementation(() => new Promise(() => {}));
    render(<VideoTransferPanel />);
    const file = new File(["delil-video"], "belge.pdf", { type: "application/pdf" });

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("Hesaplanıyor...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "QR video oluştur" })).toBeDisabled();
  });

  it("dosyaların toplamı 15 MiB üzerindeyse hata gösterir ve butonu devre dışı bırakır", async () => {
    render(<VideoTransferPanel />);
    const files = [
      new File([new Uint8Array(8 * 1024 * 1024)], "bir.bin"),
      new File([new Uint8Array(7 * 1024 * 1024 + 1)], "iki.bin"),
    ];

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files },
    });

    expect(
      await screen.findByText(
        'QR Video için toplam boyut en fazla 15 MiB olabilir.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "QR video oluştur" })).toBeDisabled();
  });

  it("çoklu seçimde QR video oluşturucuya ZIP dosyası verir", async () => {
    render(<VideoTransferPanel view="create" />);
    const files = [new File(["ilk"], "ilk.txt"), new File(["ikinci"], "ikinci.txt")];

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), { target: { files } });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    await screen.findByRole("link", { name: "QR videoyu indir (.webm)" });
    expect(createQrVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/^toplu-aktarim-.*\.zip$/) }),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("500 KB - 2 MB arası dosyada süre uyarısı gösterir", async () => {
    render(<VideoTransferPanel />);
    const mediumBytes = new Uint8Array(600 * 1024);
    const file = new File([mediumBytes], "orta.pdf");

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [file] },
    });

    expect(await screen.findByText(/Tahmini süre: yaklaşık .* saniye/)).toBeInTheDocument();
  });

  it("QR video oluşturunca indirme linki ve anahtarı kopyala butonunu gösterir", async () => {
    render(<VideoTransferPanel />);
    const file = new File(["delil"], "belge.pdf");

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [file] },
    });
    await screen.findByText("ornek-video-sha256");

    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    const link = await screen.findByRole("link", { name: "QR videoyu indir (.webm)" });
    expect(link).toHaveAttribute("download", "belgeaktar-Vid123456789.webm");
    expect(link).toHaveAttribute("href", "blob:video-adresi");
    expect(screen.getByText(/Ataç → Belge \/ Dosya seç/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Videoyu paylaş" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anahtarı kopyala" })).toBeInTheDocument();
  });

  it("paylaşım izni reddedilince ham hatayı göstermeden indirme seçeneğine yönlendirir", async () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")),
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    render(<VideoTransferPanel view="create" user={{ id: "user-1" }} />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    fireEvent.click(await screen.findByRole("button", { name: "Videoyu paylaş" }));

    expect(await screen.findByText("Paylaşım menüsü açılamadı; video otomatik indirildi. Dosyayı mesajlaşma uygulamasından belge olarak paylaşabilirsin."))
      .toBeInTheDocument();
    expect(screen.queryByText("Permission denied")).not.toBeInTheDocument();
  });

  it("kesinleştirme kalıcı kuyruğa yazılmadan QR video sonucunu sunmaz; başarısızlıkta paketi uyarıyla korur", async () => {
    const delayedFinalization = deferred();
    finalizeTransferMock.mockReset().mockReturnValueOnce(delayedFinalization.promise);
    render(<VideoTransferPanel view="create" user={{ id: "user-1" }} />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));
    await waitFor(() => expect(finalizeTransferMock).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("link", { name: "QR videoyu indir (.webm)" })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    delayedFinalization.resolve(null);
    expect(await screen.findByRole("link", { name: "QR videoyu indir (.webm)" })).toBeInTheDocument();
    expect(await screen.findByText(/UYARI: Aylık kullanım kaydı şu anda doğrulanamadı\./)).toBeInTheDocument();
  });

  it("kalıcı depolar ve sunucu kesinleştirmesi başarısızsa QR video sonucunu sunmaz", async () => {
    finalizeTransferMock
      .mockRejectedValueOnce(new Error("Aylık kullanım kaydı güvenceye alınamadı."))
      .mockResolvedValueOnce(null);
    render(<VideoTransferPanel view="create" user={{ id: "user-1" }} />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    expect(await screen.findByText("Aylık kullanım kaydı güvenceye alınamadı.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "QR videoyu indir (.webm)" })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("kesinleştirme beklerken yeni dosya seçilirse eski QR video sonucunu sunmaz", async () => {
    const delayedFinalization = deferred();
    finalizeTransferMock.mockReset().mockReturnValueOnce(delayedFinalization.promise);
    render(<VideoTransferPanel view="create" user={{ id: "user-1" }} />);
    const input = screen.getByLabelText("QR video yapılacak belge");
    fireEvent.change(input, { target: { files: [new File(["ilk"], "ilk.pdf")] } });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));
    await waitFor(() => expect(finalizeTransferMock).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { files: [new File(["ikinci"], "ikinci.pdf")] } });
    delayedFinalization.resolve({ id: "reservation-1", status: "completed" });

    await waitFor(() => expect(screen.getByText("ikinci.pdf")).toBeInTheDocument());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "QR videoyu indir (.webm)" })).not.toBeInTheDocument();
  });

  it("renkli video üretirken yeni dosya seçilirse sahip olduğu üretimi iptal eder", async () => {
    const creating = deferred();
    createQrVideoMock.mockReturnValueOnce(creating.promise);
    render(<VideoTransferPanel view="create" />);
    const input = screen.getByLabelText("QR video yapılacak belge");
    fireEvent.change(input, { target: { files: [new File(["ilk"], "ilk.pdf")] } });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));
    await waitFor(() => expect(createQrVideoMock).toHaveBeenCalledTimes(1));
    const signal = createQrVideoMock.mock.calls[0][1].signal;

    fireEvent.change(input, { target: { files: [new File(["yeni"], "yeni.pdf")] } });

    expect(signal.aborted).toBe(true);
    creating.reject(Object.assign(new Error("iptal"), { code: "ABORTED" }));
    await creating.promise.catch(() => {});
  });

  it("oluşturulan QR videoyu sınırlı önizleme alanında gösterir", async () => {
    render(<VideoTransferPanel />);
    const file = new File(["delil"], "belge.pdf");

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [file] },
    });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    const preview = await screen.findByLabelText("Oluşturulan QR video önizlemesi");
    expect(preview).toHaveAttribute("playsinline");
    expect(preview.closest(".video-result-card")).toBeInTheDocument();
  });

  it("anahtarı kopyala butonuna basılınca panoya kopyalar", async () => {
    render(<VideoTransferPanel />);
    const file = new File(["delil"], "belge.pdf");

    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [file] },
    });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    fireEvent.click(await screen.findByRole("button", { name: "Anahtarı kopyala" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SECRET_KEY);
    });
    expect(screen.getByText("Anahtar panoya kopyalandı.")).toBeInTheDocument();
  });

  it("ilk adımı dosya indirme değil video tarama olarak açıklar", () => {
    render(<VideoTransferPanel view="open" />);

    expect(screen.getByRole("button", { name: "QR videoyu tara" })).toBeInTheDocument();
  });

  it("tarama sırasında gerçek yüzdeyi düğmede gösterir", async () => {
    let resolveDecode;
    decodeQrVideoMock.mockImplementation((_file, callbacks) => {
      callbacks.onScanProgress({ percent: 42, currentTime: 4.2, duration: 10 });
      return new Promise((resolve) => {
        resolveDecode = resolve;
      });
    });

    render(<VideoTransferPanel view="open" />);
    const videoFile = new File(["qr-video"], "aktarim.webm", { type: "video/webm" });

    fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
      target: { files: [videoFile] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));

    const scanningButton = await screen.findByRole("button", {
      name: "Video taranıyor... %42",
    });
    expect(scanningButton).toBeDisabled();

    resolveDecode(new Uint8Array([66, 84, 65, 49]));
  });

  it("ana QR Video ekranında renkli video probunu kapatır", async () => {
    render(<VideoTransferPanel view="open" />);
    const video = new File(["video"], "aktarim.webm", { type: "video/webm" });

    fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
      target: { files: [video] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));

    await waitFor(() => expect(decodeQrVideoMock).toHaveBeenCalledWith(
      video,
      expect.any(Object),
      expect.any(AbortSignal),
      expect.objectContaining({ allowColor: false }),
    ));
  });

  it("tarama üç dakikayı aşınca geçen süreyi ve pratik yöntemi gösterir", async () => {
    vi.useFakeTimers();
    const scan = deferred();
    decodeQrVideoMock.mockReturnValueOnce(scan.promise);

    try {
      render(<VideoTransferPanel view="open" />);
      fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
        target: { files: [new File(["video"], "aktarim.webm", { type: "video/webm" })] },
      });
      fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(181_000);
      });

      expect(screen.getByText("Geçen süre: 3:01")).toBeInTheDocument();
      expect(screen.getByText(
        "Bu cihazda QR Video taraması uzun sürüyor. Büyük dosyalarda Şifreli Paket daha hızlıdır.",
      )).toBeInTheDocument();

      scan.resolve(new Uint8Array([66, 84, 65, 49]));
      await act(async () => { await scan.promise; });
    } finally {
      vi.useRealTimers();
    }
  });

  it("anahtar doğrulamasından sonra özgün dosyayı otomatik indirir", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    render(<VideoTransferPanel view="open" />);
    const videoFile = new File(["qr-video"], "aktarim.webm", { type: "video/webm" });

    fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
      target: { files: [videoFile] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));

    const keyField = await screen.findByLabelText("Video paket anahtarı");
    fireEvent.change(keyField, { target: { value: SECRET_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Dosyayı doğrula ve indir" }));

    const link = await screen.findByRole("link", { name: "Özgün dosyayı indir" });
    expect(link).toHaveAttribute("download", "belge.pdf");
    expect(anchorClickMock).toHaveBeenCalledTimes(1);
    expect(recordReceiveMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("şifre çözme beklerken yeni video seçilirse eski sonucu indirmez", async () => {
    const opening = deferred();
    decryptContainerMock.mockReturnValueOnce(opening.promise);
    render(<VideoTransferPanel view="open" />);
    const input = screen.getByLabelText("Çözülecek QR video");
    fireEvent.change(input, {
      target: { files: [new File(["ilk"], "ilk.webm", { type: "video/webm" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));
    const keyField = await screen.findByLabelText("Video paket anahtarı");
    fireEvent.change(keyField, { target: { value: SECRET_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Dosyayı doğrula ve indir" }));
    await waitFor(() => expect(decryptContainerMock).toHaveBeenCalledTimes(1));

    fireEvent.change(input, {
      target: { files: [new File(["yeni"], "yeni.webm", { type: "video/webm" })] },
    });
    opening.resolve({ file: new File(["eski"], "eski.pdf"), sha256: "eski-sha" });
    await opening.promise;
    await Promise.resolve();

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(anchorClickMock).not.toHaveBeenCalled();
    expect(screen.queryByText("eski.pdf")).not.toBeInTheDocument();
  });

  it("yeni video tarandığında bekleyen eski açma işlemi doğrula düğmesini kilitlemez", async () => {
    const opening = deferred();
    decryptContainerMock.mockReturnValueOnce(opening.promise);
    render(<VideoTransferPanel view="open" />);
    const input = screen.getByLabelText("Çözülecek QR video");
    fireEvent.change(input, {
      target: { files: [new File(["ilk"], "ilk.webm", { type: "video/webm" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));
    fireEvent.change(await screen.findByLabelText("Video paket anahtarı"), {
      target: { value: SECRET_KEY },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dosyayı doğrula ve indir" }));
    await waitFor(() => expect(decryptContainerMock).toHaveBeenCalledTimes(1));

    fireEvent.change(input, {
      target: { files: [new File(["yeni"], "yeni.webm", { type: "video/webm" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));
    fireEvent.change(await screen.findByLabelText("Video paket anahtarı"), {
      target: { value: SECRET_KEY },
    });

    expect(screen.getByRole("button", { name: "Dosyayı doğrula ve indir" })).toBeEnabled();
  });

  it("aynı video yeniden taranırken önceki açma işleminin sonucunu indirmez", async () => {
    const opening = deferred();
    decryptContainerMock.mockReturnValueOnce(opening.promise);
    render(<VideoTransferPanel view="open" />);
    fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
      target: { files: [new File(["ilk"], "ilk.webm", { type: "video/webm" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));
    fireEvent.change(await screen.findByLabelText("Video paket anahtarı"), {
      target: { value: SECRET_KEY },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dosyayı doğrula ve indir" }));
    await waitFor(() => expect(decryptContainerMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));
    await waitFor(() => expect(decodeQrVideoMock).toHaveBeenCalledTimes(2));
    opening.resolve({ file: new File(["eski"], "eski.pdf"), sha256: "eski-sha" });
    await opening.promise;
    await Promise.resolve();

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(anchorClickMock).not.toHaveBeenCalled();
    expect(screen.queryByText("eski.pdf")).not.toBeInTheDocument();
  });

  it("şifre çözme beklerken bileşen kapanırsa eski sonucu indirmez", async () => {
    const opening = deferred();
    decryptContainerMock.mockReturnValueOnce(opening.promise);
    const view = render(<VideoTransferPanel view="open" />);
    fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
      target: { files: [new File(["video"], "aktarim.webm", { type: "video/webm" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));
    fireEvent.change(await screen.findByLabelText("Video paket anahtarı"), {
      target: { value: SECRET_KEY },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dosyayı doğrula ve indir" }));
    await waitFor(() => expect(decryptContainerMock).toHaveBeenCalledTimes(1));

    view.unmount();
    opening.resolve({ file: new File(["eski"], "eski.pdf"), sha256: "eski-sha" });
    await opening.promise;
    await Promise.resolve();

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(anchorClickMock).not.toHaveBeenCalled();
  });

  it("Dengeli profili varsayılan seçer ve Uyumlu profili sunar", () => {
    render(<VideoTransferPanel view="create" />);

    expect(screen.getByDisplayValue("balanced")).toBeChecked();
    expect(screen.getByDisplayValue("compatible")).not.toBeChecked();
  });

  it("Renkli Dengeli profilini deneysel açıklamayla sunar ama Dengeli varsayılan kalır", () => {
    render(<VideoTransferPanel view="create" />);

    expect(screen.getByDisplayValue("balanced")).toBeChecked();
    expect(screen.getByDisplayValue("color_balanced")).not.toBeChecked();
    expect(screen.getByDisplayValue("color_balanced")).toBeDisabled();
    expect(screen.getByText("Gerçek dört renkli matris · deneysel cihaz uyumu")).toBeInTheDocument();
    expect(screen.getByText("Deneysel", { selector: ".profile-experimental-badge" })).toBeInTheDocument();
    expect(screen.getByText("Android ve iPhone kontrollü ışık testleri kaydedilene kadar kapalı. Daha stabil seçenek: Dengeli.")).toBeInTheDocument();
  });

  it("sıkıştırma aşamasını yalnızca renkli profil için gösterir", () => {
    render(<VideoTransferPanel view="create" colorVideoMainEnabled />);
    const stages = screen.getByRole("list", { name: "QR video oluşturma aşamaları" });

    expect(screen.queryByText("Sıkıştırma")).not.toBeInTheDocument();
    expect(stages).not.toHaveClass("color-profile");
    fireEvent.click(screen.getByDisplayValue("color_balanced"));
    expect(screen.getByText("Sıkıştırma")).toBeInTheDocument();
    expect(stages).toHaveClass("color-profile");
    expect(within(stages).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Sıkıştırma",
      "Şifreleme",
      "Kurtarma parçaları",
      "QR kareleri hazırlanıyor…",
      "Video kaydediliyor…",
      "Tamamlandı",
    ]);
  });

  it("seçilen renkli profili QR video üreticisine iletir", async () => {
    render(<VideoTransferPanel view="create" colorVideoMainEnabled />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["renkli"], "renkli.pdf")] },
    });
    fireEvent.click(screen.getByDisplayValue("color_balanced"));
    confirmKeySafety();
    await screen.findByText("ornek-video-sha256");
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    await waitFor(() => expect(createQrVideoMock).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ profileId: "color_balanced" }),
      expect.any(Function),
    ));
  });

  it.each([
    [
      { originalSize: 102400, storedSize: 4096, savedPercent: 96 },
      "Renkli QR verisi %96 küçültüldü",
    ],
    [
      { originalSize: 102400, storedSize: 102400, savedPercent: 0 },
      "Dosya zaten sıkıştırılmış; özgün boyut korundu",
    ],
  ])("renkli video sonucunda sıkıştırma bilgisini gösterir", async (compressionStats, message) => {
    createQrVideoMock.mockResolvedValueOnce({
      blob: new Blob(["color-video"], { type: "video/webm" }),
      keyText: SECRET_KEY,
      transferId: "Color1234567",
      sha256: "ornek-video-sha256",
      durationSeconds: 4,
      mimeType: "video/webm",
      isColor: true,
      profileId: "color_balanced",
      compressionStats,
    });
    render(<VideoTransferPanel view="create" colorVideoMainEnabled />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["belge"], "belge.pdf")] },
    });
    fireEvent.click(screen.getByDisplayValue("color_balanced"));
    confirmKeySafety();
    await screen.findByText("ornek-video-sha256");
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("standart profilin hazırlama ve kayıt aşamalarını ayrı gösterir", () => {
    render(<VideoTransferPanel view="create" />);
    const stages = screen.getByRole("list", { name: "QR video oluşturma aşamaları" });

    expect(within(stages).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Şifreleme",
      "Kurtarma parçaları",
      "QR kareleri hazırlanıyor…",
      "Video kaydediliyor…",
      "Tamamlandı",
    ]);
    expect(stages).not.toHaveClass("color-profile");
  });

  it("üretim ilerlerken QR hazırlama ve video kaydı aşamalarını etkinleştirir", async () => {
    const creation = deferred();
    let reportProgress;
    createQrVideoMock.mockImplementationOnce((_file, _options, onProgress) => {
      reportProgress = onProgress;
      onProgress({ stage: "preparing", percent: 40 });
      return creation.promise;
    });

    render(<VideoTransferPanel view="create" />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["belge"], "belge.pdf", { type: "application/pdf" })] },
    });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    await waitFor(() => expect(screen.getByText("QR kareleri hazırlanıyor…").closest("li"))
      .toHaveClass("active"));
    await act(async () => reportProgress({ stage: "recording", percent: 1 }));
    expect(screen.getByText("Video kaydediliyor…").closest("li")).toHaveClass("active");

    creation.resolve({
      blob: new Blob(["video-bytes"], { type: "video/webm" }),
      keyText: SECRET_KEY,
      transferId: "Vid123456789",
      sha256: "ornek-video-sha256",
      durationSeconds: 6,
      mimeType: "video/webm",
    });
    await act(async () => { await creation.promise; });
  });

  it("paralel QR hazırlama kullanılamazsa anlaşılır bir yavaşlık uyarısı gösterir", async () => {
    createQrVideoMock.mockImplementationOnce(async (_file, options) => {
      options.onPerformanceWarning?.(new Error("Worker kullanılamıyor"));
      return {
        blob: new Blob(["video-bytes"], { type: "video/webm" }),
        keyText: SECRET_KEY,
        transferId: "Vid123456789",
        sha256: "ornek-video-sha256",
        durationSeconds: 6,
        mimeType: "video/webm",
      };
    });

    render(<VideoTransferPanel view="create" />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["belge"], "belge.pdf", { type: "application/pdf" })] },
    });
    await screen.findByText("ornek-video-sha256");
    confirmKeySafety();
    fireEvent.click(screen.getByRole("button", { name: "QR video oluştur" }));

    expect(await screen.findByText(
      "Bu cihazda paralel QR hazırlama kullanılamadı; video daha yavaş hazırlanabilir.",
    )).toBeInTheDocument();
  });

  it("video taraması ile kurtarılan veri yüzdesini ayrı gösterir", async () => {
    decodeQrVideoMock.mockImplementation(async (_file, callbacks) => {
      callbacks.onScanProgress({ percent: 40, currentTime: 4, duration: 10 });
      callbacks.onProgress({ collected: 3, total: 10, solved: 3, sourceCount: 10 });
      return new Uint8Array([66, 84, 65, 49]);
    });
    render(<VideoTransferPanel view="open" />);
    fireEvent.change(screen.getByLabelText("Çözülecek QR video"), {
      target: { files: [new File(["video"], "aktarim.webm", { type: "video/webm" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "QR videoyu tara" }));

    expect(await screen.findByText("Video taraması: %40")).toBeInTheDocument();
    expect(screen.getByText("Kurtarılan veri: %30")).toBeInTheDocument();
  });

  it("masaüstünde MP4 ve WebM videoyu sürükleyip bırakmayı kabul eder", async () => {
    render(<VideoTransferPanel view="open" />);
    const video = new File(["video"], "aktarim.mp4", { type: "video/mp4" });

    fireEvent.drop(screen.getByText("QR video seç veya sürükleyip bırak").closest("label"), {
      dataTransfer: { files: [video] },
    });

    expect(screen.getByText("aktarim.mp4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "QR videoyu tara" })).toBeEnabled();
  });

  it("uzak paylaşımda videoyu medya değil dosya-belge olarak göndermeyi açıklar", () => {
    render(<VideoTransferPanel view="create" />);

    expect(screen.getByText(/WhatsApp veya Telegram.+belge olarak ilet/)).toBeInTheDocument();
  });

  it("yarım kalan gelen işlemi devam ettirir veya silebilir", async () => {
    const recoveryRecord = {
      id: "incoming:Ab12Cd34Ef56",
      direction: "incoming",
      transferId: "Ab12Cd34Ef56",
      protocolVersion: "QRF1",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      metadata: { sourceCount: 10 },
      symbols: [{ symbolId: 1, data: new Uint8Array([1]) }],
    };
    const recoveryStore = {
      list: vi.fn().mockResolvedValue([recoveryRecord]),
      delete: vi.fn().mockResolvedValue(undefined),
      saveIncoming: vi.fn(),
      saveOutgoing: vi.fn(),
    };
    render(<VideoTransferPanel view="open" recoveryStore={recoveryStore} />);

    fireEvent.click(await screen.findByRole("button", { name: "Devam et" }));
    expect(screen.getByText(/Kaldığınız yer seçildi/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yarım kalan işlemi sil" }));
    await waitFor(() => expect(recoveryStore.delete).toHaveBeenCalledWith(recoveryRecord.id));
  });

  it("anahtarı ayrı saklama onayı olmadan QR video üretimini başlatmaz", async () => {
    render(<VideoTransferPanel view="create" />);
    fireEvent.change(screen.getByLabelText("QR video yapılacak belge"), {
      target: { files: [new File(["belge"], "belge.pdf")] },
    });
    await screen.findByText("ornek-video-sha256");

    const createButton = screen.getByRole("button", { name: "QR video oluştur" });
    expect(createButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /anahtarı ayrı/i }));
    expect(createButton).toBeEnabled();
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
