import { fromBase64Url, toBase64Url } from "../protocol/base64url.js";
import { MAX_INPUT_BYTES } from "../protocol/frame-v3.js";
import { readFileAsArrayBuffer, sha256Base64Url } from "../protocol/hash.js";
import { restoreTransferPayload } from "../transfer/payload-compression.js";
import { sanitizeDownloadName } from "../transfer/safe-download-name.js";

const MAGIC = new Uint8Array([0x42, 0x54, 0x41, 0x31]);
const VERSION_1 = 1;
const VERSION_2 = 2;
const IV_BYTES = 12;
const HEADER_BYTES = MAGIC.length + 1 + IV_BYTES;
const GCM_TAG_BYTES = 16;
const METADATA_LENGTH_BYTES = 4;
const MAX_METADATA_BYTES = 16 * 1024;
export const MAX_ARCHIVE_OVERHEAD_BYTES = 64 * 1024;
export const MAX_ENCRYPTED_INPUT_BYTES = MAX_INPUT_BYTES + MAX_ARCHIVE_OVERHEAD_BYTES;
export const MAX_CONTAINER_BYTES =
  HEADER_BYTES + GCM_TAG_BYTES + METADATA_LENGTH_BYTES + MAX_METADATA_BYTES + MAX_ENCRYPTED_INPUT_BYTES;
const KEY_BYTES = 32;
const KEY_TEXT_LENGTH = 43;
const VAULTDROP_PACKAGE_MIME = "application/vnd.vaultdrop.package";
const VERSION_2_METADATA_KEYS = [
  "name",
  "type",
  "compression",
  "originalSize",
  "storedSize",
  "originalSha256",
  "storedSha256",
];
const TRANSFER_ID_LENGTH = 12;
const TRANSFER_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const ERROR_MESSAGES = {
  INVALID_MAGIC: "Geçersiz veya eksik şifreli paket.",
  UNSUPPORTED_VERSION: "Bu şifreli paket sürümü desteklenmiyor.",
  INVALID_KEY: "Anahtar geçersiz veya paket bozuk.",
  SIZE_LIMIT: "Paket veya dosya izin verilen boyut sınırını aşıyor.",
  HASH_MISMATCH: "Dosya bütünlük doğrulaması başarısız.",
  NO_CRYPTO:
    "Şifreleme için Web Crypto API gerekiyor. Güvensiz (HTTP) ağ erişimi nedeniyle bu ortamda şifreleme yapılamıyor. Lütfen localhost veya HTTPS adresi kullanın.",
};

class ContainerError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || "Şifreleme işlemi başarısız.");
    this.name = "ContainerError";
    this.code = code;
  }
}

function isContextSecure() {
  if (typeof globalThis.isSecureContext === "boolean") {
    return globalThis.isSecureContext;
  }
  return true;
}

export async function encryptFile(file) {
  if (!isContextSecure() || !globalThis.crypto?.subtle) {
    throw containerError("NO_CRYPTO");
  }
  if (!(file instanceof File)) {
    throw new TypeError("Şifrelenecek veri bir File olmalı.");
  }
  assertEncryptableInputSize(file.size);

  const arrayBuf = await readFileAsArrayBuffer(file);
  const fileBytes = new Uint8Array(arrayBuf);
  const sha256 = await sha256Base64Url(fileBytes);
  return encryptBytes(fileBytes, {
    version: VERSION_1,
    metadata: {
      name: file.name,
      type: file.type,
      size: fileBytes.length,
      sha256,
    },
    resultSha256: sha256,
  });
}

export async function encryptPreparedFile(file, prepared) {
  if (!isContextSecure() || !globalThis.crypto?.subtle) {
    throw containerError("NO_CRYPTO");
  }
  validatePreparedPayload(file, prepared);

  return encryptBytes(prepared.storedBytes, {
    version: VERSION_2,
    metadata: {
      name: file.name,
      type: file.type,
      compression: prepared.compression,
      originalSize: prepared.originalSize,
      storedSize: prepared.storedSize,
      originalSha256: prepared.originalSha256,
      storedSha256: prepared.storedSha256,
    },
    resultSha256: prepared.originalSha256,
  });
}

async function encryptBytes(fileBytes, { version, metadata, resultSha256 }) {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));

  if (metadataBytes.length > MAX_METADATA_BYTES) {
    throw containerError("SIZE_LIMIT");
  }

  const plaintext = new Uint8Array(
    METADATA_LENGTH_BYTES + metadataBytes.length + fileBytes.length,
  );
  new DataView(plaintext.buffer).setUint32(0, metadataBytes.length, false);
  plaintext.set(metadataBytes, METADATA_LENGTH_BYTES);
  plaintext.set(fileBytes, METADATA_LENGTH_BYTES + metadataBytes.length);

  const key = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  const rawKey = new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", key));

  const container = new Uint8Array(HEADER_BYTES + ciphertext.length);
  container.set(MAGIC, 0);
  container[MAGIC.length] = version;
  container.set(iv, MAGIC.length + 1);
  container.set(ciphertext, HEADER_BYTES);

  return {
    blob: new Blob([container], { type: VAULTDROP_PACKAGE_MIME }),
    keyText: toBase64Url(rawKey),
    transferId: createTransferId(),
    sha256: resultSha256,
  };
}

export async function decryptContainer(buffer, keyText) {
  if (!isContextSecure() || !globalThis.crypto?.subtle) {
    throw containerError("NO_CRYPTO");
  }
  const container = toByteView(buffer);
  assertContainerSize(container.byteLength);
  if (container.byteLength < HEADER_BYTES + GCM_TAG_BYTES + METADATA_LENGTH_BYTES) {
    throw containerError("INVALID_MAGIC");
  }
  if (!hasMagic(container)) {
    throw containerError("INVALID_MAGIC");
  }
  const version = container[MAGIC.length];
  if (version !== VERSION_1 && version !== VERSION_2) {
    throw containerError("UNSUPPORTED_VERSION");
  }

  const keyBytes = decodeKey(keyText);
  const key = await importDecryptionKey(keyBytes);
  const iv = container.subarray(MAGIC.length + 1, HEADER_BYTES);
  const ciphertext = container.subarray(HEADER_BYTES);
  const plaintext = await decrypt(ciphertext, key, iv);

  if (plaintext.byteLength < METADATA_LENGTH_BYTES) {
    throw containerError("INVALID_MAGIC");
  }

  const metadataLength = new DataView(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.byteLength,
  ).getUint32(0, false);
  if (metadataLength > MAX_METADATA_BYTES) {
    throw containerError("SIZE_LIMIT");
  }
  if (metadataLength > plaintext.byteLength - METADATA_LENGTH_BYTES) {
    throw containerError("INVALID_MAGIC");
  }

  const metadataStart = METADATA_LENGTH_BYTES;
  const metadataEnd = metadataStart + metadataLength;
  const metadata = parseMetadata(
    plaintext.subarray(metadataStart, metadataEnd),
    version,
  );
  const storedBytes = plaintext.subarray(metadataEnd);

  if (version === VERSION_1) {
    return openVersion1(metadata, storedBytes);
  }

  return openVersion2(metadata, storedBytes);
}

async function openVersion1(metadata, fileBytes) {
  if (
    fileBytes.byteLength > MAX_ENCRYPTED_INPUT_BYTES ||
    metadata.size > MAX_ENCRYPTED_INPUT_BYTES
  ) {
    throw containerError("SIZE_LIMIT");
  }
  if (metadata.size !== fileBytes.byteLength) {
    throw containerError("HASH_MISMATCH");
  }

  const sha256 = await sha256Base64Url(fileBytes);
  if (sha256 !== metadata.sha256) {
    throw containerError("HASH_MISMATCH");
  }

  return {
    file: new File([fileBytes], sanitizeDownloadName(metadata.name), { type: metadata.type }),
    sha256,
  };
}

async function openVersion2(metadata, storedBytes) {
  if (
    storedBytes.byteLength > MAX_ENCRYPTED_INPUT_BYTES ||
    metadata.storedSize > MAX_ENCRYPTED_INPUT_BYTES ||
    metadata.originalSize > MAX_ENCRYPTED_INPUT_BYTES
  ) {
    throw containerError("SIZE_LIMIT");
  }
  if (storedBytes.byteLength !== metadata.storedSize) {
    throw containerError("HASH_MISMATCH");
  }

  const storedSha256 = await sha256Base64Url(storedBytes);
  if (storedSha256 !== metadata.storedSha256) {
    throw containerError("HASH_MISMATCH");
  }

  let originalBytes;
  try {
    originalBytes = await restoreTransferPayload(storedBytes, metadata);
  } catch {
    throw containerError("HASH_MISMATCH");
  }

  if (
    originalBytes.byteLength !== metadata.originalSize ||
    (await sha256Base64Url(originalBytes)) !== metadata.originalSha256
  ) {
    throw containerError("HASH_MISMATCH");
  }

  return {
    file: new File([originalBytes], sanitizeDownloadName(metadata.name), { type: metadata.type }),
    sha256: metadata.originalSha256,
    compression: metadata.compression,
  };
}

function toByteView(buffer) {
  if (buffer instanceof ArrayBuffer) {
    const byteLength = buffer.byteLength;
    return new Uint8Array(buffer, 0, byteLength);
  }
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  throw containerError("INVALID_MAGIC");
}

function validatePreparedPayload(file, prepared) {
  if (!(file instanceof File)) {
    throw new TypeError("Şifrelenecek veri bir File olmalı.");
  }
  if (
    prepared === null ||
    typeof prepared !== "object" ||
    !(prepared.storedBytes instanceof Uint8Array) ||
    (prepared.compression !== "none" && prepared.compression !== "zlib") ||
    !Number.isSafeInteger(prepared.originalSize) ||
    prepared.originalSize < 0 ||
    prepared.originalSize !== file.size ||
    !Number.isSafeInteger(prepared.storedSize) ||
    prepared.storedSize < 0 ||
    prepared.storedSize !== prepared.storedBytes.length ||
    !isCanonicalSha256(prepared.originalSha256) ||
    !isCanonicalSha256(prepared.storedSha256)
  ) {
    throw new TypeError("Hazırlanmış aktarım verisi geçersiz.");
  }

  assertEncryptableInputSize(prepared.originalSize);
  assertEncryptableInputSize(prepared.storedSize);
}

export function assertEncryptableInputSize(size) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENCRYPTED_INPUT_BYTES) {
    throw containerError("SIZE_LIMIT");
  }
}

export function assertContainerSize(size) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_CONTAINER_BYTES) {
    throw containerError("SIZE_LIMIT");
  }
}

function hasMagic(container) {
  return MAGIC.every((value, index) => container[index] === value);
}

function decodeKey(keyText) {
  const cleanKey = typeof keyText === "string" ? keyText.trim() : "";
  if (
    cleanKey.length !== KEY_TEXT_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(cleanKey)
  ) {
    throw containerError("INVALID_KEY");
  }

  try {
    const keyBytes = fromBase64Url(cleanKey);
    if (keyBytes.length !== KEY_BYTES || toBase64Url(keyBytes) !== cleanKey) {
      throw containerError("INVALID_KEY");
    }
    return keyBytes;
  } catch {
    throw containerError("INVALID_KEY");
  }
}

async function importDecryptionKey(keyBytes) {
  try {
    return await globalThis.crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
  } catch {
    throw containerError("INVALID_KEY");
  }
}

async function decrypt(ciphertext, key, iv) {
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw containerError("INVALID_KEY");
  }
}

function parseMetadata(metadataBytes, version) {
  let metadata;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes);
    metadata = JSON.parse(json);
  } catch {
    throw containerError("INVALID_MAGIC");
  }

  const commonMetadataIsInvalid =
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    typeof metadata.name !== "string" ||
    typeof metadata.type !== "string";
  if (commonMetadataIsInvalid) {
    throw containerError("INVALID_MAGIC");
  }

  const version1MetadataIsInvalid =
    version === VERSION_1 &&
    (
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 0 ||
      !isCanonicalSha256(metadata.sha256)
    );
  const version2MetadataIsInvalid =
    version === VERSION_2 &&
    (
      !hasExactKeys(metadata, VERSION_2_METADATA_KEYS) ||
      (metadata.compression !== "none" && metadata.compression !== "zlib") ||
      !Number.isSafeInteger(metadata.originalSize) ||
      metadata.originalSize < 0 ||
      !Number.isSafeInteger(metadata.storedSize) ||
      metadata.storedSize < 0 ||
      !isCanonicalSha256(metadata.originalSha256) ||
      !isCanonicalSha256(metadata.storedSha256)
    );

  if (version1MetadataIsInvalid || version2MetadataIsInvalid) {
    throw containerError("INVALID_MAGIC");
  }

  return metadata;
}

function hasExactKeys(value, expectedKeys) {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key));
}

function isCanonicalSha256(value) {
  if (typeof value !== "string" || value.length !== KEY_TEXT_LENGTH) return false;
  try {
    const bytes = fromBase64Url(value);
    return bytes.length === KEY_BYTES && toBase64Url(bytes) === value;
  } catch {
    return false;
  }
}

function createTransferId() {
  const result = [];
  const randomBytes = new Uint8Array(24);

  while (result.length < TRANSFER_ID_LENGTH) {
    globalThis.crypto.getRandomValues(randomBytes);
    for (const value of randomBytes) {
      if (value < 248) result.push(TRANSFER_ID_ALPHABET[value % TRANSFER_ID_ALPHABET.length]);
      if (result.length === TRANSFER_ID_LENGTH) break;
    }
  }

  return result.join("");
}

function containerError(code) {
  return new ContainerError(code);
}
