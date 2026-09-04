import { describe, expect, it } from "vitest";
import {
  createVaultDropPackageWorkerMessageHandler,
} from "../workers/vaultdrop-package.worker.js";
import {
  createVaultDropPackageClient,
} from "../workers/vaultdrop-package-client.js";

class FakeWorker {
  constructor() {
    this.messages = [];
    this.terminateCalls = 0;
    this.onmessage = null;
    this.onerror = null;
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminateCalls += 1;
  }

  emit(message) {
    this.onmessage?.({ data: message });
  }
}

function createWorkerFactory() {
  const workers = [];
  return {
    workers,
    workerFactory() {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  };
}

function packageResult() {
  return {
    blob: new Blob(["paket"]),
    keyText: "a".repeat(43),
  };
}

describe("VaultDrop paket worker istemcisi", () => {
  it("her oluşturma için ayrı worker kullanır; ilerleme ve sonucu iletir", async () => {
    const { workers, workerFactory } = createWorkerFactory();
    const client = createVaultDropPackageClient({ workerFactory });
    const progress = [];
    const files = [new File(["içerik"], "rapor.txt", { type: "text/plain" })];

    const created = client.create(files, {
      onProgress: (update) => progress.push(update),
    });
    const worker = workers[0];

    expect(worker.messages).toEqual([{ type: "create", id: 1, files }]);

    worker.emit({ type: "progress", id: 1, progress: { stage: "read", percent: 20 } });
    worker.emit({ type: "complete", id: 1, result: packageResult() });

    await expect(created).resolves.toMatchObject({ keyText: "a".repeat(43) });
    expect(progress).toEqual([{ stage: "read", percent: 20 }]);
    expect(worker.terminateCalls).toBe(1);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
  });

  it("iptal sonrası geç tamamlanma mesajını yok sayar", async () => {
    const { workers, workerFactory } = createWorkerFactory();
    const client = createVaultDropPackageClient({ workerFactory });
    const controller = new AbortController();
    const progress = [];

    const created = client.create([], {
      signal: controller.signal,
      onProgress: (update) => progress.push(update),
    });
    const worker = workers[0];

    controller.abort();
    worker.emit({ type: "complete", id: 1, result: packageResult() });

    await expect(created).rejects.toMatchObject({ code: "ABORTED" });
    expect(worker.terminateCalls).toBe(1);
    expect(progress).toEqual([]);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
  });

  it("close aktif işi CLOSED ile reddeder ve geç cevapları yayımlamaz", async () => {
    const { workers, workerFactory } = createWorkerFactory();
    const client = createVaultDropPackageClient({ workerFactory });
    const progress = [];
    const created = client.create([], {
      onProgress: (update) => progress.push(update),
    });
    const worker = workers[0];

    client.close();
    worker.emit({ type: "progress", id: 1, progress: { stage: "encrypt", percent: 70 } });
    worker.emit({ type: "error", id: 1, error: { code: "PACKAGE_FAILED", message: "geç" } });

    await expect(created).rejects.toMatchObject({ code: "CLOSED" });
    expect(worker.terminateCalls).toBe(1);
    expect(progress).toEqual([]);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    await expect(client.create([])).rejects.toMatchObject({ code: "CLOSED" });
    expect(workers).toHaveLength(1);
  });

  it("eşzamanlı oluşturmalarda her işe ait workerı ayrı ayrı sonlandırır", async () => {
    const { workers, workerFactory } = createWorkerFactory();
    const client = createVaultDropPackageClient({ workerFactory });

    const first = client.create([]);
    const second = client.create([]);

    expect(workers).toHaveLength(2);
    expect(workers[0].messages[0]).toMatchObject({ type: "create", id: 1 });
    expect(workers[1].messages[0]).toMatchObject({ type: "create", id: 2 });

    client.close();

    await expect(first).rejects.toMatchObject({ code: "CLOSED" });
    await expect(second).rejects.toMatchObject({ code: "CLOSED" });
    expect(workers.map((worker) => worker.terminateCalls)).toEqual([1, 1]);
  });
});

describe("VaultDrop paket worker girişi", () => {
  it("kurucunun ilerleme ve başarılı sonucunu aynı kimlikle iletir", async () => {
    const messages = [];
    const result = packageResult();
    const handleMessage = createVaultDropPackageWorkerMessageHandler({
      buildVaultDropPackage: async (_files, { onProgress }) => {
        onProgress({ stage: "archive", percent: 5 });
        onProgress({ stage: "complete", percent: 100 });
        return result;
      },
      postMessage: (message) => messages.push(message),
    });

    await handleMessage({ data: { type: "create", id: 7, files: [] } });

    expect(messages).toEqual([
      { type: "progress", id: 7, progress: { stage: "archive", percent: 5 } },
      { type: "progress", id: 7, progress: { stage: "complete", percent: 100 } },
      { type: "complete", id: 7, result },
    ]);
  });

  it("kurucu hatasını PACKAGE_FAILED varsayılanıyla iletir", async () => {
    const messages = [];
    const handleMessage = createVaultDropPackageWorkerMessageHandler({
      buildVaultDropPackage: async () => {
        throw new Error("paketlenemedi");
      },
      postMessage: (message) => messages.push(message),
    });

    await handleMessage({ data: { type: "create", id: 8, files: [] } });

    expect(messages).toEqual([
      {
        type: "error",
        id: 8,
        error: { code: "PACKAGE_FAILED", message: "paketlenemedi" },
      },
    ]);
  });

  it("geçersiz create mesajlarını kurucuya iletmeden yok sayar", async () => {
    const messages = [];
    let buildCalls = 0;
    const handleMessage = createVaultDropPackageWorkerMessageHandler({
      buildVaultDropPackage: async () => {
        buildCalls += 1;
        return packageResult();
      },
      postMessage: (message) => messages.push(message),
    });

    await handleMessage({ data: { type: "create", id: "x", files: [] } });
    await handleMessage({ data: { type: "create", id: 9, files: null } });

    expect(buildCalls).toBe(0);
    expect(messages).toEqual([]);
  });
});
