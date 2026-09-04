import { readFileSync } from "node:fs";

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppEntry } from "../app-entry.jsx";
import App from "../App.jsx";

describe("uygulama kök giriş rotası", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/al/eski-paket");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("/al/:id rotasını gerçek kök zincirinde AuthProvider oturumu başlatmadan emeklilik sayfası olarak işler", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const AuthBoundary = () => {
      throw new Error("AuthProvider /al/:id için çalışmamalıdır.");
    };
    render(<AppEntry AuthBoundary={AuthBoundary} />);

    expect(screen.getByRole("heading", { name: "Bu bağlantı yöntemi artık desteklenmiyor." })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("kaldırılan renkli QR laboratuvarı adresini açmaz", () => {
    window.history.replaceState({}, "", "/renkli-qr-test");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Bu sayfa bulunamadı." })).toBeInTheDocument();
  });

  it("renkli QR laboratuvarını ürün uygulamasına bağlamaz", () => {
    const appSource = readFileSync("src/App.jsx", "utf8");

    expect(appSource).not.toContain("ColorQrLabPage");
  });
});
