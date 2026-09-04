export const COLOR_VIDEO_MAIN_ENABLED = false;

export const OPTICAL_PROFILES = Object.freeze({
  balanced: Object.freeze({
    id: "balanced",
    label: "Dengeli",
    width: 1920,
    height: 1080,
    fps: 24,
    qrCount: 2,
    symbolBytes: 1400,
    emissionRatio: 1.5,
  }),
  compatible: Object.freeze({
    id: "compatible",
    label: "Uyumlu",
    width: 1280,
    height: 720,
    fps: 15,
    qrCount: 1,
    symbolBytes: 700,
    emissionRatio: 1.5,
  }),
  color_balanced: Object.freeze({
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
  }),
});

export function getOpticalProfile(id = "balanced") {
  const profile = OPTICAL_PROFILES[id];
  if (!profile) throw new RangeError("Bilinmeyen optik aktarım profili.");
  return profile;
}

export function estimateOpticalVideo({ byteLength, profileId = "balanced" } = {}) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new RangeError("Aktarım boyutu negatif olmayan güvenli bir tam sayı olmalı.");
  }

  const profile = getOpticalProfile(profileId);
  const sourceSymbols = Math.max(1, Math.ceil(byteLength / profile.symbolBytes));
  const emittedSymbols = Math.ceil(sourceSymbols * profile.emissionRatio);
  const videoFrames = Math.ceil(emittedSymbols / profile.qrCount);
  const holdFrames = profile.holdFrames ?? 1;

  return {
    sourceSymbols,
    emittedSymbols,
    videoFrames,
    durationSeconds: Math.ceil((videoFrames * holdFrames) / profile.fps),
  };
}
