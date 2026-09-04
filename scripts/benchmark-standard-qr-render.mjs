import { createFountainEncoder } from "../src/optical/fountain.js";
import { encodeFrameV4 } from "../src/optical/frame-v4.js";
import { rasterizeQrText } from "../src/video/qr-raster.js";

const byteLength = Math.round(2.36 * 1024 * 1024);
const blockBytes = 1400;
const emissionRatio = 1.5;
const qrPerFrame = 2;
const framesPerSecond = 24;
const sampleCount = 30;
const bytes = deterministicBytes(byteLength);
const fountain = await createFountainEncoder(bytes, {
  transferId: "QrBench236Mb",
  blockBytes,
  emissionRatio,
});

let elapsedMs = 0;
let naturalPixels = 0;
for (let symbolId = 0; symbolId < sampleCount; symbolId += 1) {
  const frameText = encodeFrameV4(fountain.metadata, fountain.symbol(symbolId));
  const startedAt = performance.now();
  const raster = rasterizeQrText(frameText);
  elapsedMs += performance.now() - startedAt;
  naturalPixels += raster.width * raster.height;
}

const naturalPixelsPerQr = Math.round(naturalPixels / sampleCount);
const legacyPixelsPerQr = 900 * 900;
const emittedSymbols = fountain.metadata.emittedSymbols;
const videoFrames = Math.ceil(emittedSymbols / qrPerFrame);
const result = {
  byteLength,
  sourceSymbols: fountain.metadata.sourceCount,
  emittedSymbols,
  videoFrames,
  nominalSeconds: Math.ceil(videoFrames / framesPerSecond),
  naturalPixelsPerQr,
  legacyPixelsPerQr,
  pixelReductionRatio: Number((legacyPixelsPerQr / naturalPixelsPerQr).toFixed(2)),
  sampledQrAverageMs: Number((elapsedMs / sampleCount).toFixed(2)),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (result.nominalSeconds > 60) process.exitCode = 1;
if (result.pixelReductionRatio < 20) process.exitCode = 1;
if (result.naturalPixelsPerQr >= legacyPixelsPerQr) process.exitCode = 1;

function deterministicBytes(length) {
  const output = new Uint8Array(length);
  let state = 0x2365a17d;
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    output[index] = state & 0xff;
  }
  return output;
}
