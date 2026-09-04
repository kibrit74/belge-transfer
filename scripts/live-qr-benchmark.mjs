import { performance } from 'node:perf_hooks';
import { sha256Base64Url } from '../src/protocol/hash.js';
import {
  createStripeFountainDecoder,
  createStripeFountainEncoder,
} from '../src/live-qr/stripe-fountain-v2.js';

const MIB = 1024 * 1024;
const CASES = [1 * MIB, 5 * MIB, 10 * MIB];

function seededBytes(length, seed) {
  const bytes = new Uint8Array(length);
  let state = seed >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

async function runCase(bytesLength, caseIndex) {
  const bytes = seededBytes(bytesLength, 0x51a7 + caseIndex);
  const transferId = `Bench${String(caseIndex + 1).padStart(7, '0')}`;
  const startedAt = performance.now();
  const encoder = await createStripeFountainEncoder(bytes, { transferId });
  const decoder = createStripeFountainDecoder(encoder.metadata);
  const candidateCount = Math.ceil(encoder.metadata.sourceCount * 1.5);

  for (let symbolId = candidateCount - 1; symbolId >= 0; symbolId -= 1) {
    if (symbolId % 5 !== 0) decoder.accept(encoder.symbol(symbolId));
  }

  const restored = decoder.bytes();
  const elapsedMs = performance.now() - startedAt;
  const progress = decoder.progress();
  return {
    bytes: bytesLength,
    sourceCount: encoder.metadata.sourceCount,
    candidateCount,
    accepted: progress.accepted,
    solved: progress.solved,
    duplicates: progress.duplicates,
    lossRatio: 0.20,
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    heapUsedBytes: process.memoryUsage().heapUsed,
    complete: decoder.isComplete(),
    shaMatches: restored ? await sha256Base64Url(restored) === encoder.metadata.sha256 : false,
  };
}

const results = [];
for (let index = 0; index < CASES.length; index += 1) {
  results.push(await runCase(CASES[index], index));
}

const passed = results.every((result) => result.complete && result.shaMatches);
process.stdout.write(`${JSON.stringify({ protocol: 'QRL2', passed, results }, null, 2)}\n`);
if (!passed) process.exitCode = 1;
