import { pureJsSha256 } from "../protocol/hash.js";

const ADJECTIVES = Object.freeze([
  "Açık", "Altın", "Berrak", "Cesur", "Dingin", "Güvenli", "Hızlı", "Ilık",
  "Kibar", "Mavi", "Neşeli", "Parlak", "Sakin", "Temiz", "Usta", "Yeşil",
]);
const NOUNS = Object.freeze([
  "Ada", "Arı", "Bulut", "Çınar", "Deniz", "Fener", "Göl", "Irmak",
  "Kale", "Köprü", "Lale", "Martı", "Orman", "Pusula", "Rüzgâr", "Yıldız",
]);
const FINGERPRINT_PATTERN = /a=fingerprint:sha-256 ([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){31})(?:\r?\n|$)/;

export async function deriveVerificationPhrase({ localSdp, remoteSdp, roomCode } = {}) {
  const fingerprints = [extractFingerprint(localSdp), extractFingerprint(remoteSdp)].sort();
  const input = new TextEncoder().encode(`${roomCode}|${fingerprints.join("|")}`);
  const digest = await sha256Bytes(input);
  return `${ADJECTIVES[digest[0] % 16]} ${NOUNS[digest[1] % 16]} · ${ADJECTIVES[digest[2] % 16]} ${NOUNS[digest[3] % 16]}`;
}

function extractFingerprint(sdp) {
  const match = typeof sdp === "string" ? FINGERPRINT_PATTERN.exec(sdp) : null;
  if (!match) {
    const error = new Error("Güvenli cihaz parmak izi bulunamadı.");
    error.code = "INVALID_DTLS_FINGERPRINT";
    throw error;
  }
  return match[1].toUpperCase();
}

async function sha256Bytes(bytes) {
  if (globalThis.crypto?.subtle?.digest) {
    try {
      return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    } catch {
      // Tarayıcı özeti kullanılamazsa aynı sonucu veren yerel yedeğe geç.
    }
  }
  return pureJsSha256(bytes);
}
