import { describe, expect, it } from "vitest";
import {
  COLOR_PROTOCOL_VERSION,
  encodeColorFrameV1,
  parseColorFrameV1,
} from "../optical/color-frame-v1.js";

describe("Renkli QR Frame Protocol V1 (CRF1)", () => {
  it("renkli kare verisini CRF1 formatında kodlar ve kayıpsız ayrıştırır", () => {
    const metadata = { transferId: "TestTransfer12", emittedSymbols: 10, sourceCount: 8 };
    const symbol = { symbolId: 3, data: new Uint8Array([0xAA, 0x55, 0xFF, 0x00]) };

    const encoded = encodeColorFrameV1(metadata, symbol);
    expect(encoded).toContain(`${COLOR_PROTOCOL_VERSION}:TestTransfer12:3:10:`);

    const parsed = parseColorFrameV1(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed.protocolVersion).toBe("CRF1");
    expect(parsed.transferId).toBe("TestTransfer12");
    expect(parsed.symbolId).toBe(3);
    expect(parsed.totalSymbols).toBe(10);
    expect(parsed.data).toEqual(symbol.data);
  });

  it("geçersiz renkli kare metnini null olarak reddeder", () => {
    expect(parseColorFrameV1("INVALID:123")).toBeNull();
    expect(parseColorFrameV1("")).toBeNull();
  });
});
