export function parseLegacyFrame(text) {
  if (typeof text !== "string") return null;

  if (text.startsWith("QRT2|")) {
    const parts = text.split("|");
    if (parts.length < 9) return null;
    const [, transferId, indexText, totalText, nameBase64Url, mime, sizeText, compressionFlag, dataBase64Url] = parts;

    try {
      return {
        transferId,
        index: parseInt(indexText, 10),
        total: parseInt(totalText, 10),
        name: new TextDecoder().decode(fromLegacyBase64Url(nameBase64Url)),
        mime,
        size: parseInt(sizeText, 10),
        isCompressed: compressionFlag === "1",
        data: fromLegacyBase64Url(dataBase64Url),
      };
    } catch {
      return null;
    }
  }

  if (text.startsWith("QRT1|")) {
    const parts = text.split("|");
    if (parts.length < 8) return null;
    const [, transferId, indexText, totalText, nameBase64Url, mime, sizeText, dataBase64Url] = parts;

    try {
      return {
        transferId,
        index: parseInt(indexText, 10),
        total: parseInt(totalText, 10),
        name: new TextDecoder().decode(fromLegacyBase64Url(nameBase64Url)),
        mime,
        size: parseInt(sizeText, 10),
        isCompressed: false,
        data: fromLegacyBase64Url(dataBase64Url),
      };
    } catch {
      return null;
    }
  }

  return null;
}

function fromLegacyBase64Url(value) {
  let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
