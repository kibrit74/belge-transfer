import { describe, expect, it, vi } from "vitest";
import { createNearbyHashWorkerMessageHandler } from "../workers/nearby-hash.worker.js";
import { createNearbyHashClient } from "../nearby/hash-client.js";

class FakeWorker {
  postMessage = vi.fn();
  terminate = vi.fn();
  onmessage = null;
  onerror = null;
}

describe("Yakındaki Cihazlar SHA işçisi", () => {
  it("dosya adını veya içeriğini geri yansıtmadan SHA üretir", async () => {
    const postMessage = vi.fn();
    const handler = createNearbyHashWorkerMessageHandler({ postMessage });
    const file = new File(["gizli veri"], "gizli-rapor.txt");

    await handler({ data: { type: "hash", id: 7, file } });

    expect(postMessage).toHaveBeenLastCalledWith({
      type: "complete",
      id: 7,
      sha256: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain("gizli-rapor.txt");
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain("gizli veri");
  });

  it("istemci sonucu döndürür ve sahip olduğu workerı sonlandırır", async () => {
    const worker = new FakeWorker();
    const client = createNearbyHashClient({ workerFactory: () => worker });
    const pending = client.hash(new File(["x"], "a.txt"));
    const [{ id }] = worker.postMessage.mock.calls[0];

    worker.onmessage({ data: { type: "complete", id, sha256: "A".repeat(43) } });

    await expect(pending).resolves.toBe("A".repeat(43));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("iptalde sonucu beklemeden workerı kapatır", async () => {
    const worker = new FakeWorker();
    const client = createNearbyHashClient({ workerFactory: () => worker });
    const controller = new AbortController();
    const pending = client.hash(new File(["x"], "a.txt"), { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
