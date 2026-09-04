import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SecureLinkReceivePage from "../pages/SecureLinkReceivePage.jsx";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("kaldırılan güvenli bağlantı sayfası", () => {
  it("paket veya URL anahtarını okumadan kaldırılma mesajını gösterir", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    window.history.replaceState({}, "", `/al/eski-kayit#${"key=gizli-anahtar"}`);
    render(<SecureLinkReceivePage />);

    expect(screen.getByRole("heading", {
      name: "Bu bağlantı yöntemi artık desteklenmiyor.",
    })).toBeInTheDocument();
    expect(screen.getByText(/\.vdrop paketi ve ayrı anahtarı/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("gizli-anahtar");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
