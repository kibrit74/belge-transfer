import { parseLiveFrame as parseLiveFrameV1 } from './frame-v1.js';
import { parseLiveFrameV2 } from './frame-v2.js';

export function parseLiveFrame(text) {
  if (typeof text !== 'string') return null;
  if (text.startsWith('QRL2|')) return parseLiveFrameV2(text);
  if (text.startsWith('QRL1|')) return parseLiveFrameV1(text);
  return null;
}
