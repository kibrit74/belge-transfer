import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../auth.js";
import { createApp } from "../app.js";
import { createRuntimeRepositories } from "../runtime.js";

const ORIGIN_HEADERS = {
  Origin: "http://localhost:5173",
  "X-VaultDrop-Request": "1",
};

function createTestApp() {
  const repositories = createRuntimeRepositories({ databaseUrl: "", isProduction: false });
  return {
    repositories,
    app: createApp({
      config: {
        frontendOrigin: "http://localhost:5173",
        sessionCookieName: "vaultdrop_session",
        isProduction: false,
      },
      repositories,
    }),
  };
}

async function createRoom(app) {
  const response = await request(app)
    .post("/api/nearby/rooms")
    .set(ORIGIN_HEADERS)
    .send({});
  expect(response.status).toBe(201);
  return response.body;
}

describe("Yakındaki Cihazlar tanıştırma API'si", () => {
  let app;
  let repositories;

  beforeEach(() => {
    ({ app, repositories } = createTestApp());
  });

  it("oda üretir, ilk alıcıyı kabul eder ve ikinciyi reddeder", async () => {
    const created = await createRoom(app);

    expect(created.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(created.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const attempts = await Promise.all([
      request(app).post(`/api/nearby/rooms/${created.code}/join`).set(ORIGIN_HEADERS).send({}),
      request(app).post(`/api/nearby/rooms/${created.code}/join`).set(ORIGIN_HEADERS).send({}),
    ]);

    expect(attempts.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(attempts.find((response) => response.status === 200).body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("ikinci alıcı reddedilse de ilk alıcının sinyal bağlantısını korur", async () => {
    const host = await createRoom(app);
    const firstJoin = await request(app)
      .post(`/api/nearby/rooms/${host.code}/join`)
      .set(ORIGIN_HEADERS)
      .send({})
      .expect(200);

    const secondJoin = await request(app)
      .post(`/api/nearby/rooms/${host.code}/join`)
      .set(ORIGIN_HEADERS)
      .send({})
      .expect(409);
    expect(secondJoin.body.code).toBe("ROOM_ALREADY_JOINED");

    await request(app)
      .post(`/api/nearby/rooms/${host.code}/signals`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": firstJoin.body.token })
      .send({ kind: "answer", sequence: 1, payload: { type: "answer", sdp: "first-guest-sdp" } })
      .expect(201);
    const signals = await request(app)
      .get(`/api/nearby/rooms/${host.code}/signals?after=0`)
      .set("X-Nearby-Token", firstJoin.body.token)
      .expect(200);

    expect(signals.body.signals).toEqual([]);
  });

  it("üyelik başlığı olmadan oda oluşturur ve katılır", async () => {
    const created = await createRoom(app);
    const joined = await request(app)
      .post(`/api/nearby/rooms/${created.code}/join`)
      .set(ORIGIN_HEADERS)
      .send({});

    expect(joined.status).toBe(200);
    expect(joined.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("yanlış tokenı reddeder ve bütün cevapları önbelleğe kapatır", async () => {
    const created = await createRoom(app);
    const response = await request(app)
      .get(`/api/nearby/rooms/${created.code}/signals?after=0`)
      .set("X-Nearby-Token", "yanlis-token");

    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("dosya üst bilgisi veya fazladan alan taşıyan signal isteğini kabul etmez", async () => {
    const created = await createRoom(app);
    const response = await request(app)
      .post(`/api/nearby/rooms/${created.code}/signals`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": created.token })
      .send({
        kind: "offer",
        sequence: 1,
        payload: { type: "offer", sdp: "v=0\r\n" },
        fileName: "gizli-rapor.pdf",
      });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain("gizli-rapor.pdf");
  });

  it("iki rol arasında offer ve answer mesajlarını ayırır", async () => {
    const host = await createRoom(app);
    const guestResponse = await request(app)
      .post(`/api/nearby/rooms/${host.code}/join`)
      .set(ORIGIN_HEADERS)
      .send({});
    const guest = guestResponse.body;

    await request(app)
      .post(`/api/nearby/rooms/${host.code}/signals`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": host.token })
      .send({ kind: "offer", sequence: 1, payload: { type: "offer", sdp: "host-sdp" } })
      .expect(201);
    await request(app)
      .post(`/api/nearby/rooms/${host.code}/signals`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": guest.token })
      .send({ kind: "answer", sequence: 2, payload: { type: "answer", sdp: "guest-sdp" } })
      .expect(201);

    const forGuest = await request(app)
      .get(`/api/nearby/rooms/${host.code}/signals?after=0`)
      .set("X-Nearby-Token", guest.token)
      .expect(200);
    const forHost = await request(app)
      .get(`/api/nearby/rooms/${host.code}/signals?after=0`)
      .set("X-Nearby-Token", host.token)
      .expect(200);

    expect(forGuest.body.signals).toEqual([expect.objectContaining({ kind: "offer", sequence: 1 })]);
    expect(forHost.body.signals).toEqual([expect.objectContaining({ kind: "answer", sequence: 2 })]);
  });

  it("aynı sıra numarasını ikinci kez kabul etmez", async () => {
    const host = await createRoom(app);
    const signal = { kind: "ready", sequence: 1, payload: {} };

    await request(app)
      .post(`/api/nearby/rooms/${host.code}/signals`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": host.token })
      .send(signal)
      .expect(201);
    await request(app)
      .post(`/api/nearby/rooms/${host.code}/signals`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": host.token })
      .send(signal)
      .expect(409);
  });

  it("12 KiB üstündeki SDP ve geçersiz oda kodunu reddeder", async () => {
    const host = await createRoom(app);
    await request(app)
      .post(`/api/nearby/rooms/${host.code}/signals`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": host.token })
      .send({ kind: "offer", sequence: 1, payload: { type: "offer", sdp: "x".repeat(12 * 1024 + 1) } })
      .expect(400);
    await request(app)
      .post("/api/nearby/rooms/O0I1XX/join")
      .set(ORIGIN_HEADERS)
      .send({})
      .expect(400);
  });

  it("süresi dolmuş odayı 410 ile kapatır", async () => {
    const token = "A".repeat(43);
    await repositories.createNearbyRoom({
      code: "XLD234",
      hostTokenHash: hashToken(token),
      expiresAt: new Date(Date.now() - 1),
    });

    await request(app)
      .get("/api/nearby/rooms/XLD234/signals?after=0")
      .set("X-Nearby-Token", token)
      .expect(410);
  });

  it("oda kapatılınca tekrar okunamaz", async () => {
    const host = await createRoom(app);
    await request(app)
      .delete(`/api/nearby/rooms/${host.code}`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": host.token })
      .expect(204);
    await request(app)
      .get(`/api/nearby/rooms/${host.code}/signals?after=0`)
      .set("X-Nearby-Token", host.token)
      .expect(410);
  });

  it("aynı geçerli tokenla tekrarlanan DELETE isteğini idempotent kabul eder, yanlış tokenı reddeder", async () => {
    const host = await createRoom(app);
    const path = `/api/nearby/rooms/${host.code}`;

    await request(app)
      .delete(path)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": host.token })
      .expect(204);
    await request(app)
      .delete(path)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": host.token })
      .expect(204);
    const rejected = await request(app)
      .delete(path)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": "yanlis-token" })
      .expect(401);

    expect(rejected.body.code).toBe("INVALID_ROOM_TOKEN");
  });

  it("gönderen kapattığı odaya katılmayı iptal edilmiş olarak bildirir", async () => {
    const host = await createRoom(app);
    await request(app)
      .delete(`/api/nearby/rooms/${host.code}`)
      .set({ ...ORIGIN_HEADERS, "X-Nearby-Token": host.token })
      .expect(204);

    const response = await request(app)
      .post(`/api/nearby/rooms/${host.code}/join`)
      .set(ORIGIN_HEADERS)
      .send({});

    expect(response.status).toBe(410);
    expect(response.body.code).toBe("ROOM_CANCELLED");
  });
});
