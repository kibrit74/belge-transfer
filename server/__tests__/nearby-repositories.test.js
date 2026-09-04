import { beforeEach, describe, expect, it } from "vitest";
import { createRuntimeRepositories } from "../runtime.js";

const NOW = new Date("2026-08-13T20:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 3 * 60 * 1000);

describe("geçici Yakındaki Cihazlar oda deposu", () => {
  let repositories;

  beforeEach(() => {
    repositories = createRuntimeRepositories({ databaseUrl: "", isProduction: false });
  });

  it("aynı odaya yalnız ilk alıcıyı bağlar", async () => {
    await repositories.createNearbyRoom({ code: "ABC234", hostTokenHash: "h1", expiresAt: FUTURE });

    await expect(repositories.joinNearbyRoom({
      code: "ABC234", guestTokenHash: "g1", now: NOW,
    })).resolves.toMatchObject({ status: "joined", guest_token_hash: "g1" });
    await expect(repositories.joinNearbyRoom({
      code: "ABC234", guestTokenHash: "g2", now: NOW,
    })).resolves.toBeNull();
  });

  it("süresi geçmiş odaya alıcı bağlamaz", async () => {
    await repositories.createNearbyRoom({
      code: "EXP234", hostTokenHash: "h1", expiresAt: new Date(NOW.getTime() - 1),
    });

    await expect(repositories.joinNearbyRoom({
      code: "EXP234", guestTokenHash: "g1", now: NOW,
    })).resolves.toBeNull();
  });

  it("alıcı yalnız gönderen mesajlarını, gönderen yalnız alıcı mesajlarını görür", async () => {
    const room = await repositories.createNearbyRoom({ code: "SIG234", hostTokenHash: "h1", expiresAt: FUTURE });
    await repositories.appendNearbySignal({
      roomId: room.id, senderRole: "host", kind: "offer", sequence: 1,
      payload: { type: "offer", sdp: "host-sdp" }, now: NOW,
    });
    await repositories.appendNearbySignal({
      roomId: room.id, senderRole: "guest", kind: "answer", sequence: 2,
      payload: { type: "answer", sdp: "guest-sdp" }, now: NOW,
    });

    await expect(repositories.listNearbySignals({
      roomId: room.id, receiverRole: "guest", afterSequence: 0,
    })).resolves.toEqual([expect.objectContaining({ sender_role: "host", sequence: 1 })]);
    await expect(repositories.listNearbySignals({
      roomId: room.id, receiverRole: "host", afterSequence: 0,
    })).resolves.toEqual([expect.objectContaining({ sender_role: "guest", sequence: 2 })]);
  });

  it("aynı rol ve sıra numarasını ikinci kez kabul etmez", async () => {
    const room = await repositories.createNearbyRoom({ code: "DUP234", hostTokenHash: "h1", expiresAt: FUTURE });
    const signal = {
      roomId: room.id, senderRole: "host", kind: "ready", sequence: 1, payload: {}, now: NOW,
    };

    await expect(repositories.appendNearbySignal(signal)).resolves.toMatchObject({ sequence: 1 });
    await expect(repositories.appendNearbySignal(signal)).resolves.toBeNull();
  });

  it("yalnız doğru token özeti odayı kapatır", async () => {
    const room = await repositories.createNearbyRoom({
      code: "CLS234", hostTokenHash: "host-hash", expiresAt: FUTURE,
    });

    await expect(repositories.closeNearbyRoom({
      roomId: room.id, tokenHash: "yanlış", now: NOW,
    })).resolves.toBeNull();
    await expect(repositories.closeNearbyRoom({
      roomId: room.id, tokenHash: "host-hash", now: NOW,
    })).resolves.toMatchObject({ status: "closed" });
  });

  it("eşzamanlı host close ve guest join yarışında kapalı odaya alıcı bağlamaz", async () => {
    const room = await repositories.createNearbyRoom({
      code: "RCE234", hostTokenHash: "host-hash", expiresAt: FUTURE,
    });

    const [closed, joined] = await Promise.all([
      repositories.closeNearbyRoom({ roomId: room.id, tokenHash: "host-hash", now: NOW }),
      repositories.joinNearbyRoom({ code: room.code, guestTokenHash: "guest-hash", now: NOW }),
    ]);

    expect(closed).toMatchObject({ status: "closed" });
    expect(joined).toBeNull();
    await expect(repositories.findNearbyRoomByCode(room.code)).resolves.toMatchObject({
      status: "closed",
      guest_token_hash: null,
    });
  });

  it("süresi geçen odaları sinyalleriyle birlikte temizler", async () => {
    const expired = await repositories.createNearbyRoom({
      code: "OLD234", hostTokenHash: "h1", expiresAt: new Date(NOW.getTime() - 1),
    });
    await repositories.createNearbyRoom({ code: "NEW234", hostTokenHash: "h2", expiresAt: FUTURE });
    await repositories.appendNearbySignal({
      roomId: expired.id, senderRole: "host", kind: "ready", sequence: 1, payload: {}, now: NOW,
    });

    await expect(repositories.deleteExpiredNearbyRooms(NOW)).resolves.toBe(1);
    await expect(repositories.findNearbyRoomByCode("OLD234")).resolves.toBeNull();
    await expect(repositories.findNearbyRoomByCode("NEW234")).resolves.toMatchObject({ code: "NEW234" });
  });
});
