import { encryptPreparedFile } from "../crypto/encrypted-container.js";
import { readFileAsArrayBuffer } from "../protocol/hash.js";
import { prepareTransferFile, validateBatchFiles } from "./batch-files.js";
import { prepareTransferPayload } from "./payload-compression.js";

export async function buildVaultDropPackage(files, { onProgress } = {}) {
  reportProgress(onProgress, "archive", 5);
  const normalized = validateBatchFiles(files);
  const sourceFile = await prepareTransferFile(normalized);

  reportProgress(onProgress, "read", 20);
  const bytes = new Uint8Array(await readFileAsArrayBuffer(sourceFile));

  reportProgress(onProgress, "compress", 35);
  const prepared = await prepareTransferPayload(bytes, {
    fileName: sourceFile.name,
    mimeType: sourceFile.type,
  });

  reportProgress(onProgress, "encrypt", 70);
  const encrypted = await encryptPreparedFile(sourceFile, prepared);

  reportProgress(onProgress, "complete", 100);
  return {
    ...encrypted,
    compression: prepared.compression,
    originalSize: prepared.originalSize,
    storedSize: prepared.storedSize,
    savedPercent: prepared.savedPercent,
  };
}

function reportProgress(onProgress, stage, percent) {
  onProgress?.({ stage, percent });
}
