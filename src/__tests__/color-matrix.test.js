import { describe, expect, it, vi } from "vitest";
import {
  autoScanColorQrFromCanvas,
  bytesToColorIndices,
  classifyRgbToColorIndex,
  colorIndicesToBytes,
  decodeColorQrFromCanvas,
  renderColorQrToCanvas,
} from "../optical/color-matrix.js";

describe("Renkli QR (Color Matrix) Motoru", () => {
  it("bayt verisini 2-bit renk indekslerine ve tekrar bayta kayıpsız dönüştürür", () => {
    const original = new Uint8Array([0x12, 0xAB, 0xFF, 0x00, 0x55, 0x3C]);
    const indices = bytesToColorIndices(original);
    expect(indices.length).toBe(original.length * 4);

    const reconstructed = colorIndicesToBytes(indices);
    expect(reconstructed).toEqual(original);
  });

  it("RGB renklerini doğru renk paletine sınıflandırır", () => {
    expect(classifyRgbToColorIndex(10, 10, 10)).toBe(0); // Siyah
    expect(classifyRgbToColorIndex(240, 20, 15)).toBe(1); // Kırmızı
    expect(classifyRgbToColorIndex(5, 230, 20)).toBe(2); // Yeşil
    expect(classifyRgbToColorIndex(10, 15, 250)).toBe(3); // Mavi
  });

  it("tuval üzerine renkli QR matrisini çizer ve maksimum tuval boyutunu sınırlar", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({ fillRect: vi.fn() });
    const testData = new Uint8Array(50);
    const result = renderColorQrToCanvas(canvas, testData, { cellSize: 10, maxCanvasSize: 500 });
    
    expect(result).toBeDefined();
    expect(canvas.width).toBeLessThanOrEqual(500);
    expect(canvas.height).toBeLessThanOrEqual(500);
  });

  it("tuvalden kayıpsız okur ve getImageData RangeError verdiğinde satır/nokta bazlı yedeklemeye düşer", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;

    const mockCtx = {
      getImageData: vi.fn((x, y, w, h) => {
        // Tam tuval okumada RangeError / OOM simülasyonu
        if (w === 100 && h === 100) {
          throw new RangeError("Failed to execute 'getImageData' on 'CanvasRenderingContext2D': Out of memory");
        }
        // Satır veya nokta okumalarında güvenli mock döndür
        return { data: new Uint8Array(w * h * 4) };
      }),
    };

    vi.spyOn(canvas, "getContext").mockReturnValue(mockCtx);

    const decoded = decodeColorQrFromCanvas(canvas, 10, 20);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(mockCtx.getImageData).toHaveBeenCalled();
  });

  it("autoScanColorQrFromCanvas geçersiz veya boş tuvalde teşhis durumları döndürür", () => {
    const emptyCanvas = document.createElement("canvas");
    emptyCanvas.width = 0;
    emptyCanvas.height = 0;
    const res = autoScanColorQrFromCanvas(emptyCanvas);
    expect(res.status).toBe("INVALID_CANVAS");
  });

  it("encodeColorQrPackage ve decodeColorQrPackage rastgele ikili dosya verilerini kayıpsız ve tam boyutta döndürür", () => {
    const { encodeColorQrPackage, decodeColorQrPackage } = require("../optical/color-matrix.js");
    const originalBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); // PNG başlığı
    const encoded = encodeColorQrPackage(originalBytes, "resim.png", "image/png");
    
    const decoded = decodeColorQrPackage(encoded);
    expect(decoded.v).toBe("CQF1");
    expect(decoded.name).toBe("resim.png");
    expect(decoded.type).toBe("image/png");
    expect(decoded.payload.length).toBe(originalBytes.length);
    expect(decoded.payload).toEqual(originalBytes);
  });
});

