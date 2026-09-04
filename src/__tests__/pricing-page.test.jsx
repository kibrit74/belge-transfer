import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import PricingPage from "../pages/PricingPage.jsx";

describe("Paketler sayfası", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("dört aylık paketi fiyat ve kotaları ayrı gösterir", () => {
    render(<PricingPage />);

    const cards = screen.getAllByTestId("pricing-card");
    expect(cards).toHaveLength(4);

    const expected = [
      ["Free", "₺0", "10 MiB"],
      ["Standart", "₺99", "50 MiB"],
      ["Plus", "₺199", "250 MiB"],
      ["Kurumsal", "Teklif al", "1 GiB"],
    ];
    expected.forEach(([name, price, quota], index) => {
      expect(within(cards[index]).getByRole("heading", { name })).toBeInTheDocument();
      expect(within(cards[index]).getByText(price)).toBeInTheDocument();
      expect(within(cards[index]).getByText(quota)).toBeInTheDocument();
    });
  });

  it("satışa açık paketlerde yakında yerine başlama bağlantısı gösterir", () => {
    render(<PricingPage />);

    expect(screen.getByRole("link", { name: "Free ile başla" }))
      .toHaveAttribute("href", "/giris?returnTo=/transfer");
    expect(screen.getByRole("link", { name: "Standart ile başla" }))
      .toHaveAttribute("href", "/giris?returnTo=/transfer&plan=standard");
    expect(screen.getByRole("link", { name: "Plus'a geç" }))
      .toHaveAttribute("href", "/giris?returnTo=/transfer&plan=plus");
    expect(screen.getByRole("link", { name: "İletişime geç" }))
      .toHaveAttribute("href", "mailto:destek@vaultdrop.app");
    expect(screen.queryByText("Yakında")).not.toBeInTheDocument();
  });

  it("paket bağlantısına basıldığında seçilen paketi profil için saklar", () => {
    render(<PricingPage />);

    fireEvent.click(screen.getByRole("link", { name: "Plus'a geç" }));

    expect(localStorage.getItem("vaultdrop:selected-plan")).toBe("plus");
  });

  it("teknik işlem sınırlarını aylık kotadan ayrı açıklar", () => {
    render(<PricingPage />);

    const note = screen.getByText(/Paket kotası aylık olarak yenilenir/);
    expect(note).toHaveTextContent("Giriş yapan üyeler");
    expect(note).toHaveTextContent("15 dosya");
    expect(screen.getByText(/Giriş yapan üyeler tek VaultDrop paketinde en fazla 15 dosya ve toplam 50 MiB/)).toBeInTheDocument();
    expect(note).toHaveTextContent("Misafirler tek dosya seçebilir ve toplam 10 MiB");
    expect(note).toHaveTextContent("Canlı QR tek aktarımda 2 MiB");
    expect(note).toHaveTextContent("Yakındaki Cihazlar tek dosyada 100 MiB");
    expect(note).not.toHaveTextContent("QR Video");
    expect(document.body.textContent).not.toContain("dosya başına sınır 50 MiB");
    expect(screen.getByText(/VaultDrop paketi cihazında hazırlanır/)).toBeInTheDocument();
    expect(note).toHaveTextContent("oluşan `.vdrop` paketini");
  });

  it("Free kartında misafir sınırını doğru gösterir", () => {
    render(<PricingPage />);

    const freeCard = within(screen.getAllByTestId("pricing-card")[0]);
    expect(freeCard.getByText("Misafir: tek dosya, toplam 10 MiB")).toBeInTheDocument();
    expect(freeCard.queryByText("15 dosyaya kadar toplu seçim")).not.toBeInTheDocument();
  });

  it("Kurumsal kartında kesin aylık kotayı gösterir", () => {
    render(<PricingPage />);

    const corporateCard = within(screen.getAllByTestId("pricing-card")[3]);
    expect(corporateCard.getByText("Aylık toplam 1 GiB gönderim")).toBeInTheDocument();
    expect(corporateCard.queryByText("Aylık 1 GiB ve üzeri gönderim")).not.toBeInTheDocument();
  });
});
