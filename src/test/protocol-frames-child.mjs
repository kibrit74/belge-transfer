import { encodeFileToFrames, parseFrame } from "../protocol.js";

const total = Number(process.argv[2]);
const bytes = new Uint8Array(total * 450);
const file = {
  name: "delil.bin",
  type: "application/octet-stream",
};
const result = encodeFileToFrames(file, bytes.buffer, {
  compress: false,
  chunkBytes: 450,
});

console.log(JSON.stringify({
  total: result.total,
  indexes: result.frames.map((text) => parseFrame(text).index),
}));
