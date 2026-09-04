import { MAX_BATCH_FILES, VIDEO_BATCH_MAX_BYTES } from "./batch-files.js";
import { MAX_LIVE_QR_INPUT_BYTES } from "../live-qr/limits.js";

export const MIB = 1024 * 1024;
export const MEMBER_MAX_FILES = MAX_BATCH_FILES;
export const QR_VIDEO_MAX_BYTES = VIDEO_BATCH_MAX_BYTES;
export const SECURE_PACKAGE_MAX_BYTES = 50 * MIB;
export const GUEST_SECURE_PACKAGE_MAX_BYTES = 10 * MIB;
export const LIVE_QR_MAX_BYTES = MAX_LIVE_QR_INPUT_BYTES;
export const NEARBY_MAX_BYTES = 100 * MIB;

export function validateTransferSelection(files, { method, user }) {
  const normalized = Array.from(files ?? []);
  if (normalized.length === 0) throw new RangeError("En az bir dosya seçmelisiniz.");
  const totalBytes = normalized.reduce((total, file) => total + file.size, 0);
  if (!user) {
    if (method !== "secure_package") {
      throw new RangeError("Aktarım için giriş yapmalısınız.");
    }
    if (normalized.length !== 1 || totalBytes > GUEST_SECURE_PACKAGE_MAX_BYTES) {
      throw new RangeError("Misafir kullanımında tek dosya ve en fazla 10 MiB gönderebilirsiniz.");
    }
    return normalized;
  }
  if (method === "live_qr" && normalized.length !== 1) {
    throw new RangeError("Canlı QR yalnızca tek dosya destekler.");
  }
  if (method === "live_qr" && totalBytes > LIVE_QR_MAX_BYTES) {
    throw new RangeError(
      "Canlı QR en fazla 2 MiB destekler. Daha büyük dosyalar için Yakındaki Cihazlar veya VaultDrop kullanın.",
    );
  }
  if (method === "nearby" && normalized.length !== 1) {
    throw new RangeError("Yakındaki Cihazlar yalnızca tek dosya destekler.");
  }
  if (method === "nearby" && totalBytes > NEARBY_MAX_BYTES) {
    throw new RangeError("Yakındaki Cihazlar en fazla 100 MiB destekler.");
  }
  if (normalized.length > MEMBER_MAX_FILES) {
    throw new RangeError(`En fazla ${MEMBER_MAX_FILES} dosya seçebilirsiniz.`);
  }
  if (method === "qr_video" && totalBytes > QR_VIDEO_MAX_BYTES) {
    throw new RangeError("QR Video için toplam boyut en fazla 15 MiB olabilir.");
  }
  if (method === "secure_package" && totalBytes > SECURE_PACKAGE_MAX_BYTES) {
    throw new RangeError("VaultDrop paketi için toplam boyut en fazla 50 MiB olabilir.");
  }
  return normalized;
}
