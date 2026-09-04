import { rasterizeLiveQrText } from '../live-qr/qr-raster.js';

export function createLiveQrRasterWorkerMessageHandler({
  postMessage = (...args) => globalThis.postMessage(...args),
  rasterize = rasterizeLiveQrText,
} = {}) {
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
          code: 'QR_RENDER_ERROR',
          message: error instanceof Error ? error.message : 'Canlı QR karesi hazırlanamadı.',
        },
      });
    }
  };
}

const isWorkerScope = typeof WorkerGlobalScope !== 'undefined'
  && globalThis instanceof WorkerGlobalScope;

if (isWorkerScope) globalThis.onmessage = createLiveQrRasterWorkerMessageHandler();
