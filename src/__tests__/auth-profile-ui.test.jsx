import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/AuthContext.jsx";
import SiteNavbar from "../components/SiteNavbar.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import ProfilePage from "../pages/ProfilePage.jsx";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("../api/client.js", () => ({ apiRequest: apiRequestMock }));

const member = {
  id: "user-1",
  email: "uye@example.com",
  displayName: "VaultDrop Üyesi",
  avatarUrl: null,
  plan: "member",
};

describe("üyelik arayüzü", () => {
  it("giriş faydalarını ikonlu premium kart yapısında gösterir", () => {
    render(<LoginPage />);

    expect(document.querySelectorAll(".login-benefits .benefit-icon")).toHaveLength(3);
    expect(document.querySelectorAll(".login-benefits .benefit-copy")).toHaveLength(3);
    expect(screen.getByText("VaultDrop ile tek pakette çoklu seçim.")).toBeInTheDocument();
  });

  beforeEach(() => {
    apiRequestMock.mockImplementation((path) => Promise.resolve(path.endsWith("/summary") ? {
      transfer_count: 2,
      file_count: 3,
      total_size_bytes: 19398656,
      plan: "standard",
      monthly_used_bytes: 19398656,
      monthly_limit_bytes: 52428800,
      monthly_remaining_bytes: 33030144,
      period_end: "2026-09-01T00:00:00.000Z",
    } : { transfers: [] }));
  });

  it("misafire navbar içinde giriş bağlantısı gösterir", () => {
    render(<SiteNavbar />);
    expect(screen.getByRole("link", { name: "Giriş yap" })).toHaveAttribute("href", "/giris");
    expect(screen.getByRole("link", { name: /Aktarıma Başla/i })).toHaveAttribute("href", "/giris?returnTo=/transfer");
  });

  it("üyeye profil bağlantısı gösterir", () => {
    render(
      <AuthContext.Provider value={{ user: member, status: "ready" }}>
        <SiteNavbar />
      </AuthContext.Provider>,
    );
    expect(screen.getByRole("link", { name: "Profilim" })).toHaveAttribute("href", "/profil");
  });

  it("profil sayfasında kullanıcı ve aylık paket kullanımını gösterir", async () => {
    render(
      <AuthContext.Provider value={{ user: member, status: "ready", logout: () => {} }}>
        <ProfilePage />
      </AuthContext.Provider>,
    );
    expect(screen.getByText("VaultDrop Üyesi")).toBeInTheDocument();
    expect(await screen.findByText(/AYLIK KULLANIM · STANDART/i)).toBeInTheDocument();
    expect(screen.getByText("18.5 MiB / 50 MiB")).toBeInTheDocument();
    expect(screen.getByText("1 Eylül’de yenilenir")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Aylık veri kullanımı" })).toHaveAttribute("aria-valuetext", "18.5 MiB / 50 MiB");
    expect(screen.queryByText(/QR Video için toplam 15 MiB/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Yeni aktarım/i })).toHaveAttribute("href", "/transfer");
    expect(screen.getAllByTestId("profile-stat-icon")).toHaveLength(3);
    expect(screen.getByText("İlk güvenli aktarımını oluştur")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /İlk aktarımı başlat/i })).toHaveAttribute("href", "/transfer");
  });

  it("işlem geçmişinde uzak aktarım yöntemini VaultDrop olarak etiketler", async () => {
    apiRequestMock.mockImplementation((path) => Promise.resolve(path.endsWith("/summary") ? {
      transfer_count: 1,
      file_count: 1,
      total_size_bytes: 1024,
      plan: "standard",
      monthly_used_bytes: 1024,
      monthly_limit_bytes: 52428800,
      monthly_remaining_bytes: 52427776,
      period_end: "2026-09-01T00:00:00.000Z",
    } : {
      transfers: [{
        id: "transfer-1",
        method: "secure_package",
        created_at: "2026-08-13T10:00:00.000Z",
        file_count: 1,
        total_size_bytes: 1024,
        status: "completed",
      }],
    }));

    render(
      <AuthContext.Provider value={{ user: member, status: "ready", logout: () => {} }}>
        <ProfilePage />
      </AuthContext.Provider>,
    );

    expect(await screen.findByText("VaultDrop")).toBeInTheDocument();
  });

  it("profil API kullanılamadığında kullanıcının seçili paketini açık gösterir", async () => {
    apiRequestMock.mockRejectedValue(new Error("api yok"));

    render(
      <AuthContext.Provider value={{ user: { ...member, plan: "plus" }, status: "ready", logout: () => {} }}>
        <ProfilePage />
      </AuthContext.Provider>,
    );

    expect(await screen.findByText(/AYLIK KULLANIM · PLUS/i)).toBeInTheDocument();
    expect(screen.getByText("Seçili paket: Plus")).toBeInTheDocument();
    expect(screen.getByText("0 B / 250 MiB")).toBeInTheDocument();
    expect(screen.queryByText("Kullanım bilgisi alınamadı")).not.toBeInTheDocument();
  });
});
