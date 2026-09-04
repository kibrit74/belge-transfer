import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";

export const NEARBY_ROOM_TTL_MS = 5 * 60 * 1000;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_CODE_ATTEMPTS = 5;

export class NearbyServiceError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = "NearbyServiceError";
    this.code = code;
    this.status = status;
  }
}

export function createNearbyRoomService({
  repositories,
  randomBytes = nodeRandomBytes,
  now = () => new Date(),
} = {}) {
  if (!repositories) throw new TypeError("Yakındaki Cihazlar deposu gerekli.");

  return {
    async createRoom() {
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const code = createRoomCode(randomBytes);
        const token = createToken(randomBytes);
        const expiresAt = new Date(now().getTime() + NEARBY_ROOM_TTL_MS);
        try {
          await repositories.createNearbyRoom({
            code,
            hostTokenHash: hashNearbyToken(token),
            expiresAt,
          });
          return { code, token, expiresAt: expiresAt.toISOString() };
        } catch (error) {
          if (error?.code !== "23505") throw error;
        }
      }
      throw new NearbyServiceError("ROOM_CODE_EXHAUSTED", 503, "Yeni oda kodu üretilemedi.");
    },

    async joinRoom(code) {
      const room = await requireActiveRoom(repositories, code, now());
      if (room.status !== "waiting") {
        throw new NearbyServiceError("ROOM_ALREADY_JOINED", 409, "Bu odaya başka bir cihaz bağlanmış.");
      }
      const token = createToken(randomBytes);
      const joinedAt = now();
      const joined = await repositories.joinNearbyRoom({
        code,
        guestTokenHash: hashNearbyToken(token),
        now: joinedAt,
      });
      if (!joined) {
        const currentRoom = await repositories.findNearbyRoomByCode(code);
        if (!currentRoom) {
          throw new NearbyServiceError("ROOM_NOT_FOUND", 404, "Oda bulunamadı.");
        }
        if (currentRoom.status === "closed") {
          throw new NearbyServiceError("ROOM_CANCELLED", 410, "Gönderici bu daveti iptal etmiş.");
        }
        if (new Date(currentRoom.expires_at) <= joinedAt) {
          throw new NearbyServiceError("ROOM_EXPIRED", 410, "Odanın süresi dolmuş.");
        }
        throw new NearbyServiceError("ROOM_ALREADY_JOINED", 409, "Bu odaya başka bir cihaz bağlanmış.");
      }
      return { code, token, expiresAt: new Date(joined.expires_at).toISOString() };
    },

    async publishSignal({ code, token, signal }) {
      const access = await authenticateRoom(repositories, code, token, now());
      const saved = await repositories.appendNearbySignal({
        roomId: access.room.id,
        senderRole: access.role,
        ...signal,
        now: now(),
      });
      if (!saved) {
        throw new NearbyServiceError("SIGNAL_CONFLICT", 409, "Bu bağlantı mesajı daha önce işlendi.");
      }
    },

    async readSignals({ code, token, afterSequence }) {
      const access = await authenticateRoom(repositories, code, token, now());
      return repositories.listNearbySignals({
        roomId: access.room.id,
        receiverRole: access.role,
        afterSequence,
      });
    },

    async closeRoom({ code, token }) {
      const currentTime = now();
      const room = await repositories.findNearbyRoomByCode(code);
      if (!room) throw new NearbyServiceError("ROOM_NOT_FOUND", 404, "Oda bulunamadı.");
      const access = authenticateRoomToken(room, token);
      if (room.status === "closed") return;
      if (new Date(room.expires_at) <= currentTime) {
        throw new NearbyServiceError("ROOM_EXPIRED", 410, "Odanın süresi dolmuş.");
      }
      await repositories.closeNearbyRoom({
        roomId: access.room.id,
        tokenHash: hashNearbyToken(token),
        now: currentTime,
      });
    },
  };
}

export function hashNearbyToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function createRoomCode(randomBytes) {
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte & 31]).join("");
}

function createToken(randomBytes) {
  return Buffer.from(randomBytes(32)).toString("base64url");
}

async function requireActiveRoom(repositories, code, currentTime) {
  const room = await repositories.findNearbyRoomByCode(code);
  if (!room) throw new NearbyServiceError("ROOM_NOT_FOUND", 404, "Oda bulunamadı.");
  if (room.status === "closed") {
    throw new NearbyServiceError("ROOM_CANCELLED", 410, "Gönderici bu daveti iptal etmiş.");
  }
  if (new Date(room.expires_at) <= currentTime) {
    throw new NearbyServiceError("ROOM_EXPIRED", 410, "Odanın süresi dolmuş.");
  }
  return room;
}

async function authenticateRoom(repositories, code, token, currentTime) {
  const room = await requireActiveRoom(repositories, code, currentTime);
  return authenticateRoomToken(room, token);
}

function authenticateRoomToken(room, token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new NearbyServiceError("INVALID_ROOM_TOKEN", 401, "Oda anahtarı geçersiz.");
  }
  const tokenHash = hashNearbyToken(token);
  if (safeHashEquals(tokenHash, room.host_token_hash)) return { room, role: "host" };
  if (room.guest_token_hash && safeHashEquals(tokenHash, room.guest_token_hash)) return { room, role: "guest" };
  throw new NearbyServiceError("INVALID_ROOM_TOKEN", 401, "Oda anahtarı geçersiz.");
}

function safeHashEquals(left, right) {
  if (typeof right !== "string" || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
