import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveQrPrefetchPlayer } from "../live-qr/prefetch-player.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushMicrotasks(turns = 12) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

describe("Canlı QR üç gruplu hazır kare kuyruğu", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ekrandaki grup dışında en fazla üç tam grup hazır tutar", async () => {
    let groupId = 0;
    const player = createLiveQrPrefetchPlayer({
      fps: 30,
      depth: 3,
      createTexts: () => [`group-${groupId += 1}`],
      renderGroup: async (texts) => texts.map((text) => ({ text })),
      presentGroup: vi.fn(),
    });

    void player.start();
    await flushMicrotasks();

    expect(player.getState()).toMatchObject({ running: true, paused: false, readyGroups: 3 });
    expect(groupId).toBe(3);
    player.stop();
  });

  it("kuyruk boşaldığında beyaz kare yerine son geçerli grubu tekrarlar", async () => {
    const secondRender = deferred();
    let renderCount = 0;
    const presented = [];
    const player = createLiveQrPrefetchPlayer({
      fps: 10,
      depth: 1,
      createTexts: () => [`group-${renderCount + 1}`],
      renderGroup: async (texts) => {
        renderCount += 1;
        if (renderCount === 2) await secondRender.promise;
        return texts;
      },
      presentGroup: (group) => presented.push(group),
    });

    void player.start();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(presented).toEqual([["group-1"], ["group-1"]]);
    secondRender.resolve();
    player.stop();
  });

  it("durdurulduktan sonra tamamlanan render sonucunu kuyruğa veya ekrana taşımaz", async () => {
    const pendingRender = deferred();
    const presentGroup = vi.fn();
    const player = createLiveQrPrefetchPlayer({
      fps: 30,
      depth: 3,
      createTexts: () => ["late"],
      renderGroup: async () => pendingRender.promise,
      presentGroup,
    });

    void player.start();
    await flushMicrotasks();
    player.stop();
    pendingRender.resolve(["late-raster"]);
    await flushMicrotasks();
    await vi.runAllTimersAsync();

    expect(player.getState()).toEqual({ running: false, paused: false, readyGroups: 0, hasCurrent: false });
    expect(presentGroup).not.toHaveBeenCalled();
  });

  it("duraklatırken hazır grupları korur ve devam edince sabit ritmi sürdürür", async () => {
    let groupId = 0;
    const presentGroup = vi.fn();
    const player = createLiveQrPrefetchPlayer({
      fps: 20,
      depth: 3,
      createTexts: () => [`group-${groupId += 1}`],
      renderGroup: async (texts) => texts,
      presentGroup,
    });

    void player.start();
    await flushMicrotasks();
    player.pause();
    const readyWhilePaused = player.getState().readyGroups;
    await vi.advanceTimersByTimeAsync(200);
    expect(presentGroup).not.toHaveBeenCalled();
    expect(player.getState().readyGroups).toBe(readyWhilePaused);

    player.resume();
    await vi.advanceTimersByTimeAsync(49);
    expect(presentGroup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(presentGroup).toHaveBeenCalledTimes(1);
    player.stop();
  });
});
