import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SecurePackagePanel from "../SecurePackagePanel";

const secretText = "DOSYA-ICERIGI-GIZLI";
const secretKey = "K".repeat(43);
const secretName = "gizli.txt";
const encryptedPackageBytesMarker = "SIFRELI-PAKET-BYTE-IZI";

function apiResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

async function serializeFetchBody(body) {
  if (body === undefined || body === null) return null;
  if (body instanceof Blob) {
    return {
      kind: "Blob",
      name: typeof body.name === "string" ? body.name : null,
      text: await body.text(),
      type: body.type,
    };
  }
  if (body instanceof ArrayBuffer) {
    return { kind: "ArrayBuffer", text: bytesToText(new Uint8Array(body)) };
  }
  if (ArrayBuffer.isView(body)) {
    return {
      kind: body.constructor.name,
      text: bytesToText(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)),
    };
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return {
      kind: "FormData",
      entries: await Promise.all(
        [...body.entries()].map(async ([name, value]) => [name, await serializeFetchBody(value)]),
      ),
    };
  }
  if (body instanceof URLSearchParams) {
    return { kind: "URLSearchParams", text: body.toString() };
  }
  return body;
}

async function serializeFetchCalls(calls) {
  const requests = await Promise.all(calls.map(async ([url, options = {}]) => ({
    body: await serializeFetchBody(options?.body),
    url: String(url),
  })));
  return JSON.stringify(requests);
}

describe("VaultDrop ağ izolasyonu", () => {
  let anchorClickMock;

  afterEach(() => {
    anchorClickMock?.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("Blob, ArrayBuffer ve FormData gövdelerindeki paket byte izini görünür kılar", async () => {
    const formData = new FormData();
    formData.append(
      "package",
      new File([encryptedPackageBytesMarker], secretName, { type: "application/octet-stream" }),
    );
    const serializedCalls = await serializeFetchCalls([
      ["/blob", { body: new Blob([encryptedPackageBytesMarker]) }],
      ["/array-buffer", { body: new TextEncoder().encode(encryptedPackageBytesMarker).buffer }],
      ["/form-data", { body: formData }],
    ]);

    expect(serializedCalls).toContain(encryptedPackageBytesMarker);
    expect(serializedCalls).toContain(secretName);
  });

  it("paket oluştururken ve açmayı başlatırken gizli değerleri yalnızca cihazda tutar", async () => {
    const fetchSpy = vi.fn(async (path) => {
      if (path === "/api/transfers/reservations") {
        return apiResponse({ id: "reservation-1" }, 201);
      }
      if (path === "/api/transfers/reservation-1") {
        return apiResponse({ id: "reservation-1", status: "completed" });
      }
      throw new Error(`Beklenmeyen ağ isteği: ${path}`);
    });
    const packageClient = {
      close: vi.fn(),
      create: vi.fn().mockResolvedValue({
        blob: new Blob([encryptedPackageBytesMarker]),
        keyText: secretKey,
        transferId: "Ab12Cd34Ef56",
        sha256: "B".repeat(43),
        compression: "zlib",
        originalSize: secretText.length,
        savedPercent: 0,
        storedSize: secretText.length,
      }),
    };

    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:vaultdrop-test"),
      revokeObjectURL: vi.fn(),
    });
    anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <SecurePackagePanel
        view="both"
        packageClient={packageClient}
        user={{ id: "member-1", plan: "standard" }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Paketlenecek belge"), {
      target: { files: [new File([secretText], secretName, { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "VaultDrop paketi oluştur" }));
    expect(await screen.findByRole("link", { name: "VaultDrop paketini indir" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("VaultDrop paket dosyası"), {
      target: { files: [new File(["BTA2"], "alınan.vdrop")] },
    });
    fireEvent.change(screen.getByLabelText("Paket anahtarı"), { target: { value: secretKey } });
    fireEvent.click(screen.getByRole("button", { name: "Paketi çöz" }));
    await screen.findByText("Geçersiz veya eksik şifreli paket.");

    const serializedFetchCalls = await serializeFetchCalls(fetchSpy.mock.calls);
    expect(fetchSpy.mock.calls.map(([path]) => path)).toEqual([
      "/api/transfers/reservations",
      "/api/transfers/reservation-1",
    ]);
    expect(serializedFetchCalls).not.toContain(secretText);
    expect(serializedFetchCalls).not.toContain(secretKey);
    expect(serializedFetchCalls).not.toContain(secretName);
    expect(serializedFetchCalls).not.toContain(encryptedPackageBytesMarker);
  });
});
