import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

prepareZXingModule({
  overrides: {
    locateFile(path, prefix) {
      return path.endsWith('zxing_reader.wasm') ? '/vendor/zxing_reader.wasm' : `${prefix}${path}`;
    },
  },
});

export function createLiveQrDecodeWorkerMessageHandler({
  postMessage = (...args) => globalThis.postMessage(...args),
  decode = (imageData, options) => readBarcodes(imageData, options),
} = {}) {
  return async function handleMessage(event) {
    const { id, imageData } = event?.data ?? {};
    if (!Number.isSafeInteger(id) || !imageData) return;
    try {
      const fastOptions = {
        formats: ['QRCode'],
        tryHarder: false,
        maxNumberOfSymbols: 1,
      };
      let results = await decode(imageData, fastOptions);
      if (results.length === 0 && id % 12 === 0) {
        results = await decode(imageData, { ...fastOptions, tryHarder: true });
      }
      postMessage({
        id,
        texts: [...new Set(results.map((result) => result.text).filter((text) => typeof text === 'string'))],
      });
    } catch (error) {
      postMessage({
        id,
        error: {
          code: 'WASM_UNAVAILABLE',
          message: error instanceof Error ? error.message : 'QR çözümleyici kullanılamıyor.',
        },
      });
    }
  };
}

const isWorkerScope = typeof WorkerGlobalScope !== 'undefined'
  && globalThis instanceof WorkerGlobalScope;

if (isWorkerScope) globalThis.onmessage = createLiveQrDecodeWorkerMessageHandler();
