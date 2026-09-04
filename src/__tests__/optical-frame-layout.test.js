import { describe, expect, it } from "vitest";
import { getQrRegions, scaleQrRegions } from "../optical/frame-layout.js";
import { getOpticalProfile } from "../optical/profiles.js";

describe("optik QR video düzeni", () => {
  it("Dengeli profilde iki büyük QR bölgesini yan yana yerleştirir", () => {
    expect(getQrRegions(getOpticalProfile("balanced"))).toEqual([
      { x: 60, y: 90, size: 900 },
      { x: 960, y: 90, size: 900 },
    ]);
  });

  it("Uyumlu profilde tek QR kodunu ortalar", () => {
    expect(getQrRegions(getOpticalProfile("compatible"))).toEqual([
      { x: 280, y: 0, size: 720 },
    ]);
  });

  it("Dengeli profilin iki QR bölgesini 1280×720 analiz alanına ölçekler", () => {
    expect(scaleQrRegions(getOpticalProfile("balanced"), 1280, 720)).toEqual([
      { x: 40, y: 60, width: 600, height: 600 },
      { x: 640, y: 60, width: 600, height: 600 },
    ]);
  });

  it("Uyumlu profilin tek QR bölgesini 1280×720 boyutunda korur", () => {
    expect(scaleQrRegions(getOpticalProfile("compatible"), 1280, 720)).toEqual([
      { x: 280, y: 0, width: 720, height: 720 },
    ]);
  });

  it("geçersiz hedef boyutunu reddeder", () => {
    expect(() => scaleQrRegions(getOpticalProfile("balanced"), 0, 720)).toThrow(TypeError);
  });
});
