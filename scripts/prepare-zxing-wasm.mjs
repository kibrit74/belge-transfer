import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ZXING_WASM_SHA256 } from "zxing-wasm/reader";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = fileURLToPath(import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"));
const destinationPath = fileURLToPath(new URL("../public/vendor/zxing_reader.wasm", import.meta.url));

export async function prepareZxingWasm() {
  const bytes = await readFile(sourcePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== ZXING_WASM_SHA256) {
    throw new Error("ZXing WASM bütünlük özeti paket sürümüyle eşleşmiyor.");
  }
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, bytes);
  return { projectRoot, destinationPath, digest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await prepareZxingWasm();
}
