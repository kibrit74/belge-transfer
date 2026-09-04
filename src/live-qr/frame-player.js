export function createLiveQrFramePlayer({
  fps,
  renderGroup,
  presentGroup,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (!Number.isFinite(fps) || fps <= 0 || typeof renderGroup !== 'function' || typeof presentGroup !== 'function') {
    throw new TypeError('Canlı QR oynatıcı ayarları geçersiz.');
  }

  const interval = 1000 / fps;
  let running = false;
  let timer = null;
  let wakeTimer = null;
  let completion = null;
  let generation = 0;

  function wait() {
    return new Promise((resolve) => {
      wakeTimer = resolve;
      timer = setTimer(() => {
        timer = null;
        wakeTimer = null;
        resolve();
      }, interval);
    });
  }

  async function play(texts) {
    stop();
    running = true;
    const currentGeneration = generation;
    completion = (async () => {
      while (running && currentGeneration === generation) {
        const group = typeof texts === 'function' ? texts() : texts;
        const rendered = await renderGroup(group);
        if (!running || currentGeneration !== generation) break;
        presentGroup(rendered);
        await wait();
      }
    })().finally(() => {
      if (completion) completion = null;
    });
    return completion;
  }

  function stop() {
    running = false;
    generation += 1;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (wakeTimer) {
      const resolve = wakeTimer;
      wakeTimer = null;
      resolve();
    }
  }

  return { play, stop, isPlaying: () => running };
}
