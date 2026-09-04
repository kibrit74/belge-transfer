import { zipSync } from "fflate";
import {
  MAX_ARCHIVE_OVERHEAD_BYTES,
  MAX_ENCRYPTED_INPUT_BYTES,
} from "../crypto/encrypted-container.js";

export const MAX_BATCH_FILES = 15;
export const VIDEO_BATCH_MAX_BYTES = 15 * 1024 * 1024;
export { MAX_ARCHIVE_OVERHEAD_BYTES };
export const MAX_ARCHIVE_ENTRY_NAME_BYTES = 1024;

export function getTotalFileSize(files) {
  return Array.from(files ?? []).reduce((total, file) => total + file.size, 0);
}

export function validateBatchFiles(files, { maxBytes } = {}) {
  const normalizedFiles = Array.from(files ?? []);

  if (normalizedFiles.length === 0) {
    throw new RangeError("En az bir dosya seçmelisiniz.");
  }
  if (normalizedFiles.length > MAX_BATCH_FILES) {
    throw new RangeError(`En fazla ${MAX_BATCH_FILES} dosya seçebilirsiniz.`);
  }
  if (maxBytes !== undefined && getTotalFileSize(normalizedFiles) > maxBytes) {
    throw new RangeError("Seçilen dosyaların toplam boyutu izin verilen sınırı aşıyor.");
  }

  return normalizedFiles;
}

export function getMaximumArchiveBytes(originalBytes) {
  return Math.min(originalBytes + MAX_ARCHIVE_OVERHEAD_BYTES, MAX_ENCRYPTED_INPUT_BYTES);
}

export async function prepareTransferFile(files, { archiveName = createArchiveName() } = {}) {
  const normalizedFiles = validateBatchFiles(files);
  if (normalizedFiles.length === 1) return normalizedFiles[0];

  const entries = {};
  const usedNames = new Set();

  for (const file of normalizedFiles) {
    const entryName = createUniqueName(sanitizeEntryName(file.name), usedNames);
    entries[entryName] = new Uint8Array(await file.arrayBuffer());
  }

  const archiveBytes = zipSync(entries, { level: 6 });
  if (archiveBytes.length > getMaximumArchiveBytes(getTotalFileSize(normalizedFiles))) {
    throw new RangeError("ZIP arşivi paketleme üst yükü sınırını aşıyor.");
  }
  return new File([archiveBytes], archiveName, { type: "application/zip" });
}

function sanitizeEntryName(name) {
  const withoutControlCharacters = Array.from(String(name ?? ""))
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint > 31 && codePoint !== 127;
    })
    .join("");
  const safeName = withoutControlCharacters
    .replaceAll("\\", "_")
    .replaceAll("/", "_")
    .trim();
  return truncateUtf8(safeName || "dosya", MAX_ARCHIVE_ENTRY_NAME_BYTES);
}

function createUniqueName(name, usedNames) {
  let sequence = 2;
  const dotIndex = name.lastIndexOf(".");
  const hasExtension = dotIndex > 0;
  const baseName = hasExtension ? name.slice(0, dotIndex) : name;
  const extension = hasExtension ? name.slice(dotIndex) : "";
  let candidate = fitEntryName(baseName, extension);

  while (usedNames.has(candidate.toLocaleLowerCase("tr-TR"))) {
    candidate = fitEntryName(baseName, extension, ` (${sequence})`);
    sequence += 1;
  }

  usedNames.add(candidate.toLocaleLowerCase("tr-TR"));
  return candidate;
}

function fitEntryName(baseName, extension, suffix = "") {
  const suffixAndExtension = truncateUtf8(
    `${suffix}${extension}`,
    MAX_ARCHIVE_ENTRY_NAME_BYTES,
  );
  const baseBudget = Math.max(
    0,
    MAX_ARCHIVE_ENTRY_NAME_BYTES - utf8Length(suffixAndExtension),
  );
  return `${truncateUtf8(baseName, baseBudget)}${suffixAndExtension}` || "dosya";
}

function truncateUtf8(value, maximumBytes) {
  const characters = [];
  let byteLength = 0;
  for (const character of String(value)) {
    const characterBytes = utf8Length(character);
    if (byteLength + characterBytes > maximumBytes) break;
    characters.push(character);
    byteLength += characterBytes;
  }
  return characters.join("");
}

function utf8Length(value) {
  return new TextEncoder().encode(value).length;
}

function createArchiveName() {
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  const time = [now.getHours(), now.getMinutes()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  return `toplu-aktarim-${date}-${time}.zip`;
}
