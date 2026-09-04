import { sha256Base64Url } from "../protocol/hash.js";
import { sanitizeDownloadName } from "../transfer/safe-download-name.js";
import {
  MAX_NEARBY_FILE_BYTES,
  encodeControlMessage,
  isNearbyHandshakeMessage,
  parseChunkFrame,
  parseControlMessage,
} from "./protocol-v1.js";

export function createNearbyReceiveController({
  channel,
  maxBytes = MAX_NEARBY_FILE_BYTES,
  hashBytes = sha256Base64Url,
} = {}) {
  if (!channel) throw new TypeError("Alıcı veri kanalı gerekli.");
  const listeners = new Set();
  const chunks = [];
  let offer = null;
  let accepted = false;
  let settled = false;
  let expectedSequence = 0;
  let expectedOffset = 0;
  let resolveResult;
  let rejectResult;
  const resultPromise = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  function emit(state) {
    for (const listener of listeners) listener(state);
  }

  function fail(code, message, closeChannel = true) {
    if (settled) return;
    settled = true;
    chunks.length = 0;
    const error = new Error(message);
    error.code = code;
    rejectResult(error);
    emit({ state: "failed", code, message });
    if (closeChannel) channel.close?.();
    cleanup();
  }

  async function handleMessage(event) {
    if (settled) return;
    try {
      if (typeof event.data === "string") {
        if (isNearbyHandshakeMessage(event.data)) return;
        const message = parseControlMessage(event.data);
        if (!message) return fail("INVALID_CONTROL", "Geçersiz cihaz mesajı alındı.");
        if (message.type === "offer-file") return handleOffer(message);
        if (!offer || message.transferId !== offer.transferId) {
          return fail("TRANSFER_MISMATCH", "Aktarım kimliği uyuşmuyor.");
        }
        if (message.type === "complete") return await handleComplete(message);
        if (message.type === "cancel" || message.type === "error") {
          return fail("REMOTE_CANCELLED", message.reason || message.code, false);
        }
        return;
      }

      const frame = parseChunkFrame(event.data);
      if (!frame) return fail("INVALID_CHUNK", "Bozuk dosya parçası alındı.");
      if (!accepted) return fail("UNEXPECTED_CHUNK", "Dosya kabul edilmeden veri geldi.");
      if (frame.sequence !== expectedSequence || frame.offset !== expectedOffset) {
        return fail("CHUNK_ORDER_MISMATCH", "Dosya parçalarının sırası uyuşmuyor.");
      }
      if (expectedOffset + frame.bytes.length > offer.size || expectedOffset + frame.bytes.length > maxBytes) {
        return fail("FILE_TOO_LARGE", "Alınan dosya izin verilen boyutu aşıyor.");
      }
      chunks.push(frame.bytes);
      expectedOffset += frame.bytes.length;
      expectedSequence += 1;
      emit({ state: "receiving", bytesReceived: expectedOffset, totalBytes: offer.size });
    } catch (error) {
      fail(error?.code || "RECEIVE_FAILED", error?.message || "Dosya alınamadı.");
    }
  }

  function handleOffer(message) {
    if (offer) return fail("DUPLICATE_OFFER", "Aynı oturumda ikinci dosya teklifi geldi.");
    if (message.size > maxBytes) return fail("FILE_TOO_LARGE", "Dosya izin verilen boyutu aşıyor.");
    offer = Object.freeze({ ...message });
    emit({ state: "offered", file: offer });
  }

  async function handleComplete(message) {
    if (!accepted) return fail("EARLY_COMPLETE", "Dosya kabul edilmeden tamamlandı.");
    if (message.totalBytes !== offer.size || expectedOffset !== offer.size) {
      return fail("FILE_SIZE_MISMATCH", "Dosya boyutu uyuşmuyor.");
    }
    if (message.sha256 !== offer.sha256) return fail("FILE_HASH_MISMATCH", "Dosya özeti uyuşmuyor.");
    emit({ state: "verifying", bytesReceived: expectedOffset, totalBytes: offer.size });
    const blob = new Blob(chunks, { type: offer.mime });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sha256 = await hashBytes(bytes);
    if (sha256 !== offer.sha256) return fail("FILE_HASH_MISMATCH", "Dosya özeti uyuşmuyor.");

    const file = new File([blob], sanitizeDownloadName(offer.name), { type: offer.mime });
    channel.send(encodeControlMessage({
      version: "NDP1",
      type: "complete",
      transferId: offer.transferId,
      totalBytes: offer.size,
      sha256,
    }));
    settled = true;
    chunks.length = 0;
    resolveResult({ file, sha256 });
    emit({ state: "complete", file, sha256 });
    cleanup();
  }

  function onClose() {
    if (!settled) fail("CONNECTION_LOST", "Cihaz bağlantısı kapandı.", false);
  }

  function cleanup() {
    channel.removeEventListener("message", handleMessage);
    channel.removeEventListener("close", onClose);
  }

  channel.addEventListener("message", handleMessage);
  channel.addEventListener("close", onClose);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    accept() {
      if (!offer || accepted || settled) throw new Error("Kabul edilecek dosya teklifi yok.");
      accepted = true;
      channel.send(encodeControlMessage({
        version: "NDP1", type: "accept-file", transferId: offer.transferId,
      }));
      emit({ state: "accepted", file: offer });
    },
    reject(reason = "Kullanıcı reddetti") {
      if (!offer || settled) return;
      channel.send(encodeControlMessage({
        version: "NDP1", type: "reject-file", transferId: offer.transferId, reason,
      }));
      fail("FILE_REJECTED", reason, false);
    },
    result() {
      return resultPromise;
    },
    close() {
      if (!settled) fail("ABORTED", "Dosya alma işlemi iptal edildi.");
    },
  };
}
