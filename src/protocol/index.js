export { crc32Hex } from "./crc32.js";
export {
  DEFAULT_CHUNK_BYTES,
  MAX_FRAME_COUNT,
  MAX_INPUT_BYTES,
  PROTOCOL_VERSION,
  encodeFramesV3,
  parseFrameV3,
} from "./frame-v3.js";
export { sha256Base64Url } from "./hash.js";
export {
  OPTICAL_PROTOCOL_VERSION,
  encodeFrameV4,
  parseFrameV4,
} from "../optical/frame-v4.js";
export { encodeLiveFrame, parseLiveFrame } from "../live-qr/frame-v1.js";

import { parseFrameV3 } from "./frame-v3.js";
import { parseLegacyFrame } from "./legacy.js";
import { parseFrameV4 } from "../optical/frame-v4.js";
import { parseLiveFrame } from "../live-qr/frame-v1.js";

export function parseFrame(text) {
  if (typeof text !== "string") return null;
  if (text.startsWith("QRL1|")) return parseLiveFrame(text);
  if (text.startsWith("QRF1|")) return parseFrameV4(text);
  if (text.startsWith("QRT3|")) return parseFrameV3(text);
  return parseLegacyFrame(text);
}
