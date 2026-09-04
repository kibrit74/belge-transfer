import { describe, expect, it, vi } from "vitest";
import { createNearbyInviteUrl } from "../nearby/invite-link.js";
import { createNearbySignalingClient } from "../nearby/signaling-client.js";

describe("Yakındaki Cihazlar davet güvenliği", () => {
  it("oda oluşturma isteği ile davet URL'sine dosya veya gizli değer sızdırmaz", async () => {
    const hostToken = "HOST_SECRET";
    const sha256 = "A".repeat(43);
    const requests = [];
    const apiRequest = vi.fn(async (path, options) => {
      requests.push({ path, options });
      return {
        code: "ABC234",
        token: hostToken,
        expiresAt: "2026-08-14T12:05:00.000Z",
      };
    });
    const signaling = createNearbySignalingClient({ apiRequest });

    const sensitiveInput = {
      fileContent: "DOSYA-ICERIK-GIZLI",
      fileName: "gizli-rapor.xlsx",
      sha256,
      token: hostToken,
    };

    const room = await signaling.createRoom(sensitiveInput);
    const inviteUrl = createNearbyInviteUrl({
      origin: "https://vaultdrop.test",
      code: room.code,
      ...sensitiveInput,
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/api/nearby/rooms", {
      method: "POST",
      body: "{}",
    });
    expect(requests[0].options.headers).toBeUndefined();
    expect(inviteUrl).toBe("https://vaultdrop.test/transfer?nearby=ABC234");
    const parsedInvite = new URL(inviteUrl);
    expect([...parsedInvite.searchParams.keys()]).toEqual(["nearby"]);

    const serializedBoundary = JSON.stringify({ inviteUrl, requests });
    expect(serializedBoundary).not.toContain("DOSYA-ICERIK-GIZLI");
    expect(serializedBoundary).not.toContain("gizli-rapor.xlsx");
    expect(serializedBoundary).not.toContain(sha256);
    expect(serializedBoundary).not.toContain(hostToken);
  });
});
