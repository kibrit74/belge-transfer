import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingPage from "../pages/LandingPage";
import TransferDemo from "../components/TransferDemo";

afterEach(() => {
  vi.useRealTimers();
});

describe("LandingPage", () => {
  it("sayfa kaydırıldığında üst menüyü sabit moda geçirmez", () => {
    render(<LandingPage />);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 240 });

    act(() => window.dispatchEvent(new Event("scroll")));

    expect(document.querySelector(".landing-nav")).not.toHaveClass("is-scrolled");
  });

  it("üst menüdeki SSS ve Paketler bağlantılarını ayrı sayfalara yönlendirir", () => {
    render(<LandingPage />);
    const navigation = within(screen.getByRole("navigation", { name: "Ana navigasyon" }));
    expect(navigation.getByRole("link", { name: "SSS" })).toHaveAttribute("href", "/sss");
    expect(navigation.getByRole("link", { name: "Paketler" })).toHaveAttribute("href", "/paketler");
  });

  it("hero mockupını gerçek aktarım ekranının başlangıç durumuyla eşleştirir", () => {
    render(<LandingPage />);

    const methods = document.querySelectorAll(".mock-methods b");
    expect(methods[0]).toHaveTextContent("Canlı QR");
    expect(methods[0]).toHaveTextContent("Yan yana cihazlar");
    expect(methods[1]).toHaveTextContent("Yakındaki Cihazlar");
    expect(methods[1]).toHaveTextContent("Aynı Wi-Fi'daki tarayıcılar");
    expect(methods[2]).toHaveTextContent("VaultDrop");
    expect(methods).toHaveLength(3);
    expect(document.querySelector(".mock-drop")).toHaveTextContent("Dosya seç");
    expect(document.querySelector(".mock-drop")).toHaveTextContent("PDF, UDF, DOCX");
  });

  it("oturumsuz ana CTA ile giriş sayfasına bağlanır", () => {
    render(<LandingPage />);
    const links = screen.getAllByRole("link", { name: /ücretsiz aktarıma başla/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute("href", "/giris?returnTo=/transfer"));
  });

  it("hesapsız kullanım yerine ücretsiz üyelik kuralını anlatır", () => {
    render(<LandingPage />);
    expect(screen.queryByText(/hesapsız kullanım/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hesap açmadan/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/ücretsiz hesap/i).length).toBeGreaterThan(0);
  });

  it("UDF ile üyelik ve misafir Şifreli Paket sınırlarını gösterir", () => {
    render(<LandingPage />);

    expect(screen.getByText("UDF")).toBeInTheDocument();
    expect(screen.getAllByText(/giriş yapan üyeler tek VaultDrop paketinde.*toplam 50 MiB/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Misafirler tek dosya.*toplam 10 MiB/i).length).toBeGreaterThan(0);
  });

  it("Canlı QR, Yakındaki Cihazlar ve VaultDrop demolarını sunar", () => {
    render(<LandingPage />);
    const stage = screen.getByTestId("transfer-demo-stage");
    expect(stage).toHaveTextContent("CANLI QR");
    expect(stage).toHaveTextContent("YAKINDAKİ CİHAZLAR");
    expect(stage).toHaveTextContent("VAULTDROP");
    expect(stage).toHaveTextContent("DOSYA.VDROP");
    expect(stage).toHaveTextContent(".VDROP");
    expect(stage).toHaveTextContent("AYRI GELEN ANAHTAR");
  });

  it("telefon mockupında taranan QR dokusunu ve tarama ışığını gösterir", () => {
    render(<TransferDemo />);

    expect(screen.getByLabelText("Telefonda taranan QR kodu")).toBeInTheDocument();
    expect(screen.getByTestId("phone-scan-beam")).toBeInTheDocument();
  });

  it("demo kullanıcı oynatmayı seçtiğinde tarama ışığını ve şifreli paketi hareket ettirir", () => {
    vi.useFakeTimers();
    render(<TransferDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Animasyonu oynat" }));

    act(() => vi.advanceTimersByTime(1_000));
    act(() => vi.advanceTimersByTime(240));
    const scanBeam = screen.getByTestId("phone-scan-beam");
    expect(Number(scanBeam.style.getPropertyValue("--motion-progress"))).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(8_760));
    act(() => vi.advanceTimersByTime(240));
    const movingPackage = screen.getByTestId("moving-package");
    expect(Number(movingPackage.style.getPropertyValue("--motion-progress"))).toBeGreaterThan(0);
  });

  it("demo kullanıcı başlatmadan sahne değiştirmez; kullanıcı başlatınca ilerler ve durdurulabilir", () => {
    vi.useFakeTimers();
    render(
      <StrictMode>
        <TransferDemo />
      </StrictMode>,
    );
    const stage = screen.getByTestId("transfer-demo-stage");

    expect(stage).toHaveAttribute("data-scene", "live");

    act(() => vi.advanceTimersByTime(4_000));
    expect(stage).toHaveAttribute("data-scene", "live");

    fireEvent.click(screen.getByRole("button", { name: "Animasyonu oynat" }));
    expect(screen.getByRole("button", { name: "Animasyonu durdur" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_000));
    expect(stage).toHaveAttribute("data-scene", "nearby");

    act(() => vi.advanceTimersByTime(4_000));
    expect(stage).toHaveAttribute("data-scene", "package");

    fireEvent.click(screen.getByRole("button", { name: "Animasyonu durdur" }));
    act(() => vi.advanceTimersByTime(4_000));
    expect(stage).toHaveAttribute("data-scene", "package");
  });
});
