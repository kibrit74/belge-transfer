const MIB = 1024 * 1024;

export const TRANSFER_METHODS = Object.freeze([
  Object.freeze({
    id: "live", activityMethod: "live_qr", title: "Canlı QR",
    sendDescription: "Yanındaki telefona veya cihaza kamerayla gönder.",
    receiveTitle: "Kameradan tara",
    receiveDescription: "Yanındaki ekrandaki Canlı QR'ı okut.",
    maxBytes: 2 * MIB, encrypted: false, requiresCamera: true, requiresSameNetwork: false,
  }),
  Object.freeze({
    id: "nearby", activityMethod: "nearby", title: "Yakındaki Cihazlar",
    sendDescription: "Aynı Wi-Fi'daki bilgisayara doğrudan gönder.",
    receiveTitle: "Yakındaki cihaz kodunu gir",
    receiveDescription: "Aynı ağdaki bilgisayarın 6 karakterli kodunu kullan.",
    maxBytes: 100 * MIB, encrypted: true, requiresCamera: false, requiresSameNetwork: true,
  }),
  Object.freeze({
    id: "package", activityMethod: "secure_package", title: "VaultDrop — Uzak cihaz",
    sendDescription: "Uzak cihaza şifreli paket gönder.",
    receiveTitle: "VaultDrop paketini aç",
    receiveDescription: ".vdrop veya eski .bta paketini ayrı gelen anahtarla aç.",
    maxBytes: 50 * MIB, encrypted: true, requiresCamera: false, requiresSameNetwork: false,
  }),
]);

export function getTransferMethod(id) {
  return TRANSFER_METHODS.find((method) => method.id === id) ?? null;
}

export function getEffectiveMethodRegistry(flags) {
  return Object.freeze(TRANSFER_METHODS.map((method) => Object.freeze({
    ...method,
    enabled: method.id !== "nearby" || flags.nearbyEnabled,
    maxBytes: method.maxBytes,
  })));
}

export function recommendTransferMethod({
  proximity,
  sameNetwork,
  sensitive,
  sizeBytes,
  cameraAvailable,
} = {}) {
  if (sensitive || proximity === "remote") {
    return { primary: "package", fallback: null, reason: packageReason(sizeBytes) };
  }
  if (sameNetwork && sizeBytes <= getTransferMethod("nearby").maxBytes) {
    return { primary: "nearby", fallback: "package", reason: "Aynı ağdaki tarayıcılar arasında doğrudan aktarım." };
  }
  if (cameraAvailable && sizeBytes <= getTransferMethod("live").maxBytes) {
    return { primary: "live", fallback: "package", reason: "Yan yana cihazlarda kamera ile hızlı aktarım." };
  }
  return { primary: "package", fallback: null, reason: packageReason(sizeBytes) };
}

function packageReason(sizeBytes) {
  return sizeBytes > getTransferMethod("package").maxBytes
    ? "Dosya VaultDrop'un 50 MiB işlem sınırını aşıyor. Dosyayı bölmek gerekir."
    : "Uzak veya hassas dosya için şifreli VaultDrop kullanılır.";
}
