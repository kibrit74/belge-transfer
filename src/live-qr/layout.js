const MIN_MODULE_PIXELS = 3;
const PAGE_PADDING = 10;
const GAP = 10;
const MAX_COMFORTABLE_QR_CSS_SIZE = 312;
const QUIET_ZONE_MODULES = 2;

export function selectLiveQrLayout({
  width,
  height,
  devicePixelRatio = 1,
  moduleCount,
  maxCount = 4,
}) {
  if (!isPositiveNumber(width) || !isPositiveNumber(height)
    || !isPositiveNumber(devicePixelRatio) || !Number.isSafeInteger(moduleCount) || moduleCount < 1
    || !Number.isSafeInteger(maxCount) || maxCount < 1) {
    return { supported: false, count: 0, columns: 0, rows: 0 };
  }

  const candidates = (width < 640 ? [
    { count: 1, columns: 1, rows: 1 },
  ] : [
    { count: 4, columns: 2, rows: 2 },
    { count: 2, columns: 2, rows: 1 },
    { count: 1, columns: 1, rows: 1 },
  ]).filter((candidate) => candidate.count <= maxCount);

  for (const candidate of candidates) {
    const availableWidth = width - (PAGE_PADDING * 2) - (GAP * (candidate.columns - 1));
    const availableHeight = height - (PAGE_PADDING * 2) - (GAP * (candidate.rows - 1));
    const availableQrCssSize = Math.floor(Math.min(
      availableWidth / candidate.columns,
      availableHeight / candidate.rows,
    ));
    const totalModuleCount = moduleCount + (QUIET_ZONE_MODULES * 2);
    const minimumReadableCssSize = Math.ceil((totalModuleCount * MIN_MODULE_PIXELS) / devicePixelRatio);
    const qrCssSize = Math.min(
      availableQrCssSize,
      Math.max(MAX_COMFORTABLE_QR_CSS_SIZE, minimumReadableCssSize),
    );
    const qrPixelSize = Math.floor(qrCssSize * devicePixelRatio);
    if (qrCssSize <= 0 || (qrPixelSize / totalModuleCount) < MIN_MODULE_PIXELS) continue;
    return {
      supported: true,
      ...candidate,
      qrCssSize,
      qrPixelSize,
      gap: GAP,
    };
  }

  return { supported: false, count: 0, columns: 0, rows: 0 };
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
