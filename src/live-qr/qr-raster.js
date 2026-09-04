import { rasterizeQrText } from '../video/qr-raster.js';

export function rasterizeLiveQrText(text, { margin = 2 } = {}) {
  return rasterizeQrText(text, { margin, errorCorrectionLevel: 'L' });
}
