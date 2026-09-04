import { selectLiveQrLayout } from './layout.js';

const PROFILES = Object.freeze({
  compatible: Object.freeze({ id: 'compatible', count: 1, fps: 8, payloadBytes: 1465 }),
  balanced: Object.freeze({ id: 'balanced', count: 1, fps: 24, payloadBytes: 1465 }),
  fast: Object.freeze({ id: 'fast', count: 1, fps: 30, payloadBytes: 1465 }),
});

export function selectLiveQrProfile(options) {
  const preference = ['compatible', 'balanced', 'fast'].includes(options?.preference)
    ? options.preference
    : 'balanced';

  if (preference === 'fast' && options?.refreshRate >= 120) {
    const layout = selectLayout(options, PROFILES.fast.count);
    if (layout.supported && layout.count === PROFILES.fast.count) {
      return profileResult(PROFILES.fast, layout, 'requested-fast');
    }
  }

  if (preference !== 'compatible') {
    const layout = selectLayout(options, PROFILES.balanced.count);
    if (layout.supported && layout.count === PROFILES.balanced.count) {
      return profileResult(PROFILES.balanced, layout, preference === 'fast' ? 'fast-unavailable' : 'default');
    }
  }

  const layout = selectLayout(options, PROFILES.compatible.count);
  if (layout.supported && layout.count === PROFILES.compatible.count) {
    return profileResult(PROFILES.compatible, layout, 'safe-fallback');
  }
  return { supported: false, id: null, count: 0, reason: 'screen-too-small' };
}

function selectLayout(options, maxCount) {
  return selectLiveQrLayout({
    width: options?.width,
    height: options?.height,
    devicePixelRatio: options?.devicePixelRatio,
    moduleCount: options?.moduleCount,
    maxCount,
  });
}

function profileResult(profile, layout, reason) {
  return Object.freeze({
    supported: true,
    ...profile,
    layout,
    reason,
  });
}
