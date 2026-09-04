import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SecurePackagePanel from "../SecurePackagePanel.jsx";
import { useMethodHandoff } from "../transfer/use-method-handoff.js";

function HandoffHarness({ file }) {
  const { handoff, requestHandoff, consumeHandoff } = useMethodHandoff();
  return (
    <div>
      <button type="button" onClick={() => requestHandoff({ from: "nearby", to: "package", reason: "timeout", file })}>
        Geçiş iste
      </button>
      <button type="button" onClick={() => consumeHandoff("package")}>Geçişi tüket</button>
      <output>{handoff?.file.name ?? "boş"}</output>
    </div>
  );
}

describe("VaultDrop yöntem geçişi", () => {
  it("File nesnesini bellekte tek kullanımlık taşır", () => {
    const file = new File(["işaret"], "rapor.xlsx");
    render(<HandoffHarness file={file} />);

    fireEvent.click(screen.getByRole("button", { name: "Geçiş iste" }));
    expect(screen.getByText("rapor.xlsx")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Geçişi tüket" }));
    expect(screen.getByText("boş")).toBeInTheDocument();
  });

  it("VaultDrop başlangıç dosyasını yeniden ağdan istemeden seçer", async () => {
    const file = new File(["DOSYA-MARKERI"], "rapor.xlsx");
    const packageClient = { create: vi.fn(), close: vi.fn() };
    render(<SecurePackagePanel
      view="create"
      user={{ id: "user-1", plan: "standard" }}
      packageClient={packageClient}
      initialFile={file}
    />);

    expect(await screen.findByText("rapor.xlsx")).toBeInTheDocument();
    expect(packageClient.create).not.toHaveBeenCalled();
  });
});
