import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FaqPage from "../pages/FaqPage";

describe("FaqPage", () => {
  it("landing sayfasıyla aynı navbar bağlantılarını gösterir", () => {
    render(<FaqPage />);
    const navigation = within(screen.getByRole("navigation", { name: "Ana navigasyon" }));

    expect(navigation.getByRole("link", { name: "Nasıl Çalışır?" })).toHaveAttribute(
      "href",
      "/#demo",
    );
    expect(navigation.getByRole("link", { name: "Özellikler" })).toHaveAttribute(
      "href",
      "/#features",
    );
    expect(navigation.getByRole("link", { name: "SSS" })).toHaveAttribute("href", "/sss");
    expect(navigation.getByRole("link", { name: "Paketler" })).toHaveAttribute("href", "/paketler");
    expect(within(screen.getByRole("banner")).getByRole("link", { name: /Aktarıma Başla/ })).toHaveAttribute(
      "href",
      "/giris?returnTo=/transfer",
    );
  });

  it("landing sayfasındaki tam footerı gösterir", () => {
    render(<FaqPage />);
    const footer = within(screen.getByRole("contentinfo"));

    expect(footer.getByText("HAZIRSAN BAŞLAYALIM")).toBeInTheDocument();
    expect(footer.getByText("Ürün")).toBeInTheDocument();
    expect(footer.getByText("Yardım")).toBeInTheDocument();
    expect(footer.getByText("Güven")).toBeInTheDocument();
    expect(footer.getByRole("link", { name: /Ücretsiz Aktarıma Başla/i })).toHaveAttribute(
      "href",
      "/giris?returnTo=/transfer",
    );
  });

  it("soruları metne göre filtreler", () => {
    render(<FaqPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "anahtar" } });
    expect(screen.getByText(/Anahtarı neden ayrı/)).toBeInTheDocument();
    expect(screen.queryByText("VaultDrop nedir?")).not.toBeInTheDocument();
  });

  it("güvenlik kategorisini seçer", () => {
    render(<FaqPage />);
    fireEvent.click(screen.getByRole("button", { name: "Güvenlik" }));
    expect(screen.getByText(/Dosyalarım bir sunucuya/)).toBeInTheDocument();
    expect(screen.queryByText(/QR Video neden/)).not.toBeInTheDocument();
  });

  it("arama alanını ve seçili kategoriyi erişilebilir biçimde tanımlar", () => {
    render(<FaqPage />);

    expect(screen.getByRole("searchbox", { name: "Sorularda ara" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tümü" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Teknik" }));

    expect(screen.getByRole("button", { name: "Tümü" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Teknik" })).toHaveAttribute("aria-pressed", "true");
  });

  it("eşleşme olmadığında açıklayıcı mesaj gösterir", () => {
    render(<FaqPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bulunmayan-soru" } });
    expect(screen.getByText("Aramana uygun soru bulunamadı.")).toBeInTheDocument();
  });

  it("aylık paket kotalarıyla işlem sınırlarını ayırır", () => {
    render(<FaqPage />);
    const limitAnswer = screen.getByText(/Free paket aylık toplam 10 MiB/);
    expect(limitAnswer).toHaveTextContent("Standart paket aylık toplam 50 MiB");
    expect(screen.getByText(/Plus paket aylık toplam 250 MiB/)).toBeInTheDocument();
    expect(screen.getByText(/Kurumsal paket aylık toplam 1 GiB/)).toBeInTheDocument();
    expect(limitAnswer).toHaveTextContent("Giriş yapan üyeler tek VaultDrop paketinde en fazla 15 dosya ve toplam 50 MiB");
    expect(limitAnswer).toHaveTextContent("Misafirler tek dosya ve toplam 10 MiB");
    expect(limitAnswer).toHaveTextContent("Canlı QR 2 MiB");
    expect(limitAnswer).toHaveTextContent("Yakındaki Cihazlar tek dosyada 100 MiB");
  });

  it("dosya türleri yanıtında üyelik ve misafir sınırlarını ayırır", () => {
    render(<FaqPage />);

    const typesAnswer = screen.getByText(/PDF, UDF, ofis belgesi/);
    expect(typesAnswer).toHaveTextContent("Giriş yapan üyeler tek VaultDrop paketinde en fazla 15 dosya ve toplam 50 MiB");
    expect(typesAnswer).toHaveTextContent("Misafirler tek dosya ve toplam 10 MiB");
  });
});
