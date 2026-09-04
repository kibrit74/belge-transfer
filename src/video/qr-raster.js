import QRCode from "qrcode";

const QR_ERROR_CORRECTION_LEVELS = new Set(["L", "M", "Q", "H"]);

export function rasterizeQrText(text, { margin = 2, errorCorrectionLevel = "M" } = {}) {
  if (typeof text !== "string" || text.length === 0) {
    throw new TypeError("QR metni boş olamaz.");
  }
  if (!Number.isSafeInteger(margin) || margin < 0 || margin > 16) {
    throw new RangeError("QR kenarı güvenli sınırlar içinde olmalı.");
  }
  if (!QR_ERROR_CORRECTION_LEVELS.has(errorCorrectionLevel)) {
    throw new RangeError("QR hata düzeltme seviyesi geçersiz.");
  }

  const qr = QRCode.create(
    [{ data: text, mode: "byte" }],
    { errorCorrectionLevel },
  );
  const moduleCount = qr.modules.size;
  const width = moduleCount + (margin * 2);
  const pixels = new Uint8ClampedArray(width * width * 4);

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= margin && y >= margin
        && x < width - margin && y < width - margin;
      const dark = inside && qr.modules.get(y - margin, x - margin);
      const value = dark ? 0 : 255;
      const offset = ((y * width) + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }

  return { width, height: width, pixels, moduleCount, margin };
}
