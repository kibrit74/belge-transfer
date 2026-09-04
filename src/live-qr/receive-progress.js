export function normalizeReceiveProgress(progress = {}) {
  const rawTotal = Number.isFinite(progress.total) ? Math.floor(progress.total) : 0;
  const total = Math.max(0, rawTotal);
  const rawCollected = Number.isFinite(progress.collected)
    ? Math.floor(progress.collected)
    : 0;
  const collected = Math.min(total, Math.max(0, rawCollected));
  const determinate = total > 0;
  const percentage = determinate ? Math.round((collected / total) * 100) : 0;
  return { collected, total, percentage, determinate };
}
