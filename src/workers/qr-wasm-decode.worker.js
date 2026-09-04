import {
  prepareZXingModule,
  readBarcodes,
} from "zxing-wasm/reader";

prepareZXingModule({
  overrides: {
    locateFile(path, prefix) {
      return path.endsWith("zxing_reader.wasm")
        ? "/vendor/zxing_reader.wasm"
        : `${prefix}${path}`;
    },
  },
});

self.onmessage = async (event) => {
  const { id, imageData } = event.data ?? {};
  if (!Number.isSafeInteger(id) || !imageData) return;

  try {
    const results = await readBarcodes(imageData, {
      formats: ["QRCode"],
      tryHarder: false,
      maxNumberOfSymbols: 1,
    });
    self.postMessage({ id, texts: results.map((item) => item.text) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "QR bölgesi çözülemedi.",
    });
  }
};
