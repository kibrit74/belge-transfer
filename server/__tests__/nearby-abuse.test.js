import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createRuntimeRepositories } from "../runtime.js";

const HEADERS = { Origin: "http://localhost:5173", "X-VaultDrop-Request": "1" };

function setup() {
  const repositories = createRuntimeRepositories({ databaseUrl: "", isProduction: false });
  const app = createApp({
    config: { frontendOrigin: "http://localhost:5173", sessionCookieName: "session", isProduction: false },
    repositories,
  });
  return { app, repositories };
}

describe("Yakındaki Cihazlar kötüye kullanım sınırları", () => {
  it("aynı istemcinin aşırı oda oluşturmasını sınırlar", async () => {
    const { app } = setup();
    const statuses = [];
    for (let index = 0; index < 12; index += 1) {
      const response = await request(app).post("/api/nearby/rooms").set(HEADERS).send({});
      statuses.push(response.status);
    }

    expect(statuses.filter((status) => status === 201)).toHaveLength(10);
    expect(statuses.at(-1)).toBe(429);
  });

  it("çok sayıda kod denemesini 429 ile sınırlar", async () => {
    const { app } = setup();
    const statuses = [];
    for (let index = 0; index < 12; index += 1) {
      const response = await request(app)
        .post("/api/nearby/rooms/ABC234/join")
        .set(HEADERS)
        .send({});
      statuses.push(response.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("beş dakikalık davette aynı IP host ve guest polling genel limiti tüketmeden çalışır", async () => {
    const { app } = setup();
    let nowMs = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    try {
      const host = await request(app).post("/api/nearby/rooms").set(HEADERS).send({}).expect(201);
      const guest = await request(app)
        .post(`/api/nearby/rooms/${host.body.code}/join`)
        .set(HEADERS)
        .send({})
        .expect(200);

      for (let minute = 0; minute < 5; minute += 1) {
        for (let poll = 0; poll < 120; poll += 1) {
          await request(app)
            .get(`/api/nearby/rooms/${host.body.code}/signals?after=0`)
            .set("X-Nearby-Token", host.body.token)
            .expect(200);
          await request(app)
            .get(`/api/nearby/rooms/${host.body.code}/signals?after=0`)
            .set("X-Nearby-Token", guest.body.token)
            .expect(200);
        }
        nowMs += 60_001;
      }
    } finally {
      nowSpy.mockRestore();
    }
  }, 30_000);

  it("polling için oda ve token tabanlı ayrı kötüye kullanım sınırını korur", async () => {
    const { app } = setup();
    const host = await request(app).post("/api/nearby/rooms").set(HEADERS).send({}).expect(201);

    for (let poll = 0; poll < 150; poll += 1) {
      await request(app)
        .get(`/api/nearby/rooms/${host.body.code}/signals?after=0`)
        .set("X-Nearby-Token", host.body.token)
        .expect(200);
    }
    await request(app)
      .get(`/api/nearby/rooms/${host.body.code}/signals?after=0`)
      .set("X-Nearby-Token", host.body.token)
      .expect(429);
  }, 15_000);

  it("token döndürerek oda-token sınırını aşmaya çalışan aynı IP'yi ayrıca sınırlar", async () => {
    const { app } = setup();
    const host = await request(app).post("/api/nearby/rooms").set(HEADERS).send({}).expect(201);
    const statuses = [];

    for (let attempt = 0; attempt < 361; attempt += 1) {
      const response = await request(app)
        .get(`/api/nearby/rooms/${host.body.code}/signals?after=0`)
        .set("X-Nearby-Token", `rotating-token-${attempt}`);
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 360).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  }, 15_000);

  it("büyük SDP ve ICE adayını API sınırında reddeder", async () => {
    const { app } = setup();
    const created = await request(app).post("/api/nearby/rooms").set(HEADERS).send({}).expect(201);
    await request(app)
      .post(`/api/nearby/rooms/${created.body.code}/signals`)
      .set({ ...HEADERS, "X-Nearby-Token": created.body.token })
      .send({ kind: "offer", sequence: 1, payload: { type: "offer", sdp: "x".repeat(12 * 1024 + 1) } })
      .expect(400);
    await request(app)
      .post(`/api/nearby/rooms/${created.body.code}/signals`)
      .set({ ...HEADERS, "X-Nearby-Token": created.body.token })
      .send({
        kind: "ice", sequence: 2,
        payload: { candidate: "x".repeat(2 * 1024 + 1), sdpMid: null, sdpMLineIndex: null },
      })
      .expect(400);
  });

  it("1000 süresi dolmuş odayı dosya alanı olmadan temizler", async () => {
    const { repositories } = setup();
    const now = new Date("2026-08-14T00:00:00.000Z");
    for (let index = 0; index < 1000; index += 1) {
      await repositories.createNearbyRoom({
        code: `N${index.toString(36).toUpperCase().padStart(5, "0")}`,
        hostTokenHash: `hash-${index}`,
        expiresAt: new Date(now.getTime() - 1),
      });
    }
    await expect(repositories.deleteExpiredNearbyRooms(now)).resolves.toBe(1000);
  });
});
