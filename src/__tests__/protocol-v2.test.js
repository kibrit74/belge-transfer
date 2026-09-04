import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assembleChunks, chooseCoprimeStride, encodeFileToFrames, parseFrame } from "../protocol";
import { MAX_INPUT_BYTES } from "../protocol/frame-v3";

const execFileAsync = promisify(execFile);
const frameFixturePath = resolve(process.cwd(), "src/test/protocol-frames-child.mjs");

describe("QRT2 kare sırası", () => {
  it.each([5, 10, 15, 20])("%i kare için aralarında asal bir adım seçer", (total) => {
    const stride = chooseCoprimeStride(total);
    const indexes = Array.from({ length: total }, (_, step) => (step * stride) % total);

    expect(gcd(total, stride)).toBe(1);
    expect(new Set(indexes).size).toBe(total);
  });

  it.each([7, 8, 9])("%i güvenli kareyi birer kez üretir", (total) => {
    const bytes = crypto.getRandomValues(new Uint8Array(total * 450));
    const file = new File([bytes], "delil.bin", { type: "application/octet-stream" });
    const result = encodeFileToFrames(file, bytes.buffer, {
      compress: false,
      chunkBytes: 450,
    });
    const indexes = result.frames.map((text) => parseFrame(text).index);

    expect(indexes).toHaveLength(total);
    expect(new Set(indexes).size).toBe(total);
  });

  it.each([5, 10, 15, 20])("%i kritik kareyi üretim akışında birer kez üretir", async (total) => {
    const { stdout } = await execFileAsync(process.execPath, [frameFixturePath, String(total)], {
      timeout: 15_000,
    });
    const result = JSON.parse(stdout);

    expect(result.total).toBe(total);
    expect(result.indexes).toHaveLength(total);
    expect(new Set(result.indexes).size).toBe(total);
  });
});

describe("QRT2 güvenli birleştirme", () => {
  it("bildirilen boyuttan büyük açılan sıkıştırılmış veriyi reddeder", () => {
    const compressed = zlibSync(new Uint8Array(64 * 1024).fill(65));
    const chunks = new Map([[0, compressed]]);

    expect(assembleChunks(chunks, 1, 8, true)).toBeNull();
  });

  it.each([-1, Number.NaN, MAX_INPUT_BYTES + 1])(
    "geçersiz özgün boyutu birleştirmeden reddeder: %s",
    (originalSize) => {
      const chunks = new Map([[0, new Uint8Array([1])]]);

      expect(assembleChunks(chunks, 1, originalSize, false)).toBeNull();
    },
  );
});

function gcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}
