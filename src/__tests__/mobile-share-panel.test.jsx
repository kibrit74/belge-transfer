import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MobileSharePanel from "../MobileSharePanel.jsx";

afterEach(() => vi.restoreAllMocks());

describe("mobilden mobile paylaşım", () => {
  it("VaultDrop paketi ve QR Video yöntemlerini gösterir", () => {
    render(<MobileSharePanel user={{ id: "user-1", plan: "free" }} />);

    expect(screen.getByRole("button", { name: /^VaultDrop paketi\.vdrop/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /QR Video/ })).toBeInTheDocument();
    expect(screen.getByText(".vdrop cihazında hazırlanır")).toBeInTheDocument();
    expect(screen.queryByText(/Güvenli bağlantı/)).not.toBeInTheDocument();
  });

  it("varsayılan mobil yöntemde yerel paket oluşturma alanını gösterir", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<MobileSharePanel user={{ id: "user-1", plan: "free" }} />);

    expect(screen.getByLabelText("Paketlenecek belge")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
