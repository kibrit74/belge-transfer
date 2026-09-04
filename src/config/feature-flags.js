export function getFeatureFlags(environment = import.meta.env) {
  return Object.freeze({
    nearbyEnabled: environment?.VITE_ENABLE_NEARBY === "true",
    liveQr10MiBEnabled: environment?.VITE_ENABLE_LIVE_QR_10MIB === "true",
    liveQrFastProfileEnabled: environment?.VITE_ENABLE_LIVE_QR_FAST === "true",
  });
}
