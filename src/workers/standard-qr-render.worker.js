import { rasterizeQrText } from "../video/qr-raster.js";

export function createQrRasterWorkerMessageHandler(dependencies = {}) {
  const postMessage = dependencies.postMessage ?? ((...args) => globalThis.postMessage(...args));
  const rasterize = dependencies.rasterize ?? rasterizeQrText;

  return async function handleMessage(event) {
    const { id, frameIndex, regionIndex, text } = event?.data ?? {};
    try {
      const raster = rasterize(text);
      const result = { id, frameIndex, regionIndex, ...raster };
      postMessage(result, [raster.pixels.buffer]);
    } catch (error) {
      postMessage({
        id,
        error: {
          code: "QR_RENDER_ERROR",
          message: error instanceof Error ? error.message : "QR karesi hazırlanamadı.",
        },
      });
    }
  };
}

if (typeof WorkerGlobalScope !== "undefined"
  && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = createQrRasterWorkerMessageHandler();
}
