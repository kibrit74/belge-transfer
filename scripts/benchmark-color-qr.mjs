import { performance } from 'node:perf_hooks';
import { prepareTransferPayload } from '../src/transfer/payload-compression.js';

const BLOCK_BYTES = 380;
const EMISSION_RATIO = 1.30;
const BENCHMARK_SIZES = [10 * 1024, 100 * 1024, 1024 * 1024];

function deterministicNoise(length) {
  let state = 0x12345678;
  return Uint8Array.from({ length }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  });
}

function validateResult({ size, kind, prepared }) {
  if (kind === 'compressible' && size === 100 * 1024 && prepared.savedPercent < 90) {
    console.error('100 KB sıkıştırılabilir veri yüzde 90 tasarruf eşiğini karşılamıyor.');
    process.exitCode = 1;
  }

  if (kind === 'incompressible' && prepared.compression !== 'none') {
    console.error(`${size} bayt sıkıştırılamaz veri için sıkıştırma kapatılmadı.`);
    process.exitCode = 1;
  }
}

for (const size of BENCHMARK_SIZES) {
  for (const [kind, bytes] of [
    ['compressible', new Uint8Array(size).fill(65)],
    ['incompressible', deterministicNoise(size)],
  ]) {
    const startedAt = performance.now();
    const prepared = await prepareTransferPayload(bytes);
    const sourceCount = Math.max(1, Math.ceil(prepared.storedSize / BLOCK_BYTES));
    const emittedSymbols = Math.ceil(sourceCount * EMISSION_RATIO);

    console.log(JSON.stringify({
      size,
      kind,
      compression: prepared.compression,
      storedSize: prepared.storedSize,
      savedPercent: prepared.savedPercent,
      sourceCount,
      emittedSymbols,
      prepareMs: Number((performance.now() - startedAt).toFixed(2)),
    }));

    validateResult({ size, kind, prepared });
  }
}
