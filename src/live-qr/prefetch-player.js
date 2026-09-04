export function createLiveQrPrefetchPlayer({
  fps,
  depth = 3,
  createTexts,
  renderGroup,
  presentGroup,
  onQueueDepth,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (
    !Number.isFinite(fps) || fps <= 0 ||
    !Number.isSafeInteger(depth) || depth < 1 || depth > 3 ||
    typeof createTexts !== 'function' ||
    typeof renderGroup !== 'function' ||
    typeof presentGroup !== 'function'
  ) {
    throw new TypeError('Canlı QR hazır kare kuyruğu ayarları geçersiz.');
  }

  const interval = 1000 / fps;
  const ready = [];
  let currentGroup = null;
  let running = false;
  let paused = false;
  let generation = 0;
  let timer = null;
  let fillGeneration = null;
  let resolveCompletion = null;

  function notifyQueueDepth() {
    onQueueDepth?.(ready.length);
  }

  async function fill(currentGeneration) {
    if (fillGeneration === currentGeneration) return;
    fillGeneration = currentGeneration;
    try {
      while (running && currentGeneration === generation && ready.length < depth) {
        const texts = createTexts();
        const rasters = await renderGroup(texts);
        if (!running || currentGeneration !== generation) return;
        if (!Array.isArray(rasters) || rasters.length !== texts.length) {
          throw new TypeError('Canlı QR grubu eksik hazırlandı.');
        }
        ready.push(Object.freeze({ texts, rasters }));
        notifyQueueDepth();
      }
    } finally {
      if (fillGeneration === currentGeneration) fillGeneration = null;
    }
  }

  function schedule(currentGeneration) {
    if (!running || paused || currentGeneration !== generation || timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      tick(currentGeneration);
    }, interval);
  }

  function tick(currentGeneration) {
    if (!running || paused || currentGeneration !== generation) return;
    const nextGroup = ready.shift();
    if (nextGroup) {
      currentGroup = nextGroup;
      notifyQueueDepth();
    }
    if (currentGroup) presentGroup(currentGroup.rasters);
    void fill(currentGeneration);
    schedule(currentGeneration);
  }

  function start() {
    stop();
    running = true;
    paused = false;
    const currentGeneration = generation;
    const completion = new Promise((resolve) => { resolveCompletion = resolve; });
    void fill(currentGeneration).catch(() => stop());
    schedule(currentGeneration);
    return completion;
  }

  function pause() {
    if (!running || paused) return;
    paused = true;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function resume() {
    if (!running || !paused) return;
    paused = false;
    const currentGeneration = generation;
    void fill(currentGeneration).catch(() => stop());
    schedule(currentGeneration);
  }

  function stop() {
    running = false;
    paused = false;
    generation += 1;
    fillGeneration = null;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    ready.length = 0;
    currentGroup = null;
    notifyQueueDepth();
    const resolve = resolveCompletion;
    resolveCompletion = null;
    resolve?.();
  }

  return {
    start,
    pause,
    resume,
    stop,
    getState: () => ({
      running,
      paused,
      readyGroups: ready.length,
      hasCurrent: currentGroup !== null,
    }),
  };
}
