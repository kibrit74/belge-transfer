import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareZxingWasm } from "./prepare-zxing-wasm.mjs";

await prepareZxingWasm();

const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const child = spawn(process.execPath, [viteCli, "build"], {
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});

if (exitCode !== 0) process.exitCode = exitCode ?? 1;
