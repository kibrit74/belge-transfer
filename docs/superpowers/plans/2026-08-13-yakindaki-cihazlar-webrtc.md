# Yakındaki Cihazlar WebRTC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aynı Wi-Fi veya yerel ağdaki iki bilgisayar arasında masaüstü uygulaması olmadan, dosya içeriğini sunucuya yüklemeden, tarayıcıdan tarayıcıya doğrulanmış dosya aktarımı sağlamak.

**Architecture:** HTTPS tanıştırma API'si 6 karakterlik tek kullanımlık oda kodu, geçici WebRTC offer/answer ve ICE mesajlarını taşır; dosya içeriğini ve dosya metadata'sını kabul etmez. Tarayıcılar güvenilir sıralı `RTCDataChannel` kurar, kullanıcı iki ekrandaki doğrulama ifadesini karşılaştırır, alıcı onayından sonra dosya 32 KiB parçalarla ve backpressure ile doğrudan akar; SHA-256 doğrulanmadan indirme açılmaz.

**Tech Stack:** React 19, Express 5, Neon/PostgreSQL, WebRTC `RTCPeerConnection`/`RTCDataChannel`, Web Crypto, Web Workers, Zod, Vitest, Supertest

## Global Constraints

- İlk sürüm aynı Wi-Fi/yerel ağ ve doğrudan WebRTC içindir; TURN relay kullanılmayacak.
- Dosya içeriği, dosya adı, MIME türü, boyut ve doğrulanmış SHA tanıştırma API'sine gönderilmeyecek.
- Tanıştırma mesajları yalnız HTTPS üzerinden taşınacak ve en geç 3 dakika içinde silinecek.
- Oda kodu 6 karakter, tek kullanımlık olacak; `0/O/1/I` karakterleri kullanılmayacak.
- Kod denemeleri IP ve oda bazında sınırlandırılacak; ikinci alıcı reddedilecek.
- İlk ürün sınırı tek dosya ve en fazla 100 MiB olacak.
- Bağlantı 15 saniyede kurulmazsa aktarım başlamayacak ve VaultDrop önerilecek.
- DataChannel güvenilir ve sıralı olacak; parça boyutu 32 KiB olacak.
- Alıcı onayı gelmeden dosya byte'ı gönderilmeyecek.
- SHA-256 doğrulanmadan Blob URL veya indirme düğmesi oluşturulmayacak.
- İki cihazda aynı doğrulama ifadesi gösterilecek; kullanıcı karşılaştırmadan aktarım başlatamayacak.
- Yeni bağımlılık eklenmeyecek; UTF-8 korunacak.
- Çalışma dizininde Git yoksa `git init` çalıştırılmayacak; commit adımı test raporunda “Git deposu yok” olarak kaydedilecek.

---

### Task 1: Sürümlü Nearby dosya protokolü

**Files:**
- Create: `src/nearby/protocol-v1.js`
- Create: `src/__tests__/nearby-protocol-v1.test.js`

**Interfaces:**
- Produces:

```js
encodeControlMessage(message) => string
parseControlMessage(text) => NearbyControlMessage | null
encodeChunkFrame({ sequence, offset, bytes }) => ArrayBuffer
parseChunkFrame(buffer) => { sequence: number, offset: number, bytes: Uint8Array } | null

NearbyControlMessage =
  | { version: "NDP1", type: "offer-file", transferId, name, mime, size, sha256 }
  | { version: "NDP1", type: "accept-file", transferId }
  | { version: "NDP1", type: "reject-file", transferId, reason }
  | { version: "NDP1", type: "complete", transferId, totalBytes, sha256 }
  | { version: "NDP1", type: "cancel", transferId, reason }
  | { version: "NDP1", type: "error", code }
```

- [ ] **Step 1: Kesin şema, canonical değer ve bozuk parça testlerini yaz**

```js
it("offer-file yalnız tam ve güvenli anahtar kümesini kabul eder", () => {
  const text = encodeControlMessage({
    version: "NDP1", type: "offer-file", transferId: "abcdefghijklmnop",
    name: "rapor.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 1024, sha256: "A".repeat(43),
  });
  expect(parseControlMessage(text)).toMatchObject({ type: "offer-file", name: "rapor.xlsx" });
  expect(parseControlMessage(text.replace(/}$/, ',"extra":true}'))).toBeNull();
});

it("chunk sıra ve offset alanını big-endian taşır", () => {
  const bytes = new Uint8Array([7, 8, 9]);
  expect(parseChunkFrame(encodeChunkFrame({ sequence: 12, offset: 64, bytes }))).toEqual({
    sequence: 12, offset: 64, bytes,
  });
});
```

Testler ad uzunluğu `1..255`, MIME `1..127`, dosya `0..100 MiB`, aktarım kimliği 16 Base64URL karakteri, canonical 43 karakter SHA, tam anahtar sayısı, JSON `<= 2048` ve binary frame `<= 32 KiB + 9` sınırlarını kapsayacak.

- [ ] **Step 2: Testi çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/nearby-protocol-v1.test.js`

Expected: FAIL with module resolution error.

- [ ] **Step 3: Kontrol mesajı şemalarını ekle**

```js
const CONTROL_KEYS = Object.freeze({
  "offer-file": ["version", "type", "transferId", "name", "mime", "size", "sha256"],
  "accept-file": ["version", "type", "transferId"],
  "reject-file": ["version", "type", "transferId", "reason"],
  complete: ["version", "type", "transferId", "totalBytes", "sha256"],
  cancel: ["version", "type", "transferId", "reason"],
  error: ["version", "type", "code"],
});
```

Parser `Object.getPrototypeOf(value) === Object.prototype`, tam anahtar kümesi, tür ve boyut sınırlarını doğrulayacak. Dosya adı daha sonra `sanitizeDownloadName()` ile temizlenecek; protokol katmanı NUL, `/`, `\\` ve kontrol karakterlerini reddedecek.

- [ ] **Step 4: Binary parça formatını ekle**

```js
const CHUNK_TYPE = 1;
const CHUNK_HEADER_BYTES = 9;

export function encodeChunkFrame({ sequence, offset, bytes }) {
  const frame = new Uint8Array(CHUNK_HEADER_BYTES + bytes.length);
  const view = new DataView(frame.buffer);
  view.setUint8(0, CHUNK_TYPE);
  view.setUint32(1, sequence, false);
  view.setUint32(5, offset, false);
  frame.set(bytes, CHUNK_HEADER_BYTES);
  return frame.buffer;
}
```

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test -- src/__tests__/nearby-protocol-v1.test.js src/__tests__/safe-download-name.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/nearby/protocol-v1.js src/__tests__/nearby-protocol-v1.test.js
git commit -m "feat: define nearby transfer protocol"
```

---

### Task 2: Çok sunuculu çalışabilen geçici oda deposu

**Files:**
- Create: `server/db/migrations/007_nearby_signaling.sql`
- Modify: `server/db/migration-files.js`
- Modify: `server/repositories.js`
- Modify: `server/runtime.js`
- Create: `server/__tests__/nearby-repositories.test.js`
- Modify: `server/__tests__/migration-files.test.js`

**Interfaces:**
- Produces repository methods:

```js
createNearbyRoom({ code, hostTokenHash, expiresAt })
joinNearbyRoom({ code, guestTokenHash, now })
findNearbyRoomByCode(code)
appendNearbySignal({ roomId, senderRole, kind, sequence, payload, now })
listNearbySignals({ roomId, receiverRole, afterSequence })
closeNearbyRoom({ roomId, tokenHash, now })
deleteExpiredNearbyRooms(now)
```

- [ ] **Step 1: TTL, tek alıcı, rol ve temizlik repository testlerini yaz**

```js
it("aynı odaya yalnız ilk alıcıyı bağlar", async () => {
  await repositories.createNearbyRoom({ code: "ABC234", hostTokenHash: "h1", expiresAt: future });
  expect(await repositories.joinNearbyRoom({ code: "ABC234", guestTokenHash: "g1", now })).toMatchObject({ status: "joined" });
  expect(await repositories.joinNearbyRoom({ code: "ABC234", guestTokenHash: "g2", now })).toBeNull();
});

it("alıcı yalnız host mesajlarını görür", async () => {
  await repositories.appendNearbySignal({ roomId, senderRole: "host", kind: "offer", sequence: 1, payload, now });
  await repositories.appendNearbySignal({ roomId, senderRole: "guest", kind: "answer", sequence: 2, payload, now });
  expect(await repositories.listNearbySignals({ roomId, receiverRole: "guest", afterSequence: 0 }))
    .toEqual([expect.objectContaining({ senderRole: "host", sequence: 1 })]);
});
```

- [ ] **Step 2: Testi çalıştır ve repository yöntemleri olmadığı için kırıldığını doğrula**

Run: `npm test -- server/__tests__/nearby-repositories.test.js server/__tests__/migration-files.test.js`

Expected: FAIL with missing repository methods/migration.

- [ ] **Step 3: Migrationı ekle**

```sql
CREATE TABLE nearby_rooms (
  id uuid PRIMARY KEY,
  code varchar(6) NOT NULL UNIQUE,
  host_token_hash char(64) NOT NULL,
  guest_token_hash char(64),
  status varchar(12) NOT NULL CHECK (status IN ('waiting', 'joined', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz
);

CREATE TABLE nearby_signals (
  room_id uuid NOT NULL REFERENCES nearby_rooms(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  sender_role varchar(5) NOT NULL CHECK (sender_role IN ('host', 'guest')),
  kind varchar(8) NOT NULL CHECK (kind IN ('offer', 'answer', 'ice', 'ready', 'close')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, sender_role, sequence)
);
```

`nearby_rooms(expires_at)` ve `nearby_signals(room_id, sequence)` indeksleri eklenecek. Migration dosyası kayıt listesine tam sıra ile alınacak.

- [ ] **Step 4: PostgreSQL ve bellek repositorylerini aynı sözleşmeyle uygula**

Join sorgusu `UPDATE ... WHERE status='waiting' AND expires_at > now RETURNING ...` kullanacak; böylece iki alıcının yarışı atomik olarak yalnız birini kabul edecek. Signal payload JSON boyutu servis katmanında denetlenecek; repository dosya içeriği kabul eden genel bir blob alanı sunmayacak.

- [ ] **Step 5: Repository testlerini çalıştır**

Run: `npm test -- server/__tests__/nearby-repositories.test.js server/__tests__/repositories.postgres.test.js server/__tests__/migration-files.test.js server/__tests__/runtime.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add server/db/migrations/007_nearby_signaling.sql server/db/migration-files.js server/repositories.js server/runtime.js server/__tests__
git commit -m "feat: add ephemeral nearby room storage"
```

---

### Task 3: Güvenli tanıştırma API'si

**Files:**
- Create: `server/nearby-service.js`
- Create: `server/nearby-validation.js`
- Modify: `server/app.js`
- Create: `server/__tests__/nearby-api.test.js`
- Modify: `server/__tests__/security-headers.test.js`

**Interfaces:**
- Produces endpoints:

```text
POST   /api/nearby/rooms
POST   /api/nearby/rooms/:code/join
POST   /api/nearby/rooms/:code/signals
GET    /api/nearby/rooms/:code/signals?after=0
DELETE /api/nearby/rooms/:code
```

- Auth: `X-Nearby-Token` raw token; server stores only SHA-256 hex hash.

- [ ] **Step 1: API güvenlik ve yaşam döngüsü testlerini yaz**

```js
it("oda üretir, ilk alıcıyı kabul eder ve ikinciyi reddeder", async () => {
  const created = await request(app).post("/api/nearby/rooms").set(validOriginHeaders).send({}).expect(201);
  await request(app).post(`/api/nearby/rooms/${created.body.code}/join`).set(validOriginHeaders).send({}).expect(200);
  await request(app).post(`/api/nearby/rooms/${created.body.code}/join`).set(validOriginHeaders).send({}).expect(409);
});

it("signal endpointi dosya metadata'sı ve binary içerik kabul etmez", async () => {
  await request(app).post(`/api/nearby/rooms/${code}/signals`)
    .set({ ...validOriginHeaders, "X-Nearby-Token": hostToken })
    .send({ kind: "offer", sequence: 1, payload: { sdp: "ok" }, fileName: "secret.pdf" })
    .expect(400);
});
```

Testler 3 dakika TTL, yanlış token 401, süresi dolmuş oda 410, kod biçimi 400, aynı sequence 409, rolüne ait olmayan mesajın görünmemesi, payload `>16 KiB` reddi, join rate limit 429 ve response'larda `Cache-Control: no-store` kapsayacak.

- [ ] **Step 2: Testleri çalıştır ve route bulunamadığı için kırıldığını doğrula**

Run: `npm test -- server/__tests__/nearby-api.test.js`

Expected: FAIL with 404 responses.

- [ ] **Step 3: Kod/token üretimi ve servis katmanını ekle**

```js
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 3 * 60 * 1000;

export function createNearbyRoomService({ repositories, randomBytes = crypto.randomBytes, now = () => new Date() }) {
  return { createRoom, joinRoom, publishSignal, readSignals, closeRoom };
}
```

Kod üretimi kriptografik rastgele 6 karakter olacak ve unique çakışmada en fazla 5 kez yeniden denenecek. Host/guest token 32 rastgele bayt Base64URL olacak; yalnız `sha256(token)` repositoryye gidecek. Token karşılaştırması sabit süreli yapılacak.

- [ ] **Step 4: Zod şemalarını ve route'ları ekle**

Signal şeması tam olarak `{ kind, sequence, payload }` kabul edecek. `offer/answer` payload'ı `{ type, sdp }`, `ice` payload'ı `{ candidate, sdpMid, sdpMLineIndex }`, `ready/close` payload'ı `{}` olacak. SDP 12 KiB, ICE candidate 2 KiB ile sınırlanacak.

Join route'una `windowMs: 60_000, limit: 10`; diğer nearby mutasyonlarına `limit: 60` özel limiter uygulanacak. Bütün nearby cevaplarına `Cache-Control: no-store` eklenecek.

- [ ] **Step 5: API ve mevcut güvenlik testlerini çalıştır**

Run: `npm test -- server/__tests__/nearby-api.test.js server/__tests__/security-headers.test.js server/__tests__/auth-api.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add server/nearby-service.js server/nearby-validation.js server/app.js server/__tests__/nearby-api.test.js server/__tests__/security-headers.test.js
git commit -m "feat: add secure nearby signaling api"
```

---

### Task 4: Tarayıcı tanıştırma istemcisi

**Files:**
- Create: `src/nearby/signaling-client.js`
- Create: `src/__tests__/nearby-signaling-client.test.js`

**Interfaces:**
- Consumes: `apiRequest(path, options)` and Task 3 endpoints
- Produces:

```js
createNearbySignalingClient({ apiRequest, pollIntervalMs = 500 }) => {
  createRoom(): Promise<{ code, token, expiresAt }>,
  joinRoom(code): Promise<{ code, token, expiresAt }>,
  publish({ code, token, kind, sequence, payload }): Promise<void>,
  poll({ code, token, after, signal, onSignal }): Promise<void>,
  close({ code, token }): Promise<void>
}
```

- [ ] **Step 1: Polling, iptal ve hata eşleme testlerini yaz**

```js
it("poll yalnız yeni sequence değerlerini bir kez yayınlar", async () => {
  fetchMock.mockResolvedValueOnce(json({ signals: [{ sequence: 2, kind: "offer", payload: {} }] }));
  const seen = [];
  await client.pollOnce({ code: "ABC234", token: "secret", after: 1, onSignal: (item) => seen.push(item) });
  expect(seen.map((item) => item.sequence)).toEqual([2]);
});

it("AbortSignal sonrası yeni ağ isteği başlatmaz", async () => {
  controller.abort();
  await expect(client.poll({ code, token, signal: controller.signal, onSignal })).rejects.toMatchObject({ code: "ABORTED" });
  expect(fetchMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Testi çalıştır ve modül bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/nearby-signaling-client.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Tokenı URL'ye koymayan istemciyi ekle**

```js
const headers = { "X-Nearby-Token": token };
return apiRequest(`/api/nearby/rooms/${encodeURIComponent(code)}/signals?after=${after}`, {
  method: "GET",
  headers,
  signal,
});
```

Ham token, SDP ve ICE console/log mesajlarına yazılmayacak. Poll 500 ms aralıkla çalışacak; hata durumunda 500, 1000, 2000 ms sınırlı geri çekilme yapacak, 3 saniyeyi aşmayacak ve oda sona erdiğinde duracak.

- [ ] **Step 4: Testleri çalıştır**

Run: `npm test -- src/__tests__/nearby-signaling-client.test.js src/__tests__/activity-client.test.js`

Expected: PASS.

- [ ] **Step 5: Kontrol noktası oluştur**

```bash
git add src/nearby/signaling-client.js src/__tests__/nearby-signaling-client.test.js
git commit -m "feat: add nearby signaling client"
```

---

### Task 5: WebRTC oturumu ve iki uçlu doğrulama ifadesi

**Files:**
- Create: `src/nearby/verification-phrase.js`
- Create: `src/nearby/peer-session.js`
- Create: `src/__tests__/nearby-verification-phrase.test.js`
- Create: `src/__tests__/nearby-peer-session.test.js`

**Interfaces:**
- Consumes: Task 4 signaling client
- Produces:

```js
deriveVerificationPhrase({ localSdp, remoteSdp, roomCode }) => Promise<string>

createNearbyPeerSession({ role, code, token, signaling, peerFactory = defaultPeerFactory }) => {
  connect({ signal, timeoutMs: 15_000 }): Promise<RTCDataChannel>,
  getVerificationPhrase(): Promise<string>,
  subscribe(listener): () => void,
  close(): Promise<void>
}
```

- [ ] **Step 1: Fingerprint sırası, bağlantı ve timeout testlerini yaz**

```js
expect(await deriveVerificationPhrase({ localSdp: SDP_A, remoteSdp: SDP_B, roomCode: "ABC234" }))
  .toBe(await deriveVerificationPhrase({ localSdp: SDP_B, remoteSdp: SDP_A, roomCode: "ABC234" }));

await expect(session.connect({ signal, timeoutMs: 15_000 }))
  .rejects.toMatchObject({ code: "DIRECT_CONNECTION_TIMEOUT" });
expect(peer.close).toHaveBeenCalledTimes(1);
```

Testler host'un ordered data channel oluşturmasını, guest'in `ondatachannel` beklemesini, ICE mesaj değişimini, abort, disconnected/failed cleanup ve enjekte peer sahipliğini kapsayacak.

- [ ] **Step 2: Testleri çalıştır ve modüller bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/nearby-verification-phrase.test.js src/__tests__/nearby-peer-session.test.js`

Expected: FAIL with missing modules.

- [ ] **Step 3: Doğrulama ifadesini SDP fingerprintlerinden üret**

```js
const fingerprints = [extractFingerprint(localSdp), extractFingerprint(remoteSdp)].sort();
const digest = await sha256Bytes(new TextEncoder().encode(`${roomCode}|${fingerprints.join("|")}`));
return `${ADJECTIVES[digest[0] % 16]} ${NOUNS[digest[1] % 16]} · ${ADJECTIVES[digest[2] % 16]} ${NOUNS[digest[3] % 16]}`;
```

Kelime listeleri Türkçe, birbirinden kolay ayırt edilir 16 sıfat ve 16 isim olacak. SDP'de tam bir SHA-256 fingerprint yoksa oturum `INVALID_DTLS_FINGERPRINT` hatasıyla kapanacak.

- [ ] **Step 4: Peer yaşam döngüsünü ekle**

Host `createDataChannel("vaultdrop-nearby-v1", { ordered: true })` kullanacak. `iceServers: []` ile yalnız host/srflx adayları kullanılacak; TURN tanımlanmayacak. Offer/answer/ICE publish ve poll aynı AbortSignal altında olacak. Kanal `open` olmadan dosya protokolü başlamayacak.

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test -- src/__tests__/nearby-verification-phrase.test.js src/__tests__/nearby-peer-session.test.js`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/nearby/verification-phrase.js src/nearby/peer-session.js src/__tests__/nearby-verification-phrase.test.js src/__tests__/nearby-peer-session.test.js
git commit -m "feat: establish verified nearby peer session"
```

---

### Task 6: Backpressure kullanan gönderici ve doğrulayan alıcı

**Files:**
- Create: `src/nearby/hash-client.js`
- Create: `src/workers/nearby-hash.worker.js`
- Create: `src/nearby/send-controller.js`
- Create: `src/nearby/receive-controller.js`
- Create: `src/__tests__/nearby-transfer-controllers.test.js`
- Create: `src/__tests__/nearby-hash-worker.test.js`

**Interfaces:**
- Consumes: Task 1 protocol, open RTCDataChannel
- Produces:

```js
createNearbySendController({ channel, hashFile, chunkBytes = 32 * 1024 })
  .send(file, { signal, onProgress }) => Promise<{ bytesSent, sha256 }>

createNearbyReceiveController({ channel, maxBytes = 100 * MIB }) => {
  subscribe(listener): () => void,
  accept(): void,
  reject(reason): void,
  result(): Promise<{ file: File, sha256: string }>,
  close(): void
}
```

- [ ] **Step 1: Onay, sıra, backpressure, SHA ve iptal testlerini yaz**

```js
it("alıcı kabul etmeden ilk dosya parçasını göndermez", async () => {
  const pending = sender.send(file, { signal });
  await flushPromises();
  expect(channel.sent.filter((value) => value instanceof ArrayBuffer)).toHaveLength(0);
  channel.receive(encodeControlMessage({ version: "NDP1", type: "accept-file", transferId }));
  await pending;
});

it("yüksek bufferedAmount değerinde düşük su olayını bekler", async () => {
  channel.bufferedAmount = 2 * 1024 * 1024;
  const pending = sender.send(file, { signal });
  expect(channel.binarySendCount).toBe(0);
  channel.emitBufferedAmountLow();
  await pending;
  expect(channel.binarySendCount).toBeGreaterThan(0);
});
```

Alıcı testleri yanlış sequence/offset, 100 MiB + 1 bayt, erken complete, boyut uyuşmazlığı, SHA uyuşmazlığı, tekrar parça, disconnect ve URL oluşmamasını kapsayacak.

- [ ] **Step 2: Testleri çalıştır ve controllerlar bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/nearby-transfer-controllers.test.js src/__tests__/nearby-hash-worker.test.js`

Expected: FAIL with missing modules.

- [ ] **Step 3: Hash workerını ekle**

Worker `File.arrayBuffer()` ve Web Crypto SHA-256 kullanacak; progress aşamaları `reading`, `hashing`, `complete` olacak. Ana thread aynı anda ikinci hash işi başlatırsa eski işi nesil kimliğiyle iptal edilmiş sayacak; worker mesajında dosya adı veya byte içeriği bulunmayacak.

- [ ] **Step 4: Gönderici backpressure akışını ekle**

```js
channel.bufferedAmountLowThreshold = 256 * 1024;
const HIGH_WATER_BYTES = 1024 * 1024;

async function waitForWritable(signal) {
  if (channel.bufferedAmount <= HIGH_WATER_BYTES) return;
  await once(channel, "bufferedamountlow", signal);
}
```

Gönderici önce SHA hesaplayacak, `offer-file` yollayacak, `accept-file` bekleyecek, sonra `file.slice(offset, offset + 32 KiB).arrayBuffer()` ile tek parçayı okuyup yollayacak. Bütün dosyayı ikinci bir ArrayBuffer'a kopyalamayacak.

- [ ] **Step 5: Alıcı doğrulama akışını ekle**

Alıcı offer metadata'sını state olarak yayınlayacak; `accept()` çağrısına kadar binary frame gelirse oturumu kapatacak. Parçalar sıralı bir dizide tutulacak, beklenen offset her framede artırılacak. `complete` sonrası `new Blob(chunks).arrayBuffer()` hash workerına gönderilecek; hash ve byte toplamı eşleşirse güvenli adla `File` üretilecek. Hata veya iptalde chunk dizisi boşaltılacak.

- [ ] **Step 6: Controller testlerini çalıştır**

Run: `npm test -- src/__tests__/nearby-transfer-controllers.test.js src/__tests__/nearby-hash-worker.test.js src/__tests__/nearby-protocol-v1.test.js`

Expected: PASS.

- [ ] **Step 7: Kontrol noktası oluştur**

```bash
git add src/nearby/hash-client.js src/workers/nearby-hash.worker.js src/nearby/send-controller.js src/nearby/receive-controller.js src/__tests__/nearby-transfer-controllers.test.js src/__tests__/nearby-hash-worker.test.js
git commit -m "feat: transfer nearby files with backpressure"
```

---

### Task 7: Gönderme ve alma kullanıcı arayüzü

**Files:**
- Create: `src/NearbyTransferPanel.jsx`
- Modify: `src/App.css`
- Create: `src/__tests__/nearby-transfer-ui.test.jsx`

**Interfaces:**
- Consumes: Tasks 4–6 signaling, peer and controllers
- Produces: `<NearbyTransferPanel mode="send"|"receive" user={user} />`

- [ ] **Step 1: Kullanıcı durumları ve responsive testlerini yaz**

```jsx
render(<NearbyTransferPanel mode="send" signaling={fakeSignaling} peerFactory={fakePeerFactory} />);
await user.upload(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), file);
expect(await screen.findByText(/6 karakterli kod/i)).toBeInTheDocument();
expect(screen.getByText(/aynı doğrulama ifadesi/i)).toBeInTheDocument();

render(<NearbyTransferPanel mode="receive" signaling={fakeSignaling} />);
await user.type(screen.getByLabelText("Yakındaki cihaz kodu"), "ABC234");
await user.click(screen.getByRole("button", { name: "Cihaza bağlan" }));
expect(await screen.findByRole("button", { name: "Dosyayı kabul et" })).toBeEnabled();
```

Testler yanlış/süresi dolmuş kod, 15 saniye timeout, VaultDrop önerisi, alıcı reddi, disconnect, progress, SHA doğrulama, yeni aktarım, unmount cleanup ve 360 px genişlikte butonların taşmamasını kapsayacak.

- [ ] **Step 2: Testi çalıştır ve panel bulunamadığı için kırıldığını doğrula**

Run: `npm test -- src/__tests__/nearby-transfer-ui.test.jsx`

Expected: FAIL with missing component.

- [ ] **Step 3: Sonlu kullanıcı durum makinesini ekle**

```js
const STATES = Object.freeze([
  "idle", "creating-room", "waiting-code", "connecting", "verify",
  "awaiting-approval", "transferring", "verifying", "complete", "failed",
]);
```

Gönderici: dosya seç → kod oluştur → cihaz bekle → doğrulama ifadesini karşılaştır → alıcı onayı → gönder. Alıcı: kod gir → bağlan → ifadeyi karşılaştır → dosya bilgisini gör → kabul/reddet → doğrula → indir.

- [ ] **Step 4: Güvenli görünür metinleri ekle**

Ekranda “Dosya doğrudan iki tarayıcı arasında gider”, “Kod 3 dakika geçerlidir”, “İki ekrandaki ifadeyi karşılaştır”, “15 saniyede bağlantı kurulamazsa VaultDrop kullan” metinleri bulunacak. Uygulama “aynı Wi-Fi her ağda kesin bağlanır” iddiası yapmayacak.

- [ ] **Step 5: UI testlerini çalıştır**

Run: `npm test -- src/__tests__/nearby-transfer-ui.test.jsx src/__tests__/transfer-page-shell.test.jsx`

Expected: PASS.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/NearbyTransferPanel.jsx src/App.css src/__tests__/nearby-transfer-ui.test.jsx
git commit -m "feat: add nearby transfer user flow"
```

---

### Task 8: Ağ izolasyonu, yük ve yayın kapısı

**Files:**
- Create: `src/__tests__/nearby-network-isolation.test.jsx`
- Create: `server/__tests__/nearby-abuse.test.js`
- Create: `docs/nearby-devices-manual-test.md`
- Create: `SECURITY.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: tamamlanmış Nearby akışı
- Produces: güvenlik ve gerçek cihaz kabul kayıtları

- [ ] **Step 1: Dosya içeriğinin HTTP'ye çıkmadığını kanıtlayan testi yaz**

```js
expect(serializedRequests).not.toContain(fileMarker);
expect(serializedRequests).not.toContain("rapor-gizli.xlsx");
expect(serializedRequests).not.toContain(expectedSha256);
expect(dataChannel.sentBytes).toContain(fileMarker);
```

Test fetch gövdelerinde string, Blob, ArrayBuffer, typed array ve FormData içeriklerini güvenli biçimde serileştirip dosya markerını arayacak.

- [ ] **Step 2: Kaba kuvvet, TTL ve payload yük testlerini yaz**

100 yanlış join denemesinde limiter 429 dönecek; süresi geçmiş odalar okunmayacak; 16 KiB üzeri SDP/ICE reddedilecek; temizlik 1000 süresi dolmuş odayı dosya verisine dokunmadan silecek.

- [ ] **Step 3: Testleri çalıştır**

Run: `npm test -- src/__tests__/nearby-network-isolation.test.jsx server/__tests__/nearby-abuse.test.js server/__tests__/nearby-api.test.js`

Expected: PASS.

- [ ] **Step 4: Manuel cihaz ve ağ formunu ekle**

Form Windows Chrome↔Windows Edge, Windows Chrome↔macOS Safari ve macOS Chrome↔macOS Safari için 1 MiB, 25 MiB, 100 MiB satırları taşıyacak. Her satır kurulum süresi, aktarım süresi, ortalama hız, SHA, bellek, doğrulama ifadesi ve sonuç kaydedecek. Ayrı negatif satırlar istemci izolasyonlu Wi-Fi, kurumsal güvenlik duvarı ve 15 saniye VaultDrop yönlendirmesini doğrulayacak.

- [ ] **Step 5: Tam doğrulamayı çalıştır**

Run: `npm test`

Expected: all existing and new tests PASS, with only explicitly documented skips.

Run: `npm run lint`

Expected: exit 0; new warnings/errors 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 6: Kontrol noktası oluştur**

```bash
git add src/__tests__/nearby-network-isolation.test.jsx server/__tests__/nearby-abuse.test.js docs/nearby-devices-manual-test.md SECURITY.md README.md
git commit -m "test: gate nearby devices release"
```
