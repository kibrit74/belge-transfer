import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const run = promisify(exec);
const LOCAL_SOURCE_PATH_PATTERN = /(?:[A-Z]:[\\/]Users[\\/]|\/home\/(?!web_user(?:[/"'`]|$))|\/Users\/)/;

beforeAll(async () => {
  await run("npm run build", {
    cwd: process.cwd(),
  });
}, 60_000);

async function readJavaScriptFiles(directory) {
  const entries = await readdir(directory);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry);
    const details = await stat(path);
    if (details.isDirectory()) return readJavaScriptFiles(path);
    return entry.endsWith(".js") ? [await readFile(path, "utf8")] : [];
  }));
  return files.flat();
}

describe("statik üretim güvenlik başlıkları", () => {
  it("CSP ile betikleri aynı kökenle sınırlar", async () => {
    const headers = await readFile(resolve(process.cwd(), "public/_headers"), "utf8");

    expect(headers).toContain("script-src 'self'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).not.toContain("unsafe-eval");
  });

  it("index sayfası dış Google fontu yüklemez", async () => {
    const html = await readFile(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });

  it("üretim çıktısında kaynak başlık bildirimi aynen bulunur", async () => {
    const [sourceHeaders, builtHeaders] = await Promise.all([
      readFile(resolve(process.cwd(), "public/_headers"), "utf8"),
      readFile(resolve(process.cwd(), "dist/_headers"), "utf8"),
    ]);

    expect(builtHeaders).toBe(sourceHeaders);
  });

  it("üretim çıktısında geliştirme JSX çağrıları ve yerel kaynak yolları bulunmaz", async () => {
    const scripts = await readJavaScriptFiles(resolve(process.cwd(), "dist"));
    const output = scripts.join("\n");

    expect(output).not.toContain("jsxDEV");
    expect(output).not.toMatch(LOCAL_SOURCE_PATH_PATTERN);
  });

  it("QR okuyucu üretim paketinde dış CDN yedeği bırakmaz", async () => {
    const scripts = await readJavaScriptFiles(resolve(process.cwd(), "dist"));
    const output = scripts.join("\n");
    const forbiddenHosts = [
      ["fastly", ["js", "delivr"].join("")].join("."),
      ["un", "pkg"].join(""),
      ["cdn", ["js", "delivr"].join("")].join("."),
    ];

    for (const host of forbiddenHosts) expect(output).not.toContain(host);
  });

  it.each([
    "C:\\Users\\developer\\project\\src\\App.jsx",
    "/home/developer/project/src/App.jsx",
    "/Users/developer/project/src/App.jsx",
  ])("%s yerel kaynak yolunu yakalar", (localPath) => {
    expect(localPath).toMatch(LOCAL_SOURCE_PATH_PATTERN);
  });
});
