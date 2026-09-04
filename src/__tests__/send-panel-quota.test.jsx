import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeTransferMock, reserveTransferMock } = vi.hoisted(() => ({
  completeTransferMock: vi.fn(),
  reserveTransferMock: vi.fn(),
}));

vi.mock("../transfer/activity-client.js", () => ({
  completeTransferActivity: completeTransferMock,
  reserveTransferActivity: reserveTransferMock,
}));

import SendPanel from "../SendPanel.jsx";

describe("Canlı QR aylık kota", () => {
  beforeEach(() => {
    completeTransferMock.mockReset();
    reserveTransferMock.mockReset();
  });

  it("aynı ortamdaki Canlı QR alanında Dosya seç ifadesini kullanır", () => {
    render(<SendPanel />);

    expect(screen.getByText("Dosya seç")).toBeInTheDocument();
    expect(screen.getByText("Tek dosya veya ZIP, en fazla 2 MiB")).toBeInTheDocument();
  });

  it("kesinleştirme ve başarısız durum kaydı birlikte reddedilince hatayı ekranda tutar", async () => {
    reserveTransferMock.mockResolvedValueOnce({ id: "reservation-1" });
    completeTransferMock
      .mockRejectedValueOnce(new Error("Aylık kullanım kaydı güvenceye alınamadı."))
      .mockRejectedValueOnce(new Error("Ağ kapalı"));
    render(<SendPanel user={{ id: "user-1", plan: "standard" }} />);

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [new File(["içerik"], "belge.pdf", { type: "application/pdf" })] },
    });

    expect(await screen.findByRole("alert", {}, { timeout: 10_000 })).toHaveTextContent(
      "Aylık kullanım kaydı güvenceye alınamadı.",
    );
    expect(document.querySelector("canvas")).not.toBeInTheDocument();
    expect(completeTransferMock).toHaveBeenCalledTimes(2);
  });

  it("kota aşımında dosyayı okumadan kullanıcıya hata gösterir", async () => {
    reserveTransferMock.mockRejectedValueOnce(new Error("Bu aktarım aylık paket kotanızı aşıyor."));
    render(<SendPanel user={{ id: "user-1", plan: "standard" }} />);

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [new File(["içerik"], "belge.pdf", { type: "application/pdf" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Bu aktarım aylık paket kotanızı aşıyor.");
    expect(document.querySelector("canvas")).not.toBeInTheDocument();
  });

  it("2 MiB aşımında kota isteği ve dosya okuma başlatmaz", async () => {
    const oversized = {
      name: "buyuk.zip",
      type: "application/zip",
      size: (2 * 1024 * 1024) + 1,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
    };
    render(<SendPanel user={{ id: "user-1", plan: "standard" }} />);

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [oversized] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Canlı QR en fazla 2 MiB destekler. Daha büyük dosyalar için Yakındaki Cihazlar veya VaultDrop kullanın.",
    );
    expect(reserveTransferMock).not.toHaveBeenCalled();
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });
});
