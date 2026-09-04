export const VIDEO_OPTIONS = {
  width: 1280,
  height: 720,
  framesPerSecond: 10,
  repeatCount: 1,
  holdFrames: 2,
  chunkBytes: 700,
  maxBytes: 15 * 1024 * 1024,
  warningBytes: 500 * 1024,
};

export function estimateVideoSeconds(frameCount, options = VIDEO_OPTIONS) {
  const fps = options?.framesPerSecond || VIDEO_OPTIONS.framesPerSecond;
  const repeat = options?.repeatCount || VIDEO_OPTIONS.repeatCount;
  const holdFrames = options?.holdFrames || VIDEO_OPTIONS.holdFrames;
  return Math.ceil((frameCount * repeat * holdFrames) / fps);
}

export function buildFrameSchedule(
  frames,
  repeatCount = VIDEO_OPTIONS.repeatCount,
  holdFrames = VIDEO_OPTIONS.holdFrames,
) {
  if (!Array.isArray(frames) || frames.length === 0) return [];
  const count = Math.max(1, repeatCount);
  const hold = Math.max(1, holdFrames);
  const n = frames.length;
  const schedule = [];

  for (let r = 0; r < count; r++) {
    for (let i = 0; i < n; i++) {
      const idx = (i + r) % n;
      for (let held = 0; held < hold; held++) {
        schedule.push(frames[idx]);
      }
    }
  }

  return schedule;
}
