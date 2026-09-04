import { describe, expect, it } from "vitest";
import { deriveVerificationPhrase } from "../nearby/verification-phrase.js";

const FINGERPRINT_A = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join(":");
const FINGERPRINT_B = Array.from({ length: 32 }, (_, index) => (255 - index).toString(16).padStart(2, "0")).join(":");
const SDP_A = `v=0\r\na=fingerprint:sha-256 ${FINGERPRINT_A}\r\n`;
const SDP_B = `v=0\r\na=fingerprint:sha-256 ${FINGERPRINT_B}\r\n`;

describe("Yakındaki Cihazlar doğrulama ifadesi", () => {
  it("cihaz sırası değişse de aynı Türkçe ifadeyi üretir", async () => {
    const first = await deriveVerificationPhrase({ localSdp: SDP_A, remoteSdp: SDP_B, roomCode: "ABC234" });
    const second = await deriveVerificationPhrase({ localSdp: SDP_B, remoteSdp: SDP_A, roomCode: "ABC234" });

    expect(first).toBe(second);
    expect(first).toMatch(/^\p{L}+ \p{L}+ · \p{L}+ \p{L}+$/u);
  });

  it("oda kodu değişince ifade de değişir", async () => {
    await expect(deriveVerificationPhrase({ localSdp: SDP_A, remoteSdp: SDP_B, roomCode: "ABC234" }))
      .resolves.not.toBe(await deriveVerificationPhrase({ localSdp: SDP_A, remoteSdp: SDP_B, roomCode: "XYZ234" }));
  });

  it("tam SHA-256 DTLS parmak izi yoksa reddeder", async () => {
    await expect(deriveVerificationPhrase({
      localSdp: "v=0\r\na=fingerprint:sha-1 00:11\r\n",
      remoteSdp: SDP_B,
      roomCode: "ABC234",
    })).rejects.toMatchObject({ code: "INVALID_DTLS_FINGERPRINT" });
  });
});
