import QRCode from "qrcode";
import { describe, expect, it, vi } from "vitest";
import { rasterizeQrText } from "../video/qr-raster.js";

describe("standart QR doğal rasterı", () => {
  it("modül başına tek piksel ve iki modül beyaz kenar üretir", () => {
    const raster = rasterizeQrText("HELLO WORLD");

    expect(raster).toMatchObject({ moduleCount: 21, margin: 2, width: 25, height: 25 });
    expect(raster.pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(raster.pixels).toHaveLength(25 * 25 * 4);
    expect(Array.from(raster.pixels.slice(0, 4))).toEqual([255, 255, 255, 255]);
  });

  it("yalnız tam opak siyah ve beyaz piksel üretir", () => {
    const { pixels } = rasterizeQrText("QRF1|test-verisi");
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
    }
    expect(colors).toEqual(new Set(["255,255,255,255", "0,0,0,255"]));
  });

  it("uzun QRF1 metninde pahalı otomatik bölümlemeyi çalıştırmaz", () => {
    const createSpy = vi.spyOn(QRCode, "create");

    rasterizeQrText("QRF1|test-verisi");

    expect(createSpy).toHaveBeenCalledWith(
      [{ data: "QRF1|test-verisi", mode: "byte" }],
      { errorCorrectionLevel: "M" },
    );
    createSpy.mockRestore();
  });

  it("Canlı QR için düşük hata düzeltme seviyesi seçimine izin verir", () => {
    const createSpy = vi.spyOn(QRCode, "create");

    rasterizeQrText("QRL2|yoğun-veri", { errorCorrectionLevel: "L" });

    expect(createSpy).toHaveBeenCalledWith(
      [{ data: "QRL2|yoğun-veri", mode: "byte" }],
      { errorCorrectionLevel: "L" },
    );
    createSpy.mockRestore();
  });

  it("boş olmayan metin ve güvenli kenar ister", () => {
    expect(() => rasterizeQrText("")).toThrow(TypeError);
    expect(() => rasterizeQrText("veri", { margin: -1 })).toThrow(RangeError);
  });
});
