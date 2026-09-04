import { toBase64Url } from "../protocol/base64url.js";
import {
  MAX_NEARBY_FILE_BYTES,
  NEARBY_CHUNK_BYTES,
  encodeChunkFrame,
  encodeControlMessage,
  isNearbyHandshakeMessage,
  parseControlMessage,
} from "./protocol-v1.js";

const HIGH_WATER_BYTES = 1024 * 1024;
const LOW_WATER_BYTES = 256 * 1024;

export function createNearbySendController({
  channel,
  hashFile,
  chunkBytes = NEARBY_CHUNK_BYTES,
  createTransferId = defaultTransferId,
} = {}) {
  if (!channel || typeof hashFile !== "function") throw new TypeError("Gönderici bağımlılıkları eksik.");
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > NEARBY_CHUNK_BYTES) {
    throw new RangeError("Dosya parça boyutu geçersiz.");
  }
  let active = false;

  return {
    async send(file, { signal, onProgress } = {}) {
      if (active) throw createTransferError("TRANSFER_ACTIVE", "Bir dosya zaten gönderiliyor.");
      if (!(file instanceof Blob) || !Number.isSafeInteger(file.size) || file.size > MAX_NEARBY_FILE_BYTES) {
        throw createTransferError("FILE_TOO_LARGE", "Yakındaki Cihazlar en fazla 100 MiB dosya destekler.");
      }
      throwIfUnavailable(channel, signal);
      active = true;
      const transferId = createTransferId();
      let removeMessage = () => {};

      try {
        onProgress?.({ stage: "hashing", bytesSent: 0, totalBytes: file.size });
        const sha256 = await hashFile(file, { signal, onProgress });
        throwIfUnavailable(channel, signal);
        channel.send(encodeControlMessage({
          version: "NDP1",
          type: "offer-file",
          transferId,
          name: file.name || "dosya.bin",
          mime: file.type || "application/octet-stream",
          size: file.size,
          sha256,
        }));

        const approval = await waitForApproval(channel, transferId, signal, (remove) => {
          removeMessage = remove;
        });
        if (approval.type === "reject-file") {
          throw createTransferError("FILE_REJECTED", approval.reason);
        }

        channel.bufferedAmountLowThreshold = LOW_WATER_BYTES;
        let sequence = 0;
        let offset = 0;
        while (offset < file.size) {
          throwIfUnavailable(channel, signal);
          await waitForWritable(channel, signal);
          const buffer = await file.slice(offset, offset + chunkBytes).arrayBuffer();
          const bytes = new Uint8Array(buffer);
          channel.send(encodeChunkFrame({ sequence, offset, bytes }));
          offset += bytes.length;
          sequence += 1;
          onProgress?.({ stage: "sending", bytesSent: offset, totalBytes: file.size });
        }

        channel.send(encodeControlMessage({
          version: "NDP1",
          type: "complete",
          transferId,
          totalBytes: offset,
          sha256,
        }));
        await waitForCompletion(channel, { transferId, totalBytes: offset, sha256 }, signal);
        onProgress?.({ stage: "complete", bytesSent: offset, totalBytes: file.size });
        return { bytesSent: offset, sha256 };
      } catch (error) {
        if (channel.readyState === "open") {
          try {
            channel.send(encodeControlMessage({
              version: "NDP1", type: "cancel", transferId,
              reason: error?.code === "ABORTED" ? "Gönderim iptal edildi" : "Gönderim tamamlanamadı",
            }));
          } catch {
            // Kanal kapanmışsa ek hata üretme.
          }
        }
        throw error;
      } finally {
        removeMessage();
        active = false;
      }
    },
  };
}

function waitForCompletion(channel, expected, signal) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (typeof event.data !== "string") return;
      if (isNearbyHandshakeMessage(event.data)) return;
      const message = parseControlMessage(event.data);
      if (!message || message.transferId !== expected.transferId) return;
      if (message.type === "complete") {
        cleanup();
        if (message.totalBytes === expected.totalBytes && message.sha256 === expected.sha256) resolve();
        else reject(createTransferError("REMOTE_VERIFICATION_MISMATCH", "Alıcının dosya doğrulaması uyuşmuyor."));
      } else if (message.type === "cancel" || message.type === "error") {
        cleanup();
        reject(createTransferError("REMOTE_CANCELLED", message.reason || message.code));
      }
    };
    const onAbort = () => {
      cleanup();
      reject(createTransferError("ABORTED", "Gönderim iptal edildi."));
    };
    const onClose = () => {
      cleanup();
      reject(createTransferError("CONNECTION_LOST", "Cihaz bağlantısı kapandı."));
    };
    const cleanup = () => {
      channel.removeEventListener("message", onMessage);
      channel.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    channel.addEventListener("message", onMessage);
    channel.addEventListener("close", onClose, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForApproval(channel, transferId, signal, registerCleanup) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (typeof event.data !== "string") return;
      if (isNearbyHandshakeMessage(event.data)) return;
      const message = parseControlMessage(event.data);
      if (!message || message.transferId !== transferId) return;
      if (message.type === "accept-file" || message.type === "reject-file") {
        cleanup();
        resolve(message);
      } else if (message.type === "cancel" || message.type === "error") {
        cleanup();
        reject(createTransferError("REMOTE_CANCELLED", message.reason || message.code));
      }
    };
    const onAbort = () => {
      cleanup();
      reject(createTransferError("ABORTED", "Gönderim iptal edildi."));
    };
    const onClose = () => {
      cleanup();
      reject(createTransferError("CONNECTION_LOST", "Cihaz bağlantısı kapandı."));
    };
    const cleanup = () => {
      channel.removeEventListener("message", onMessage);
      channel.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    registerCleanup(cleanup);
    channel.addEventListener("message", onMessage);
    channel.addEventListener("close", onClose, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForWritable(channel, signal) {
  if (channel.bufferedAmount <= HIGH_WATER_BYTES) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onWritable = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(createTransferError("ABORTED", "Gönderim iptal edildi."));
    };
    const onClose = () => {
      cleanup();
      reject(createTransferError("CONNECTION_LOST", "Cihaz bağlantısı kapandı."));
    };
    const cleanup = () => {
      channel.removeEventListener("bufferedamountlow", onWritable);
      channel.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    channel.addEventListener("bufferedamountlow", onWritable, { once: true });
    channel.addEventListener("close", onClose, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (channel.readyState !== "open") onClose();
    else if (signal?.aborted) onAbort();
    else if (channel.bufferedAmount <= HIGH_WATER_BYTES) onWritable();
  });
}

function throwIfUnavailable(channel, signal) {
  if (signal?.aborted) throw createTransferError("ABORTED", "Gönderim iptal edildi.");
  if (channel.readyState !== "open") throw createTransferError("CONNECTION_LOST", "Cihaz bağlantısı kapandı.");
}

function defaultTransferId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function createTransferError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
