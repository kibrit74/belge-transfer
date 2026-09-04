import { describe, expect, it } from "vitest";
import {
  VIDEO_OPTIONS,
  buildFrameSchedule,
  estimateVideoSeconds,
} from "../video/frame-schedule.js";

describe("frame schedule", () => {
  it("her veri karesini üç farklı turda tekrarlar", () => {
    const schedule = buildFrameSchedule(["f0", "f1", "f2"], 3, 1);
    expect(schedule.filter((item) => item === "f0")).toHaveLength(3);
    expect(schedule.filter((item) => item === "f1")).toHaveLength(3);
    expect(schedule.filter((item) => item === "f2")).toHaveLength(3);
    expect(schedule.slice(0, 3)).toEqual(["f0", "f1", "f2"]);
  });

  it("her QR karesini mobil tarama için art arda beş video karesi tutar", () => {
    const schedule = buildFrameSchedule(["f0", "f1"], 1, 5);

    expect(schedule).toEqual([
      "f0", "f0", "f0", "f0", "f0",
      "f1", "f1", "f1", "f1", "f1",
    ]);
  });

  it("boş veya geçersiz kare listesinde boş dizi döner", () => {
    expect(buildFrameSchedule([])).toEqual([]);
    expect(buildFrameSchedule(null)).toEqual([]);
  });

  it("video süresini doğru hesaplar", () => {
    // 10 kare, 3 tekrar, 5 fps => 30 / 5 = 6 saniye
    expect(
      estimateVideoSeconds(10, { framesPerSecond: 5, repeatCount: 3, holdFrames: 1 }),
    ).toBe(6);
    // 1 kare, 3 tekrar, 5 fps => 3 / 5 = 0.6 => ceil 1 saniye
    expect(
      estimateVideoSeconds(1, { framesPerSecond: 5, repeatCount: 3, holdFrames: 1 }),
    ).toBe(1);
    expect(
      estimateVideoSeconds(10, { framesPerSecond: 5, repeatCount: 2, holdFrames: 5 }),
    ).toBe(20);
  });

  it("45 KB belge için varsayılan video süresini 30 saniyenin altında tutar", () => {
    const estimatedContainerBytes = 45 * 1024 + 512;
    const frameCount = Math.ceil(estimatedContainerBytes / VIDEO_OPTIONS.chunkBytes);

    expect(estimateVideoSeconds(frameCount)).toBeLessThanOrEqual(30);
  });

  it("291,2 KB dosyanın varsayılan videosunu 90 saniyenin altında tutar", () => {
    const estimatedContainerBytes = Math.round(291.2 * 1024) + 512;
    const frameCount = Math.ceil(estimatedContainerBytes / VIDEO_OPTIONS.chunkBytes);

    expect(estimateVideoSeconds(frameCount)).toBeLessThanOrEqual(90);
  });
});
