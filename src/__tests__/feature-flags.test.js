import { describe, expect, it } from "vitest";
import { getFeatureFlags } from "../config/feature-flags.js";
import { getEffectiveMethodRegistry } from "../transfer/method-registry.js";

describe("deneysel özellik kapıları", () => {
  it("eksik veya yaklaşık değerlerde güvenli biçimde kapalıdır", () => {
    expect(getFeatureFlags({})).toEqual({
      nearbyEnabled: false,
      liveQr10MiBEnabled: false,
      liveQrFastProfileEnabled: false,
    });
    expect(getFeatureFlags({ VITE_ENABLE_NEARBY: "TRUE" }).nearbyEnabled).toBe(false);
    expect(getFeatureFlags({ VITE_ENABLE_NEARBY: "1" }).nearbyEnabled).toBe(false);
  });

  it("yalnız tam true değeri özelliği açar", () => {
    expect(getFeatureFlags({ VITE_ENABLE_NEARBY: "true" }).nearbyEnabled).toBe(true);
  });

  it("kapalı Nearby yöntemini pasif, Canlı QR sınırını 1 MiB döndürür", () => {
    const methods = getEffectiveMethodRegistry(getFeatureFlags({}));
    expect(methods.find((method) => method.id === "nearby").enabled).toBe(false);
    expect(methods.find((method) => method.id === "live").maxBytes).toBe(1024 * 1024);
    expect(methods.find((method) => method.id === "package").enabled).toBe(true);
  });
});
