import { zlibSync, unzlibSync } from "fflate";
import { MAX_INPUT_BYTES, parseFrame as parseProtocolFrame } from "./protocol/index.js";

const MAGIC = "QRT2";
export const CHUNK_BYTES = 450;
export const FRAME_INTERVAL_MS = 180;

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function gcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function chooseCoprimeStride(total) {
  for (const candidate of [7, 5, 3, 2]) {
    if (candidate < total && gcd(candidate, total) === 1) return candidate;
  }
  return 1;
}

// Dosyayı sıkıştırıp QR karelerine bölen frame dizisi üretir.
export function encodeFileToFrames(file, arrayBuffer, options = {}) {
  const rawBytes = new Uint8Array(arrayBuffer);
  
  let payloadBytes = rawBytes;
  let isCompressed = false;

  if (options.compress !== false) {
    try {
      const compressed = zlibSync(rawBytes, { level: 9 });
      if (compressed.length < rawBytes.length) {
        payloadBytes = compressed;
        isCompressed = true;
      }
    } catch {}
  }

  const chunkSize = options.chunkBytes || CHUNK_BYTES;
  const interval = options.frameIntervalMs || FRAME_INTERVAL_MS;
  const total = Math.max(1, Math.ceil(payloadBytes.length / chunkSize));
  const transferId = Math.random().toString(36).slice(2, 8);
  const nameB64 = toBase64Url(new TextEncoder().encode(file.name));
  const mime = file.type || "application/octet-stream";
  const compFlag = isCompressed ? "1" : "0";

  // Standart veri kareleri üret
  const rawFrames = [];
  for (let i = 0; i < total; i++) {
    const chunk = payloadBytes.slice(i * chunkSize, (i + 1) * chunkSize);
    const dataB64 = toBase64Url(chunk);
    rawFrames.push(
      [MAGIC, transferId, i, total, nameB64, mime, rawBytes.length, compFlag, dataB64].join("|")
    );
  }

  // Interleaved stride döngüsü (kaçırılan kare takılmasını önler)
  const frames = [];
  if (total > 6) {
    const stride = chooseCoprimeStride(total);
    const visited = new Set();
    let idx = 0;
    while (visited.size < total) {
      if (!visited.has(idx)) {
        visited.add(idx);
        frames.push(rawFrames[idx]);
      }
      idx = (idx + stride) % total;
    }
  } else {
    for (let i = 0; i < total; i++) frames.push(rawFrames[i]);
  }

  return {
    frames,
    transferId,
    total,
    estSeconds: (total * interval) / 1000,
    originalSize: rawBytes.length,
    compressedSize: payloadBytes.length,
    ratio: Math.max(0, Math.round((1 - payloadBytes.length / rawBytes.length) * 100)),
    isCompressed,
  };
}

export function parseFrame(text) {
  return parseProtocolFrame(text);
}

export function assembleChunks(chunksMap, total, originalSize, isCompressed) {
  if (
    !Number.isSafeInteger(originalSize) ||
    originalSize < 0 ||
    originalSize > MAX_INPUT_BYTES
  ) {
    return null;
  }

  let totalLen = 0;
  for (let i = 0; i < total; i++) {
    const c = chunksMap.get(i);
    if (!c) return null;
    totalLen += c.length;
  }

  const payload = new Uint8Array(totalLen);
  let offset = 0;
  for (let i = 0; i < total; i++) {
    const c = chunksMap.get(i);
    payload.set(c, offset);
    offset += c.length;
  }

  if (isCompressed) {
    try {
      const bytes = unzlibSync(payload, {
        out: new Uint8Array(originalSize + 1),
      });
      return bytes.length === originalSize ? bytes : null;
    } catch (err) {
      console.error("Dekompresyon hatası:", err);
      return null;
    }
  }

  return payload;
}

// Görsel dosyalarını optik akış için otomatik küçülten yardımcı fonksiyon (JPEG dönüştürmeli)
export async function optimizeImageFile(file, maxDimension = 800, quality = 0.65) {
  if (!file) return file;
  
  const isImageMime = file.type && file.type.startsWith("image/") && !file.type.includes("svg");
  const isImageExt = /\.(jpg|jpeg|png|webp|heic|bmp|tiff)$/i.test(file.name);

  if (!isImageMime && !isImageExt) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const outputName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const optFile = new File([blob], outputName, { type: "image/jpeg" });
            resolve(optFile);
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}
