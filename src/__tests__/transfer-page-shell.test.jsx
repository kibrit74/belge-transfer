import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TransferPage from "../pages/TransferPage";

describe("TransferPage navbar", () => {
  it("landing menüsünü ve en sağda yalnızca ana sayfa ikonunu gösterir", () => {
    render(<TransferPage />);

    expect(screen.getByRole("link", { name: "Nasıl Çalışır?" })).toHaveAttribute(
      "href",
      "/#demo",
    );
    expect(screen.getByRole("link", { name: "Özellikler" })).toHaveAttribute(
      "href",
      "/#features",
    );
    expect(screen.getByRole("link", { name: "SSS" })).toHaveAttribute("href", "/sss");
    expect(screen.getByRole("link", { name: "Ana sayfaya dön" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("link", { name: /Aktarıma Başla/i })).not.toBeInTheDocument();
  });

  it("gönder ve al için üç yöntemli karar ekranlarını gösterir", () => {
    render(<TransferPage />);

    expect(screen.getByRole("heading", { name: "Alıcı nerede?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /VaultDrop — Uzak cihaz/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yakındaki Cihazlar/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Al" }));
    expect(screen.getByRole("heading", { name: "Nasıl alacaksın?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kameradan tara/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yakındaki cihaz kodunu gir/ })).toBeInTheDocument();
  });
});
