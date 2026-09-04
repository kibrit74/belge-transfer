import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthContext } from "../auth/AuthContext.jsx";
import SiteNavbar from "../components/SiteNavbar.jsx";

afterEach(() => {
  document.body.classList.remove("mobile-nav-open");
});

function renderNavbar(user = null) {
  return render(
    <AuthContext.Provider value={{ user, status: "ready", logout: async () => {} }}>
      <SiteNavbar />
    </AuthContext.Provider>,
  );
}

describe("SiteNavbar mobil menü", () => {
  it("hamburger düğmesiyle menüyü açar ve Escape ile kapatır", () => {
    renderNavbar();
    const trigger = screen.getByRole("button", { name: "Menüyü aç" });

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Mobil menü" })).toBeInTheDocument();
    expect(document.body).toHaveClass("mobile-nav-open");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Mobil menü" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("mobile-nav-open");
  });

  it("arka katmana dokunulduğunda menüyü kapatır", () => {
    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: "Menüyü aç" }));

    fireEvent.click(screen.getByTestId("mobile-nav-backdrop"));

    expect(screen.queryByRole("dialog", { name: "Mobil menü" })).not.toBeInTheDocument();
  });

  it("misafire giriş, üyeye profil bağlantısı gösterir", () => {
    const guest = renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: "Menüyü aç" }));
    expect(within(screen.getByRole("dialog", { name: "Mobil menü" })).getByRole("link", { name: "Giriş yap" })).toHaveAttribute("href", "/giris");
    guest.unmount();

    renderNavbar({ id: "user-1", displayName: "Ayşe", avatarUrl: null });
    fireEvent.click(screen.getByRole("button", { name: "Menüyü aç" }));
    const memberDialog = within(screen.getByRole("dialog", { name: "Mobil menü" }));
    expect(memberDialog.getByRole("link", { name: "Profilim" })).toHaveAttribute("href", "/profil");
    expect(memberDialog.queryByRole("link", { name: "Giriş yap" })).not.toBeInTheDocument();
  });
});
