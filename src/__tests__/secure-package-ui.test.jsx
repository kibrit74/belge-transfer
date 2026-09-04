import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  completeTransferMock,
  createVaultDropPackageClientMock,
  decryptContainerMock,
  reserveTransferMock,
} = vi.hoisted(() => ({
  completeTransferMock: vi.fn(),
  createVaultDropPackageClientMock: vi.fn(),
  decryptContainerMock: vi.fn(),
  reserveTransferMock: vi.fn(),
}));

vi.mock("../transfer/activity-client.js", () => ({
  completeTransferActivity: completeTransferMock,
  reserveTransferActivity: reserveTransferMock,
}));

vi.mock("../workers/vaultdrop-package-client.js", () => ({
  createVaultDropPackageClient: createVaultDropPackageClientMock,
}));

vi.mock("../crypto/encrypted-container.js", async (importOriginal) => ({
  ...(await importOriginal()),
  decryptContainer: decryptContainerMock,
}));

import App from "../App";
import { AuthContext } from "../auth/AuthContext.jsx";
import SecurePackagePanel from "../SecurePackagePanel";
import TransferMethodSelector from "../TransferMethodSelector";

const USER = { id: "user-1", plan: "standard" };
const SECRET_KEY = "A".repeat(43);

function packageResult(overrides = {}) {
  return {
    blob: new Blob(["BTA2"]),
    keyText: SECRET_KEY,
    transferId: "Ab12Cd34Ef56",
    sha256: "B".repeat(43),
    compression: "zlib",
    originalSize: 8192,
    storedSize: 256,
    savedPercent: 97,
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function abortedError() {
  const error = new Error("Paket hazırlama işlemi iptal edildi.");
  error.code = "ABORTED";
  return error;
}

function renderAuthenticatedApp() {
  return render(
    <AuthContext.Provider value={{ user: { ...USER, displayName: "Üye" }, status: "ready" }}>
      <App />
    </AuthContext.Provider>,
  );
}

describe("güvenli paket arayüzü", () => {
  let anchorClickMock;
  let createObjectUrlMock;
  let defaultClient;
  let revokeObjectUrlMock;

  beforeEach(() => {
    window.history.replaceState({}, "", "/transfer");
    anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    createObjectUrlMock = vi.fn().mockReturnValue("blob:paket-adresi");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlMock,
    });
    revokeObjectUrlMock = vi.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlMock,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue() },
    });

    defaultClient = {
      close: vi.fn(),
      create: vi.fn().mockResolvedValue(packageResult()),
    };
    createVaultDropPackageClientMock.mockReturnValue(defaultClient);
    reserveTransferMock.mockResolvedValue({ id: "reservation-1" });
    completeTransferMock.mockResolvedValue({ id: "reservation-1", status: "completed" });
    decryptContainerMock.mockResolvedValue({
      file: new File(["orijinal içerik"], "orijinal-belge.txt", { type: "text/plain" }),
      sha256: "B".repeat(43),
    });
  });

  afterEach(() => {
    cleanup();
    anchorClickMock.mockRestore();
    vi.clearAllMocks();
  });

  it("dosya seçiminde içeriği okumaz; oluştururken worker sonucunu kullanır", async () => {
    let finishCreate;
    const create = vi.fn().mockImplementation((_files, { onProgress }) => {
      onProgress({ stage: "archive", percent: 5 });
      onProgress({ stage: "encrypt", percent: 70 });
      return new Promise((resolve) => {
        finishCreate = () => resolve(packageResult());
      });
    });
    const client = { create, close: vi.fn() };
    const file = new File(["A".repeat(8192)], "rapor.txt", { type: "text/plain" });
    const readSpy = vi.spyOn(file, "arrayBuffer");

    render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [file] } });
    expect(readSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    expect(await screen.findByText("Şifreleniyor · %70")).toBeInTheDocument();
    expect(screen.queryByText(/Hazır!/)).not.toBeInTheDocument();

    finishCreate();
    expect(await screen.findByText(/%97 daha küçük/)).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith(
      [file],
      expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) }),
    );
  });

  it("dosya değişiminde bekleyen worker işlemini iptal eder ve eski indirmeyi oluşturmaz", async () => {
    const firstCreate = deferred();
    let firstSignal;
    const client = {
      close: vi.fn(),
      create: vi.fn().mockImplementation((_files, { signal }) => {
        firstSignal = signal;
        return firstCreate.promise;
      }),
    };
    const firstFile = new File(["ilk"], "ilk.txt", { type: "text/plain" });
    const secondFile = new File(["ikinci"], "ikinci.txt", { type: "text/plain" });

    render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [firstFile] } });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [secondFile] } });
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      firstCreate.resolve(packageResult({ transferId: "EskiPaket01" }));
      await firstCreate.promise;
    });

    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(anchorClickMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "VaultDrop paketini indir" })).not.toBeInTheDocument();
  });

  it("iptal düğmesi ABORTED sonucu için rezervasyonu failed ile kapatır ve indirme oluşturmaz", async () => {
    const client = {
      close: vi.fn(),
      create: vi.fn().mockImplementation((_files, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(abortedError()), { once: true });
      })),
    };
    const file = new File(["belge"], "belge.txt", { type: "text/plain" });

    render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    expect(await screen.findByRole("button", { name: "Paket oluşturmayı iptal et" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Paket oluşturmayı iptal et" }));

    await waitFor(() => expect(completeTransferMock).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: "reservation-1",
      status: "failed",
      user: USER,
    })));
    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "VaultDrop paketini indir" })).not.toBeInTheDocument();
  });

  it("hata veya iptal sonrası tamamlanma ilerlemesini ekrandan kaldırır", async () => {
    const failedCreate = deferred();
    const failedClient = {
      close: vi.fn(),
      create: vi.fn().mockImplementation((_files, { onProgress }) => {
        onProgress({ stage: "complete", percent: 100 });
        return failedCreate.promise;
      }),
    };
    const file = new File(["belge"], "belge.txt", { type: "text/plain" });
    const firstRender = render(
      <SecurePackagePanel view="create" packageClient={failedClient} user={USER} />,
    );

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    expect(await screen.findByText("Paket hazır · %100")).toBeInTheDocument();

    await act(async () => {
      failedCreate.reject(new Error("Worker hatası"));
      await failedCreate.promise.catch(() => {});
    });
    expect(await screen.findByText("Worker hatası")).toBeInTheDocument();
    expect(screen.queryByText("Paket hazır · %100")).not.toBeInTheDocument();
    firstRender.unmount();

    const abortedClient = {
      close: vi.fn(),
      create: vi.fn().mockImplementation((_files, { onProgress, signal }) => {
        onProgress({ stage: "complete", percent: 100 });
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(abortedError()), { once: true });
        });
      }),
    };
    render(<SecurePackagePanel view="create" packageClient={abortedClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    expect(await screen.findByText("Paket hazır · %100")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Paket oluşturmayı iptal et" }));
    expect(await screen.findByText("Paket hazırlama işlemi iptal edildi.")).toBeInTheDocument();
    expect(screen.queryByText("Paket hazır · %100")).not.toBeInTheDocument();
  });

  it("sahip olduğu worker istemcisini unmount sonrasında yalnız bir kez kapatır", () => {
    const { unmount } = render(<SecurePackagePanel view="create" user={USER} />);

    expect(createVaultDropPackageClientMock).toHaveBeenCalledTimes(1);
    unmount();

    expect(defaultClient.close).toHaveBeenCalledTimes(1);
  });

  it("prop olarak verilen worker istemcisini unmount sonrasında kapatmaz", () => {
    const client = { close: vi.fn(), create: vi.fn() };
    const { unmount } = render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);

    unmount();

    expect(createVaultDropPackageClientMock).not.toHaveBeenCalled();
    expect(client.close).not.toHaveBeenCalled();
  });

  it("kesinleştirme beklerken dosya değişirse eski indirmeyi başlatmaz ve kotayı iade eder", async () => {
    const delayedFinalization = deferred();
    completeTransferMock.mockReturnValueOnce(delayedFinalization.promise);
    const client = { close: vi.fn(), create: vi.fn().mockResolvedValue(packageResult()) };
    const firstFile = new File(["ilk"], "ilk.txt", { type: "text/plain" });
    const secondFile = new File(["ikinci"], "ikinci.txt", { type: "text/plain" });

    render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [firstFile] } });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    await waitFor(() => expect(completeTransferMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [secondFile] } });
    await act(async () => {
      delayedFinalization.resolve({ id: "reservation-1", status: "completed" });
      await delayedFinalization.promise;
    });

    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(anchorClickMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "VaultDrop paketini indir" })).not.toBeInTheDocument();
    await waitFor(() => expect(completeTransferMock).toHaveBeenCalledTimes(2));
    expect(completeTransferMock).toHaveBeenLastCalledWith(expect.objectContaining({
      reservationId: "reservation-1",
      status: "failed",
    }));
  });

  it("kesinleştirme beklerken panel kapanırsa eski indirmeyi başlatmaz ve kotayı iade eder", async () => {
    const delayedFinalization = deferred();
    completeTransferMock.mockReturnValueOnce(delayedFinalization.promise);
    const client = { close: vi.fn(), create: vi.fn().mockResolvedValue(packageResult()) };
    const { unmount } = render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["ilk"], "ilk.txt", { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    await waitFor(() => expect(completeTransferMock).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      delayedFinalization.resolve({ id: "reservation-1", status: "completed" });
      await delayedFinalization.promise;
    });

    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(anchorClickMock).not.toHaveBeenCalled();
    await waitFor(() => expect(completeTransferMock).toHaveBeenCalledTimes(2));
    expect(completeTransferMock).toHaveBeenLastCalledWith(expect.objectContaining({
      reservationId: "reservation-1",
      status: "failed",
    }));
  });

  it("aylık kota aşıldığında worker paketleme işlemini başlatmaz", async () => {
    const client = { close: vi.fn(), create: vi.fn() };
    reserveTransferMock.mockRejectedValueOnce(
      new Error("Bu aktarım aylık paket kotanızı aşıyor."),
    );
    render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["içerik"], "belge.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

    expect(await screen.findByText("Bu aktarım aylık paket kotanızı aşıyor.")).toBeInTheDocument();
    expect(client.create).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "VaultDrop paketini indir" })).not.toBeInTheDocument();
  });

  it("alıcı cihazına göre üç gönderim yolunu gösterir ve uzak cihaz için paketi önerir", () => {
    render(<TransferMethodSelector activeMethod="package" onChange={() => {}} />);

    expect(screen.getByRole("heading", { name: "Alıcı nerede?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Uzak cihaz/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Önerilen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Canlı QR/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yakındaki Cihazlar/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /QR video/ })).not.toBeInTheDocument();
  });

  it("uygulama içinde aktarım yöntemlerini görünür tutar", async () => {
    renderAuthenticatedApp();

    expect(screen.getByRole("heading", { name: "Alıcı nerede?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Uzak cihaz/ })).toBeInTheDocument();
    expect(screen.queryByText("QR Video · özel durum")).not.toBeInTheDocument();
    expect(await screen.findByText("Dosya seç")).toBeInTheDocument();
    expect(screen.getByLabelText("Paketlenecek belge")).toBeInTheDocument();
  });

  it("Gönder şifreli paket ekranında yalnızca oluşturma alanını gösterir", () => {
    renderAuthenticatedApp();

    const transferMethods = screen.getByRole("region", { name: "Alıcı nerede?" });
    fireEvent.click(within(transferMethods).getByRole("button", { name: /Uzak cihaz/ }));

    expect(screen.getByText("Dosya seç")).toBeInTheDocument();
    expect(screen.getByLabelText("Paketlenecek belge")).toBeInTheDocument();
    expect(screen.queryByLabelText("VaultDrop paket dosyası")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Paket anahtarı")).not.toBeInTheDocument();
  });

  it("Al ekranında yalnızca şifreli paket açma alanını gösterir", () => {
    renderAuthenticatedApp();
    fireEvent.click(screen.getByRole("button", { name: "Al" }));

    expect(screen.getByLabelText("VaultDrop paket dosyası")).toHaveAttribute(
      "accept",
      ".vdrop,.bta,application/vnd.vaultdrop.package,application/x-belgeaktar",
    );
    expect(screen.getByLabelText("Paket anahtarı")).toBeInTheDocument();
    expect(screen.queryByLabelText("Paketlenecek belge")).not.toBeInTheDocument();
  });

  it("oluşturma ve açma görünüm varyantlarını ayrı tutar", () => {
    const createView = render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    expect(screen.getByRole("heading", { name: "VaultDrop paketi hazırla" })).toBeInTheDocument();
    expect(screen.queryByLabelText("VaultDrop paket dosyası")).not.toBeInTheDocument();
    createView.unmount();

    render(<SecurePackagePanel view="open" packageClient={defaultClient} user={USER} />);
    expect(screen.getByLabelText("VaultDrop paket dosyası")).toBeInTheDocument();
    expect(screen.getByLabelText("Paket anahtarı")).toBeInTheDocument();
    expect(screen.queryByLabelText("Paketlenecek belge")).not.toBeInTheDocument();
  });

  it("anahtar paylaşım uyarısını gösterir", () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);

    expect(screen.getByText("Anahtarı paketle aynı mesajda göndermeyin")).toBeInTheDocument();
  });

  it("üye için çoklu seçim sınırını bildirir ve fazla seçimi engeller", async () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    expect(screen.getByLabelText("Paketlenecek belge")).toHaveAttribute("multiple");
    expect(screen.getByText("En fazla 15 dosya · toplam 50 MiB")).toBeInTheDocument();

    const files = Array.from(
      { length: 16 },
      (_, index) => new File([String(index)], `dosya-${index}.txt`),
    );
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files } });

    expect(await screen.findByText("En fazla 15 dosya seçebilirsiniz.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VaultDrop paketi oluştur" })).toBeDisabled();
  });

  it("misafir için tek dosya ve toplam 10 MiB sınırını uygular", async () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={null} />);
    expect(screen.getByLabelText("Paketlenecek belge")).not.toHaveAttribute("multiple");
    expect(screen.getByText("Misafir: tek dosya · toplam 10 MiB")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["ilk"], "ilk.txt"), new File(["ikinci"], "ikinci.txt")] },
    });

    expect(await screen.findByText(
      "Misafir kullanımında tek dosya ve en fazla 10 MiB gönderebilirsiniz.",
    )).toBeInTheDocument();
  });

  it("çoklu seçimi listeler, bir dosya kaldırıldığında seçim metadatasını günceller", async () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    const firstFile = new File(["ilk"], "ilk.txt");
    const secondFile = new File(["ikinci"], "ikinci.txt");

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [firstFile, secondFile] },
    });
    expect(await screen.findByText("ilk.txt")).toBeInTheDocument();
    expect(screen.getByText("ikinci.txt")).toBeInTheDocument();
    expect(screen.getByText("2 dosya")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ikinci.txt dosyasını kaldır" }));

    await waitFor(() => expect(screen.queryByText("ikinci.txt")).not.toBeInTheDocument());
    expect(screen.getByText("1 dosya")).toBeInTheDocument();
  });

  it("worker'a seçilen özgün dosyaları verir ve paket özetini anahtar göstermeden sunar", async () => {
    const client = { close: vi.fn(), create: vi.fn().mockResolvedValue(packageResult()) };
    const files = [new File(["ilk"], "ilk.txt"), new File(["ikinci"], "ikinci.txt")];
    render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files } });
    expect(await screen.findByText("ilk.txt")).toBeInTheDocument();
    expect(screen.queryByText("SHA-256")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

    expect(await screen.findByRole("link", { name: "VaultDrop paketini indir" })).toBeInTheDocument();
    expect(screen.getByText("SHA-256")).toBeInTheDocument();
    expect(screen.getByText("B".repeat(43))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET_KEY);
    expect(client.create).toHaveBeenCalledWith(
      files,
      expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) }),
    );
  });

  it("StrictMode yeniden bağlandığında seçilen dosya metadatasını korur", async () => {
    render(
      <StrictMode>
        <SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />
      </StrictMode>,
    );
    const file = new File(["delil"], "dava-dosyası.txt", { type: "text/plain" });

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [file] } });

    expect(await screen.findByText("dava-dosyası.txt")).toBeInTheDocument();
    expect(screen.getByText("Toplam boyut")).toBeInTheDocument();
    expect(screen.queryByText("SHA-256")).not.toBeInTheDocument();
  });

  it("VaultDrop indirmesinde anahtarı dosya adına, URL'ye veya DOM'a sızdırmaz", async () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

    const link = await screen.findByRole("link", { name: "VaultDrop paketini indir" });
    expect(link).toHaveAttribute("download", "vaultdrop-Ab12Cd34Ef56.vdrop");
    expect(link).toHaveAttribute("href", "blob:paket-adresi");
    expect(link.getAttribute("download")).not.toContain(SECRET_KEY);
    expect(link.getAttribute("href")).not.toContain(SECRET_KEY);
    expect(document.body.textContent).not.toContain(SECRET_KEY);
  });

  it("paket sonucunda ayrı paylaşım adımlarını gösterir", async () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

    expect(await screen.findByText("1. .vdrop paketini gönder")).toBeInTheDocument();
    expect(screen.getByText("2. Anahtarı farklı bir kanaldan gönder")).toBeInTheDocument();
  });

  it("kota kesinleştirmesi sonuçsuz kalırsa paketi veya otomatik indirmeyi sunmaz", async () => {
    completeTransferMock.mockResolvedValueOnce(null);
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

    expect(await screen.findByText("Aylık kullanım kaydı güvenceye alınamadı.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "VaultDrop paketini indir" })).not.toBeInTheDocument();
    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(anchorClickMock).not.toHaveBeenCalled();
  });

  it("kota kesinleştirmesi hata verirse VaultDrop sonucunu sunmaz", async () => {
    completeTransferMock
      .mockRejectedValueOnce(new Error("Aylık kullanım kaydı güvenceye alınamadı."))
      .mockResolvedValueOnce(null);
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

    expect(await screen.findByText("Aylık kullanım kaydı güvenceye alınamadı.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "VaultDrop paketini indir" })).not.toBeInTheDocument();
    expect(createObjectUrlMock).not.toHaveBeenCalled();
  });

  it("pano reddedilince anahtarı yalnız kullanıcı isterse görünür alana yazar", async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error("izin yok"));
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    fireEvent.click(await screen.findByRole("button", { name: "Anahtarı kopyala" }));

    expect(await screen.findByRole("button", { name: "Anahtarı elle göster" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET_KEY);

    fireEvent.click(screen.getByRole("button", { name: "Anahtarı elle göster" }));
    expect(screen.getByLabelText("Geçici paket anahtarı")).toHaveValue(SECRET_KEY);

    fireEvent.click(screen.getByRole("button", { name: "Anahtarı gizle" }));
    expect(document.body.textContent).not.toContain(SECRET_KEY);
  });

  it("VaultDrop paketi oluşunca indirmeyi otomatik başlatır", async () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "dava-dosyası.txt", { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

    await screen.findByRole("link", { name: "VaultDrop paketini indir" });
    expect(anchorClickMock).toHaveBeenCalledTimes(1);
  });

  it("anahtarı yalnız kopyalama düğmesiyle panoya gönderir", async () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "dava-dosyası.txt", { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Anahtarı kopyala" }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SECRET_KEY));
    expect(screen.getByText(
      "Anahtar kopyalandı. .vdrop paketinden farklı bir kanalda gönderin.",
    )).toBeInTheDocument();
  });

  it(".vdrop ve .bta paketlerini açma alanında kabul eder ve BTA sonucunu indirilebilir yapar", async () => {
    createObjectUrlMock.mockReset().mockReturnValue("blob:cozulmus-adres");
    render(<SecurePackagePanel view="open" packageClient={defaultClient} user={USER} />);
    const packageFile = new File(["BTA2"], "aktarim.bta", {
      type: "application/vnd.vaultdrop.package",
    });

    expect(screen.getByLabelText("VaultDrop paket dosyası")).toHaveAttribute(
      "accept",
      ".vdrop,.bta,application/vnd.vaultdrop.package,application/x-belgeaktar",
    );
    fireEvent.change(screen.getByLabelText("VaultDrop paket dosyası"), {
      target: { files: [packageFile] },
    });
    fireEvent.change(screen.getByLabelText("Paket anahtarı"), { target: { value: SECRET_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Paketi çöz" }));

    const link = await screen.findByRole("link", { name: "Özgün dosyayı indir" });
    expect(decryptContainerMock).toHaveBeenCalledWith(expect.any(ArrayBuffer), SECRET_KEY);
    expect(link).toHaveAttribute("download", "orijinal-belge.txt");
    expect(link).toHaveAttribute("href", "blob:cozulmus-adres");
    expect(link).toHaveClass("download-result-action");
  });

  it(".vdrop uzantılı BTA paketi aynı açma akışında indirilebilir sonuç üretir", async () => {
    createObjectUrlMock.mockReset().mockReturnValue("blob:vdrop-cozulmus-adres");
    render(<SecurePackagePanel view="open" packageClient={defaultClient} user={USER} />);
    const packageFile = new File(["BTA2"], "aktarim.vdrop", {
      type: "application/vnd.vaultdrop.package",
    });

    fireEvent.change(screen.getByLabelText("VaultDrop paket dosyası"), {
      target: { files: [packageFile] },
    });
    fireEvent.change(screen.getByLabelText("Paket anahtarı"), { target: { value: SECRET_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Paketi çöz" }));

    const link = await screen.findByRole("link", { name: "Özgün dosyayı indir" });
    expect(link).toHaveAttribute("href", "blob:vdrop-cozulmus-adres");
  });

  it("bozuk veya izin verilen sınırı aşan BTA paketi ekrana hata olarak gelir", async () => {
    decryptContainerMock.mockRejectedValueOnce(
      new Error("Paket veya dosya izin verilen boyut sınırını aşıyor."),
    );
    render(<SecurePackagePanel view="open" packageClient={defaultClient} user={USER} />);
    const packageFile = new File(["BTA2"], "buyuk-paket.vdrop", {
      type: "application/vnd.vaultdrop.package",
    });

    fireEvent.change(screen.getByLabelText("VaultDrop paket dosyası"), {
      target: { files: [packageFile] },
    });
    fireEvent.change(screen.getByLabelText("Paket anahtarı"), { target: { value: SECRET_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Paketi çöz" }));

    expect(await screen.findByText(
      "Paket veya dosya izin verilen boyut sınırını aşıyor.",
    )).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Özgün dosyayı indir" })).not.toBeInTheDocument();
  });

  it("bozuk .vdrop paketinde indirme bağlantısı oluşturmaz", async () => {
    decryptContainerMock.mockRejectedValueOnce(
      new Error("Anahtar geçersiz veya paket bozuk."),
    );
    render(<SecurePackagePanel view="open" packageClient={defaultClient} user={USER} />);
    const packageFile = new File(["bozuk"], "bozuk-paket.vdrop", {
      type: "application/vnd.vaultdrop.package",
    });

    fireEvent.change(screen.getByLabelText("VaultDrop paket dosyası"), {
      target: { files: [packageFile] },
    });
    fireEvent.change(screen.getByLabelText("Paket anahtarı"), { target: { value: SECRET_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Paketi çöz" }));

    expect(await screen.findByText("Anahtar geçersiz veya paket bozuk.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Özgün dosyayı indir" })).not.toBeInTheDocument();
    expect(createObjectUrlMock).not.toHaveBeenCalled();
  });

  it("pano erişimi yoksa başarılı kopyalama mesajı göstermez", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    fireEvent.click(await screen.findByRole("button", { name: "Anahtarı kopyala" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Anahtar panoya kopyalanamadı. Lütfen izinleri kontrol edin. Anahtarı elle göster düğmesini kullanabilirsiniz.",
    );
    expect(screen.queryByText("Anahtar kopyalandı.")).not.toBeInTheDocument();
  });

  it("pano yazma izni reddedilirse başarılı kopyalama mesajı göstermez", async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error("izin yok"));
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File(["delil"], "belge.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    fireEvent.click(await screen.findByRole("button", { name: "Anahtarı kopyala" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Anahtar panoya kopyalanamadı. Lütfen izinleri kontrol edin.",
    );
    expect(screen.queryByText("Anahtar kopyalandı.")).not.toBeInTheDocument();
  });

  it("dosya değişince eski paket URL'sini iptal eder", async () => {
    render(<SecurePackagePanel view="create" packageClient={defaultClient} user={USER} />);
    const firstFile = new File(["ilk"], "ilk.txt", { type: "text/plain" });
    const secondFile = new File(["ikinci"], "ikinci.txt", { type: "text/plain" });

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [firstFile] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    await screen.findByRole("link", { name: "VaultDrop paketini indir" });

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [secondFile] },
    });

    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:paket-adresi");
    expect(screen.queryByRole("link", { name: "VaultDrop paketini indir" })).not.toBeInTheDocument();
  });

  it("geciken worker sonucu dosya değiştikten sonra ekrana veya indirmeye yazılmaz", async () => {
    const delayedCreate = deferred();
    const client = { close: vi.fn(), create: vi.fn().mockReturnValue(delayedCreate.promise) };
    const firstFile = new File(["ilk"], "ilk.txt", { type: "text/plain" });
    const secondFile = new File(["ikinci"], "ikinci.txt", { type: "text/plain" });
    render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [firstFile] } });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [secondFile] } });

    await act(async () => {
      delayedCreate.resolve(packageResult({ transferId: "EskiPaket01" }));
      await delayedCreate.promise;
    });

    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "VaultDrop paketini indir" })).not.toBeInTheDocument();
  });

  it("panel kapanınca geciken worker sonucu URL üretmez", async () => {
    const delayedCreate = deferred();
    const client = { close: vi.fn(), create: vi.fn().mockReturnValue(delayedCreate.promise) };
    const { unmount } = render(<SecurePackagePanel view="create" packageClient={client} user={USER} />);
    const file = new File(["delil"], "dava-dosyası.txt", { type: "text/plain" });

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      delayedCreate.resolve(packageResult({ transferId: "EskiPaket01" }));
      await delayedCreate.promise;
    });

    expect(createObjectUrlMock).not.toHaveBeenCalled();
  });

  it("geciken paket açma sonucu dosya veya anahtar değişiminden sonra indirme üretmez", async () => {
    const delayedOpen = deferred();
    decryptContainerMock.mockReturnValueOnce(delayedOpen.promise);
    render(<SecurePackagePanel view="open" packageClient={defaultClient} user={USER} />);
    const packageFile = new File(["BTA2"], "aktarim.vdrop");

    fireEvent.change(screen.getByLabelText("VaultDrop paket dosyası"), {
      target: { files: [packageFile] },
    });
    fireEvent.change(screen.getByLabelText("Paket anahtarı"), { target: { value: SECRET_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Paketi çöz" }));
    await waitFor(() => expect(decryptContainerMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Paket anahtarı"), { target: { value: "yeni-anahtar" } });

    await act(async () => {
      delayedOpen.resolve({
        file: new File(["orijinal"], "orijinal-belge.txt"),
        sha256: "B".repeat(43),
      });
      await delayedOpen.promise;
    });

    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Özgün dosyayı indir" })).not.toBeInTheDocument();
  });

  it("panel kapanınca geciken paket açma sonucu URL üretmez", async () => {
    const delayedOpen = deferred();
    decryptContainerMock.mockReturnValueOnce(delayedOpen.promise);
    const { unmount } = render(<SecurePackagePanel view="open" packageClient={defaultClient} user={USER} />);
    const packageFile = new File(["BTA2"], "aktarim.vdrop");

    fireEvent.change(screen.getByLabelText("VaultDrop paket dosyası"), {
      target: { files: [packageFile] },
    });
    fireEvent.change(screen.getByLabelText("Paket anahtarı"), { target: { value: SECRET_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Paketi çöz" }));
    await waitFor(() => expect(decryptContainerMock).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      delayedOpen.resolve({
        file: new File(["orijinal"], "orijinal-belge.txt"),
        sha256: "B".repeat(43),
      });
      await delayedOpen.promise;
    });

    expect(createObjectUrlMock).not.toHaveBeenCalled();
  });
});
