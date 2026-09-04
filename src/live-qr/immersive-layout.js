export function shouldUseImmersiveLiveQrLayout({
  viewportWidth = globalThis.innerWidth,
  screenWidth = globalThis.screen?.width ?? viewportWidth,
  screenHeight = globalThis.screen?.height ?? 0,
  hasCoarsePointer = false,
  isMobileDevice = false,
} = {}) {
  const hasPortraitPhoneScreen = screenWidth <= 900 && screenHeight > screenWidth;
  return isMobileDevice || hasCoarsePointer || viewportWidth <= 650 || hasPortraitPhoneScreen;
}
