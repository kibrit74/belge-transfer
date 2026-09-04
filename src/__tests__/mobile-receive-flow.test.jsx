import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../ReceivePanel", () => ({
  default: () => <div>Kamera alım ekranı</div>,
}));

import App from "../App";
import { AuthContext } from "../auth/AuthContext.jsx";

function renderAuthenticatedApp() {
  return render(
    <AuthContext.Provider value={{ user: { id: "user-1", displayName: "Üye", plan: "free" }, status: "ready" }}>
      <App />
    </AuthContext.Provider>,
  );
}

describe("mobil alım akışı", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/transfer");
  });

  afterEach(cleanup);

  it("Al sekmesinde varsayılan olarak VaultDrop açma alanını gösterir", async () => {
    renderAuthenticatedApp();

    fireEvent.click(screen.getByRole("button", { name: "Al" }));

    expect(await screen.findByLabelText("VaultDrop paket dosyası")).toBeInTheDocument();
    expect(screen.getByLabelText("Paket anahtarı")).toBeInTheDocument();
    expect(screen.queryByLabelText("Çözülecek QR video")).not.toBeInTheDocument();
    expect(screen.queryByText("Kamera alım ekranı")).not.toBeInTheDocument();
  });

  it("Kameradan tara seçilince kamera alım ekranını gösterir", async () => {
    renderAuthenticatedApp();
    fireEvent.click(screen.getByRole("button", { name: "Al" }));

    fireEvent.click(screen.getByRole("button", { name: /Kameradan tara/ }));

    expect(await screen.findByText("Kamera alım ekranı")).toBeInTheDocument();
    expect(screen.queryByLabelText("Çözülecek QR video")).not.toBeInTheDocument();
  });

  it("mobil Al ekranında QR Video yerine üç aktif yöntemi gösterir", () => {
    renderAuthenticatedApp();
    fireEvent.click(screen.getByRole("button", { name: "Al" }));

    expect(screen.getByRole("heading", { name: "Nasıl alacaksın?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /VaultDrop paketini aç/ })).toBeInTheDocument();
    expect(screen.getByText(".vdrop veya eski .bta paketini ayrı gelen anahtarla aç.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kameradan tara/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yakındaki cihaz kodunu gir/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /QR video dosyası/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Çözülecek QR video")).not.toBeInTheDocument();
  });
});
