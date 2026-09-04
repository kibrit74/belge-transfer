import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App.jsx";
import { AuthContext } from "../auth/AuthContext.jsx";

afterEach(() => window.history.replaceState({}, "", "/"));

describe("aktarim rotası", () => {
  it("oturumu olmayan kullanıcıya yerel paket aktarım sayfasını gösterir", async () => {
    window.history.replaceState({}, "", "/transfer");

    render(
      <AuthContext.Provider value={{ user: null, status: "ready", logout: async () => {} }}>
        <App />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "Güvenli dosya aktarımı" })).toBeInTheDocument();
    const transferRoute = screen.getByRole("region", { name: "Alıcı nerede?" });
    expect(within(transferRoute).getByRole("button", { name: /Uzak cihaz/ })).toBeInTheDocument();
    expect(within(transferRoute).queryByRole("button", { name: /QR Video/ })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Paketlenecek belge")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/transfer"));
  });

  it("oturum doğrulanırken aktarım araçlarını göstermez", () => {
    window.history.replaceState({}, "", "/transfer");

    render(
      <AuthContext.Provider value={{ user: null, status: "loading", logout: async () => {} }}>
        <App />
      </AuthContext.Provider>,
    );

    expect(screen.queryByRole("heading", { name: "Güvenli dosya aktarımı" })).not.toBeInTheDocument();
    expect(screen.getByText("Oturumun kontrol ediliyor…")).toBeInTheDocument();
  });

  it("oturumlu kullanıcıya aktarım sayfasını gösterir", () => {
    window.history.replaceState({}, "", "/transfer");

    render(
      <AuthContext.Provider value={{ user: { id: "user-1", displayName: "Üye", plan: "free" }, status: "ready" }}>
        <App />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "Güvenli dosya aktarımı" })).toBeInTheDocument();
  });
});
