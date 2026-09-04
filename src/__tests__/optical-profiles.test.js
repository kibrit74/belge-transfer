import { describe, expect, it } from "vitest";
import {
  estimateOpticalVideo,
  getOpticalProfile,
} from "../optical/profiles.js";

describe("optik aktarım profilleri", () => {
  it("Dengeli profili kesin başlangıç değerleriyle verir", () => {
    expect(getOpticalProfile("balanced")).toEqual({
      id: "balanced",
      label: "Dengeli",
      width: 1920,
      height: 1080,
      fps: 24,
      qrCount: 2,
      symbolBytes: 1400,
      emissionRatio: 1.5,
    });
  });

  it("Uyumlu profili daha düşük yoğunlukla verir", () => {
    expect(getOpticalProfile("compatible")).toMatchObject({
      id: "compatible",
      width: 1280,
      height: 720,
      fps: 15,
      qrCount: 1,
      symbolBytes: 700,
      emissionRatio: 1.5,
    });
  });

  it("Renkli profili güvenli CRF2 kayıt değerleriyle verir", () => {
    expect(getOpticalProfile("color_balanced")).toEqual({
      id: "color_balanced",
      label: "Renkli Dengeli (Deneysel)",
      width: 1920,
      height: 1080,
      fps: 12,
      qrCount: 2,
      symbolBytes: 380,
      emissionRatio: 1.3,
      holdFrames: 2,
      isColor: true,
    });
  });

  it("5 MiB Dengeli taşıyıcıyı 120 saniye içinde planlar", () => {
    const estimate = estimateOpticalVideo({
      byteLength: 5 * 1024 * 1024,
      profileId: "balanced",
    });

    expect(estimate.sourceSymbols).toBe(3745);
    expect(estimate.emittedSymbols).toBe(5618);
    expect(estimate.videoFrames).toBe(2809);
    expect(estimate.durationSeconds).toBe(118);
  });

  it("Renkli tahminde tutma karelerini süreye katar, standart tahmini değiştirmez", () => {
    const colorEstimate = estimateOpticalVideo({
      byteLength: 7600,
      profileId: "color_balanced",
    });
    const standardEstimate = estimateOpticalVideo({
      byteLength: 5 * 1024 * 1024,
      profileId: "balanced",
    });

    expect(colorEstimate).toEqual({
      sourceSymbols: 20,
      emittedSymbols: 26,
      videoFrames: 13,
      durationSeconds: 3,
    });
    expect(standardEstimate.durationSeconds).toBe(118);
  });

  it("geçersiz profil ve boyutu reddeder", () => {
    expect(() => getOpticalProfile("fast")).toThrow(/profil/i);
    expect(() => estimateOpticalVideo({ byteLength: -1 })).toThrow(/boyut/i);
  });
});
