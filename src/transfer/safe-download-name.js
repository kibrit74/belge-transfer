const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const INVALID_FILENAME_CHARACTERS = /[<>:"|?*]/g;
const MAX_DOWNLOAD_NAME_LENGTH = 180;

export function sanitizeDownloadName(name, fallback = "indirilen-dosya") {
  const source = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .at(-1) ?? "";
  const cleaned = source
    .replace(INVALID_FILENAME_CHARACTERS, "")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!cleaned) return fallback;
  if (!WINDOWS_RESERVED.test(cleaned)) return truncateDownloadName(cleaned);

  const extensionStart = cleaned.lastIndexOf(".");
  const extension = extensionStart > 0 ? cleaned.slice(extensionStart) : "";
  return truncateDownloadName(`${fallback}${extension}`);
}

function truncateDownloadName(name) {
  if (name.length <= MAX_DOWNLOAD_NAME_LENGTH) return name;

  const extensionStart = name.lastIndexOf(".");
  const extension = extensionStart > 0 ? name.slice(extensionStart) : "";
  const baseName = extension ? name.slice(0, extensionStart) : name;
  const safeExtension = extension.slice(0, Math.max(0, MAX_DOWNLOAD_NAME_LENGTH - 1));
  return `${baseName.slice(0, MAX_DOWNLOAD_NAME_LENGTH - safeExtension.length)}${safeExtension}`;
}
