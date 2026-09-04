import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nearbyPanelProps = vi.hoisted(() => ({ current: null }));
const featureFlags = vi.hoisted(() => ({ nearbyEnabled: true }));

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("../config/feature-flags.js", () => ({
  getFeatureFlags: () => ({
    nearbyEnabled: featureFlags.nearbyEnabled,
    liveQr10MiBEnabled: true,
    liveQrFastProfileEnabled: false,
  }),
}));

vi.mock("../NearbyTransferPanel.jsx", () => ({
  default: (props) => {
    nearbyPanelProps.current = props;
    return <p>Yakındaki alım · {props.initialCode || "kod yok"}</p>;
  },
}));

vi.mock("../SecurePackagePanel.jsx", () => ({
  default: () => <p>VaultDrop paket paneli</p>,
}));

import TransferPage from "../pages/TransferPage.jsx";

describe("Yakındaki Cihazlar davet yönlendirmesi", () => {
  afterEach(() => {
    featureFlags.nearbyEnabled = true;
    nearbyPanelProps.current = null;
    window.history.replaceState({}, "", "/transfer");
  });

  it("geçerli davet URL'sinde Al ve Yakındaki Cihazlar seçer ama otomatik katılmaz", async () => {
    window.history.replaceState({}, "", "/transfer?nearby=abc234");

    render(<TransferPage />);

    expect(await screen.findByText("Yakındaki alım · ABC234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Al" })).toHaveClass("active");
    expect(nearbyPanelProps.current).toMatchObject({ mode: "receive", initialCode: "ABC234" });
  });

  it("geçersiz davet kodunda varsayılan VaultDrop ekranını korur", async () => {
    window.history.replaceState({}, "", "/transfer?nearby=O0I1XX");

    render(<TransferPage />);

    expect(await screen.findByText("VaultDrop paket paneli")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Yakındaki Cihazlar davet bağlantısı geçersiz. Yeni bir davet iste.",
    );
  });

  it("Yakındaki Cihazlar kapalıyken daveti varsayılan VaultDrop ekranında bırakır", async () => {
    featureFlags.nearbyEnabled = false;
    window.history.replaceState({}, "", "/transfer?nearby=ABC234");

    render(<TransferPage />);

    expect(await screen.findByText("VaultDrop paket paneli")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gönder" })).toHaveClass("active");
    expect(nearbyPanelProps.current).toBeNull();
  });
});
