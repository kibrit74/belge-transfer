import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SupportedFiles from "../components/SupportedFiles.jsx";
import SecureLinkReceivePage from "../pages/SecureLinkReceivePage.jsx";
import FaqPage from "../pages/FaqPage.jsx";
import LandingPage from "../pages/LandingPage.jsx";
import TransferPage from "../pages/TransferPage.jsx";
import TransferMethodSelector from "../TransferMethodSelector.jsx";

describe("VaultDrop ürün adı sözleşmesi", () => {
  it("ana aktarım seçicisinde VaultDrop'u uzaktaki alıcı için önerir", () => {
    render(<TransferMethodSelector activeMethod="package" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: /Uzak cihaz/ })).toHaveTextContent(
      "Uzak cihaza şifreli paket gönder.",
    );
  });

  it("açılış yüzeylerinde VaultDrop ürün adını kullanır", () => {
    render(<LandingPage />);

    const methods = document.querySelectorAll(".mock-methods b");
    expect(methods[1]).toHaveTextContent("Yakındaki Cihazlar");
    expect(methods[2]).toHaveTextContent("VaultDrop");
    expect(screen.getByText(/uzaktaysa VaultDrop kullan/)).toBeInTheDocument();
    expect(screen.getAllByText(/VaultDrop paketinde en fazla 15 dosyayı/).length).toBeGreaterThan(0);
    expect(screen.getByText(/VaultDrop \(şifreli paket\), uzak gönderim için en stabil/)).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "VaultDrop" }))
      .toHaveAttribute("href", "/#demo");
  });

  it("aktarımı alma yönlendirmesinde VaultDrop adını kullanır", () => {
    render(<TransferPage />);
    expect(screen.getByText(/VaultDrop uzak gönderimler içindir/)).toBeInTheDocument();
  });

  it("kaldırılan bağlantı sayfasında VaultDrop alımına yönlendirir", () => {
    render(<SecureLinkReceivePage />);
    expect(screen.getByRole("link", { name: "VaultDrop paketini al" })).toHaveAttribute(
      "href",
      "/transfer",
    );
  });

  it("yardım metinlerinde VaultDrop adını kullanır", () => {
    render(<FaqPage />);

    expect(screen.getAllByText(/VaultDrop paketinde en fazla 15 dosya/).length).toBeGreaterThan(0);
    expect(screen.getByText(/VaultDrop paketi AES-256-GCM ile korunur/)).toBeInTheDocument();
    expect(screen.getByText(/Yakındaki Cihazlar WebRTC DTLS/)).toBeInTheDocument();
    expect(screen.getByText(/Farklı ağ veya şehirde VaultDrop en stabil/)).toBeInTheDocument();
  });

  it("desteklenen dosya yüzeyinde VaultDrop paket sınırını anlatır", () => {
    render(<SupportedFiles />);
    expect(screen.getByText(/VaultDrop paketinde en fazla 15 dosyayı/)).toBeInTheDocument();
  });
});
