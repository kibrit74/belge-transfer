import { describe, expect, it } from "vitest";
import { selectLiveQrProfile } from "../live-qr/profile-policy.js";

describe("Canlı QR güvenli profil politikası", () => {
  it.each([
    ["masaüstü", 1280, 800, 1],
    ["telefon ekranı", 390, 844, 3],
  ])("%s varsayılanında her QR grubunu kameranın yakalayabileceği kadar sabit tutar", (
    _device,
    width,
    height,
    devicePixelRatio,
  ) => {
    const profile = selectLiveQrProfile({
      width,
      height,
      devicePixelRatio,
      refreshRate: 60,
      moduleCount: 141,
      preference: "balanced",
    });

    expect(1000 / profile.fps).toBeGreaterThanOrEqual(1000 / 30);
  });

  it("60 Hz masaüstünde varsayılan olarak tek büyük QR'lı Dengeli profili seçer", () => {
    expect(selectLiveQrProfile({
      width: 1280,
      height: 800,
      devicePixelRatio: 1,
      refreshRate: 60,
      moduleCount: 141,
      preference: "balanced",
    })).toMatchObject({ id: "balanced", count: 1, fps: 24, payloadBytes: 1465 });
  });

  it("yüksek piksel yoğunluklu telefon ekranında tek QR'lı Dengeli profili korur", () => {
    expect(selectLiveQrProfile({
      width: 390,
      height: 844,
      devicePixelRatio: 3,
      refreshRate: 60,
      moduleCount: 141,
      preference: "balanced",
    })).toMatchObject({ id: "balanced", count: 1, fps: 24, payloadBytes: 1465 });
  });

  it("Hızlı profili yalnız 120 Hz geniş ekranda açık tercihle seçer", () => {
    const base = {
      width: 1600,
      height: 1000,
      devicePixelRatio: 2,
      moduleCount: 141,
      preference: "fast",
    };

    expect(selectLiveQrProfile({ ...base, refreshRate: 120 }))
      .toMatchObject({ id: "fast", count: 1, fps: 30, payloadBytes: 1465 });
    expect(selectLiveQrProfile({ ...base, refreshRate: 60 }))
      .toMatchObject({ id: "balanced", count: 1, fps: 24 });
  });

  it("geçersiz ölçülerde desteklenmeyen sonucu döndürür", () => {
    expect(selectLiveQrProfile({
      width: 0,
      height: 800,
      devicePixelRatio: 1,
      refreshRate: 60,
      moduleCount: 141,
      preference: "balanced",
    })).toEqual({ supported: false, id: null, count: 0, reason: "screen-too-small" });
  });
});
