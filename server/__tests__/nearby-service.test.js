import { describe, expect, it, vi } from "vitest";
import {
  NEARBY_ROOM_TTL_MS,
  createNearbyRoomService,
} from "../nearby-service.js";

describe("Yakındaki Cihazlar davet ömrü", () => {
  it("odayı tam beş dakika geçerli üretir", async () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const repositories = {
      createNearbyRoom: vi.fn(async (room) => room),
    };
    const service = createNearbyRoomService({
      repositories,
      now: () => now,
      randomBytes: (length) => Buffer.alloc(length, 1),
    });

    const room = await service.createRoom();

    expect(NEARBY_ROOM_TTL_MS).toBe(5 * 60 * 1000);
    expect(new Date(room.expiresAt).getTime() - now.getTime()).toBe(5 * 60 * 1000);
  });

  it.each([
    [
      "kapatılan",
      { status: "closed", expires_at: "2026-08-14T12:05:00.000Z" },
      "ROOM_CANCELLED",
      410,
    ],
    [
      "süresi dolan",
      { status: "waiting", expires_at: "2026-08-14T12:00:00.000Z" },
      "ROOM_EXPIRED",
      410,
    ],
    [
      "başka alıcının katıldığı",
      { status: "joined", expires_at: "2026-08-14T12:05:00.000Z" },
      "ROOM_ALREADY_JOINED",
      409,
    ],
  ])("atomik join kaybında güncel olarak %s odayı doğru kodla bildirir", async (
    _case,
    currentRoom,
    code,
    status,
  ) => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const initialRoom = {
      code: "ABC234",
      status: "waiting",
      expires_at: "2026-08-14T12:05:00.000Z",
    };
    const repositories = {
      findNearbyRoomByCode: vi.fn()
        .mockResolvedValueOnce(initialRoom)
        .mockResolvedValueOnce({ ...initialRoom, ...currentRoom }),
      joinNearbyRoom: vi.fn(async () => null),
    };
    const service = createNearbyRoomService({
      repositories,
      now: () => now,
      randomBytes: (length) => Buffer.alloc(length, 1),
    });

    await expect(service.joinRoom("ABC234")).rejects.toMatchObject({
      code,
      status,
    });
    expect(repositories.findNearbyRoomByCode).toHaveBeenCalledTimes(2);
  });
});
