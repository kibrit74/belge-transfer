# Yakındaki Cihazlar Davet Bağlantısı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aynı ağdaki iki tarayıcıyı kısa kodu sözlü aktarmadan, tek kullanımlık beş dakikalık davet bağlantısı ve açık `Bağlan` onayıyla eşleştirmek.

**Architecture:** Davet URL'si yalnız oda kodunu taşıyan bağımsız bir yardımcı modülde üretilecek ve okunacak. `TransferPage` geçerli URL kodunu alım yöntemine aktaracak fakat katılımı başlatmayacak; `NearbyTransferPanel` kullanıcı onayıyla mevcut sinyalleşme/WebRTC motorunu çalıştıracak. Sunucu mevcut atomik ilk-katılımcı davranışını koruyacak, oda ömrünü beş dakikaya çıkaracak ve dosya verisi kabul etmeyen API sınırını değiştirmeyecek.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, Express 5, Zod, WebRTC DataChannel, Web Clipboard API, Web Share API.

## Global Constraints

- Davet bağlantısı yalnız aynı kaynak `/transfer?nearby=ABC234` biçiminde oda kodu taşır.
- Host/guest oda anahtarı, dosya adı, MIME, boyut, SHA-256, SDP, ICE ve dosya baytı URL'ye yazılmaz.
- URL açılışı `joinRoom` çağırmaz; yalnız kullanıcı `Bağlan` dediğinde katılım başlar.
- Davet tek kullanımlık ve tam `5 * 60 * 1000` milisaniye geçerlidir.
- İlk geçerli alıcıdan sonra ikinci alıcı reddedilir ve ilk bağlantı etkilenmez.
- Dosya yalnız mevcut WebRTC DTLS veri kanalından geçer; HTTP API dosya alanı kabul etmez.
- Host davet süresince bekleyebilir; guest doğrudan bağlantı denemesi 15 saniyede VaultDrop yedeğine düşer.
- Mevcut READY/ACK, doğrulama ifadesi, alıcı onayı ve SHA-256 kapıları korunur.
- Üyelik oda oluşturma ve katılım için zorunlu değildir.
- Özellik mevcut `VITE_ENABLE_NEARBY` kapısının arkasında kalır.
- QR Video ve renkli QR aktif ürün akışına geri getirilmez.
- Yeni bağımlılık eklenmez; bütün metin ve dosyalar UTF-8 olur.
- Çalışma alanında Git deposu bulunmadığı için commit adımları yerine taze test kontrol noktaları kullanılır.

---

### Task 1: Güvenli Davet URL'si Sözleşmesi

**Files:**
- Create: `src/nearby/invite-link.js`
- Create: `src/__tests__/nearby-invite-link.test.js`

**Interfaces:**
- Produces: `normalizeNearbyRoomCode(value): string | null`
- Produces: `createNearbyInviteUrl({ origin, code }): string`
- Produces: `readNearbyInviteCode(search): string | null`
- Produces: `NEARBY_ROOM_CODE_PATTERN: RegExp`
- Consumes: Tarayıcıdaki `window.location.origin` ve `window.location.search`; dosya veya oda tokenı kabul etmez.

- [ ] **Step 1: Davet URL'si için başarısız sözleşme testlerini yaz**

```js
import { describe, expect, it } from 'vitest';
import {
  createNearbyInviteUrl,
  normalizeNearbyRoomCode,
  readNearbyInviteCode,
} from '../nearby/invite-link.js';

describe('Yakındaki Cihazlar davet bağlantısı', () => {
  it('kodu normalize edip aynı kaynak transfer bağlantısını üretir', () => {
    expect(createNearbyInviteUrl({
      origin: 'https://vaultdrop.test',
      code: 'abc234',
    })).toBe('https://vaultdrop.test/transfer?nearby=ABC234');
    expect(readNearbyInviteCode('?nearby=abc234')).toBe('ABC234');
  });

  it.each(['', 'ABC23', 'ABC2345', 'O0I1XX', 'ABC 23', null])(
    'geçersiz kodu reddeder: %s',
    (value) => expect(normalizeNearbyRoomCode(value)).toBeNull(),
  );

  it('URL içinde dosya veya oda anahtarı taşımaya izin vermez', () => {
    const url = createNearbyInviteUrl({ origin: 'https://vaultdrop.test', code: 'ABC234' });
    expect(url).not.toMatch(/token|secret|file|sha|mime/i);
    expect(new URL(url).searchParams.size).toBe(1);
  });
});
```

- [ ] **Step 2: Testi çalıştır ve modül eksikliği nedeniyle RED olduğunu doğrula**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-invite-link.test.js --pool=threads --maxWorkers=1
```

Expected: `../nearby/invite-link.js` çözümlenemediği için FAIL.

- [ ] **Step 3: En küçük güvenli URL modülünü uygula**

```js
export const NEARBY_ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function normalizeNearbyRoomCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return NEARBY_ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function createNearbyInviteUrl({ origin, code } = {}) {
  const normalizedCode = normalizeNearbyRoomCode(code);
  if (!normalizedCode) throw new RangeError('Yakındaki Cihazlar davet kodu geçersiz.');
  const parsedOrigin = new URL(origin);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new RangeError('Yakındaki Cihazlar davet kaynağı geçersiz.');
  }
  const invite = new URL('/transfer', parsedOrigin.origin);
  invite.searchParams.set('nearby', normalizedCode);
  return invite.href;
}

export function readNearbyInviteCode(search) {
  if (typeof search !== 'string') return null;
  return normalizeNearbyRoomCode(new URLSearchParams(search).get('nearby'));
}
```

- [ ] **Step 4: Dar testi çalıştır ve GREEN olduğunu doğrula**

Run aynı Task 1 komutu.  
Expected: tüm davet URL testleri PASS.

- [ ] **Step 5: Güvenlik sınırını mevcut URL/route testleriyle birlikte doğrula**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-invite-link.test.js src/__tests__/three-method-security-contract.test.jsx --pool=threads --maxWorkers=1
```

Expected: İki dosya da PASS; URL yalnız oda kodu taşır.

---

### Task 2: Beş Dakikalık ve Tek Kullanımlık Sunucu Odası

**Files:**
- Modify: `server/nearby-service.js`
- Modify: `server/app.js`
- Create: `server/__tests__/nearby-service.test.js`
- Modify: `server/__tests__/nearby-api.test.js`
- Modify: `server/__tests__/nearby-abuse.test.js`

**Interfaces:**
- Produces: `NEARBY_ROOM_TTL_MS = 5 * 60 * 1000`
- Preserves: `createNearbyRoomService({ repositories, randomBytes, now })`
- Preserves: `POST /api/nearby/rooms`, `POST /api/nearby/rooms/:code/join`
- Preserves: atomik `waiting → joined` geçişi ve ikinci alıcı için `ROOM_ALREADY_JOINED`.
- Produces: Süresi dolmuş oda için `ROOM_EXPIRED`, gönderenin kapattığı oda için `ROOM_CANCELLED`.

- [ ] **Step 1: Tam beş dakika ve tek kullanımlılık testlerini yaz**

```js
import { describe, expect, it, vi } from 'vitest';
import {
  NEARBY_ROOM_TTL_MS,
  createNearbyRoomService,
} from '../nearby-service.js';

describe('Yakındaki Cihazlar davet ömrü', () => {
  it('odayı tam beş dakika geçerli üretir', async () => {
    const now = new Date('2026-08-14T12:00:00.000Z');
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
    expect(new Date(room.expiresAt).getTime() - now.getTime()).toBe(NEARBY_ROOM_TTL_MS);
  });
});
```

`server/__tests__/nearby-api.test.js` içindeki ilk katılımcı testine, iki eşzamanlı `join` isteğinden sonuçların tam olarak `[200, 409]` olmasını ekle:

```js
const attempts = await Promise.all([
  request(app).post(`/api/nearby/rooms/${created.code}/join`).set(ORIGIN_HEADERS).send({}),
  request(app).post(`/api/nearby/rooms/${created.code}/join`).set(ORIGIN_HEADERS).send({}),
]);
expect(attempts.map((response) => response.status).sort()).toEqual([200, 409]);
```

Aynı API dosyasında üyelik başlığı olmadan create/join işlemlerinin başarılı olduğunu ve host kapattıktan sonra join isteğinin `410 / ROOM_CANCELLED` döndürdüğünü doğrula.

- [ ] **Step 2: Sunucu testlerini çalıştır ve üç dakikalık sabit nedeniyle RED al**

Run:

```powershell
cmd /c npx vitest run server/__tests__/nearby-service.test.js server/__tests__/nearby-api.test.js --pool=threads --maxWorkers=1
```

Expected: TTL testi `180000 !== 300000` nedeniyle FAIL.

- [ ] **Step 3: Oda ömrünü beş dakikaya çıkar ve oda oluşturma sınırını ayır**

`server/nearby-service.js`:

```js
export const NEARBY_ROOM_TTL_MS = 5 * 60 * 1000;

if (room.status === 'closed') {
  throw new NearbyServiceError('ROOM_CANCELLED', 410, 'Gönderici bu daveti iptal etmiş.');
}
if (new Date(room.expires_at) <= currentTime) {
  throw new NearbyServiceError('ROOM_EXPIRED', 410, 'Odanın süresi dolmuş.');
}
```

`server/app.js` içinde join ve signal limitlerinden bağımsız oda oluşturma limiti tanımla:

```js
const nearbyCreateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
```

Oda oluşturma rotasını bu limiter ile değiştir:

```js
app.post('/api/nearby/rooms', nearbyCreateLimiter, async (request, response, next) => {
  // Mevcut body doğrulaması ve createRoom çağrısı aynen korunur.
});
```

- [ ] **Step 4: Aşırı oda oluşturmanın 429 verdiğini test et**

`server/__tests__/nearby-abuse.test.js`:

```js
it('aynı istemcinin aşırı oda oluşturmasını sınırlar', async () => {
  const { app } = setup();
  const statuses = [];
  for (let index = 0; index < 12; index += 1) {
    const response = await request(app).post('/api/nearby/rooms').set(HEADERS).send({});
    statuses.push(response.status);
  }
  expect(statuses.filter((status) => status === 201)).toHaveLength(10);
  expect(statuses.at(-1)).toBe(429);
});
```

- [ ] **Step 5: Sunucu görev paketini GREEN doğrula**

Run:

```powershell
cmd /c npx vitest run server/__tests__/nearby-service.test.js server/__tests__/nearby-api.test.js server/__tests__/nearby-abuse.test.js server/__tests__/nearby-repositories.test.js server/__tests__/nearby-cleanup.test.js --pool=threads --maxWorkers=1
```

Expected: TTL, atomik katılım, istek sınırı ve temizlik testleri PASS.

---

### Task 3: Davet URL'sinden Alım Ekranına Güvenli Yönlendirme

**Files:**
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/NearbyTransferPanel.jsx`
- Create: `src/__tests__/nearby-invite-routing.test.jsx`
- Modify: `src/__tests__/three-method-routing.test.jsx`

**Interfaces:**
- Consumes: `readNearbyInviteCode(window.location.search)` from Task 1.
- Produces: `NearbyTransferPanel({ initialCode })` prop.
- Guarantees: Geçerli link yalnız `mode='receive'`, `receiveMethod='nearby'`, `initialCode='ABC234'` seçer.
- Guarantees: URL açılışında `signaling.joinRoom` çağrılmaz.

- [ ] **Step 1: Gerçek sayfa yönlendirmesi için RED testi yaz**

Mock `NearbyTransferPanel` yalnız aldığı prop'u göstersin; gerçek `TransferPage` yöntem seçimini kullansın:

```jsx
const nearbyPanelProps = vi.hoisted(() => ({ current: null }));

vi.mock('../NearbyTransferPanel.jsx', () => ({
  default: (props) => {
    nearbyPanelProps.current = props;
    return <p>Yakındaki alım · {props.initialCode || 'kod yok'}</p>;
  },
}));

it('davet URL açılışında Al ve Yakındaki Cihazlar seçer ama otomatik katılmaz', async () => {
  window.history.replaceState({}, '', '/transfer?nearby=abc234');
  render(<TransferPage />);

  expect(await screen.findByText('Yakındaki alım · ABC234')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Al' })).toHaveClass('active');
  expect(nearbyPanelProps.current).toMatchObject({ mode: 'receive', initialCode: 'ABC234' });
});

it('geçersiz davet kodunda varsayılan VaultDrop ekranını korur', async () => {
  window.history.replaceState({}, '', '/transfer?nearby=O0I1XX');
  render(<TransferPage />);
  expect(await screen.findByText('VaultDrop paket paneli')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Yakındaki Cihazlar davet bağlantısı geçersiz. Yeni bir davet iste.',
  );
});
```

- [ ] **Step 2: Testi çalıştır ve sayfanın hâlâ gönderim/VaultDrop ile açıldığını doğrula**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-invite-routing.test.jsx --pool=threads --maxWorkers=1
```

Expected: geçerli davetin `receive/nearby` seçmemesi nedeniyle FAIL.

- [ ] **Step 3: TransferPage başlangıç yönlendirmesini uygula**

`src/pages/TransferPage.jsx` içinde yöntem kaydını state'lerden önce hesapla ve başlangıç davetini bir kez oku:

```jsx
const methods = useMemo(() => getEffectiveMethodRegistry(getFeatureFlags()), []);
const initialInviteCode = useMemo(
  () => readNearbyInviteCode(window.location.search),
  [],
);
const hasNearbyInviteParameter = useMemo(
  () => new URLSearchParams(window.location.search).has('nearby'),
  [],
);
const invalidNearbyInvite = hasNearbyInviteParameter && !initialInviteCode;
const nearbyEnabled = methods.some((method) => method.id === 'nearby' && method.enabled);
const startsFromNearbyInvite = Boolean(initialInviteCode && nearbyEnabled);
const [mode, setMode] = useState(startsFromNearbyInvite ? 'receive' : 'send');
const [sendMethod, setSendMethod] = useState('package');
const [receiveMethod, setReceiveMethod] = useState(startsFromNearbyInvite ? 'nearby' : 'package');
```

Sayfanın yöntem panellerinden önce güvenli uyarıyı göster; hiçbir katılım işlemi başlatma:

```jsx
{invalidNearbyInvite && (
  <p className="transfer-inline-error" role="alert">
    Yakındaki Cihazlar davet bağlantısı geçersiz. Yeni bir davet iste.
  </p>
)}
```

Alıcı paneline kodu aktar:

```jsx
{receiveMethod === 'nearby' && (
  <NearbyTransferPanel
    key="nearby-receive"
    mode="receive"
    user={user}
    initialCode={initialInviteCode}
  />
)}
```

- [ ] **Step 4: NearbyTransferPanel kod başlangıcını yalnız state başlangıcında uygula**

```jsx
export default function NearbyTransferPanel({
  mode = 'send',
  initialCode = '',
  // mevcut bağımlılıklar
} = {}) {
  const [code, setCode] = useState(() => normalizeNearbyRoomCode(initialCode) ?? '');
  const openedFromInvite = mode === 'receive' && Boolean(normalizeNearbyRoomCode(initialCode));
  // ...
}
```

Form üstünde yalnız davetten gelindiğinde şu açıklamayı göster:

```jsx
{openedFromInvite && (
  <p className="nearby-invite-notice">Yakındaki bir cihaz sana bağlantı daveti gönderdi.</p>
)}
```

- [ ] **Step 5: Otomatik katılım olmadığını gerçek panel testiyle doğrula**

```jsx
it('initialCode alanını doldurur fakat Bağlan tıklanmadan joinRoom çağırmaz', () => {
  const signaling = { joinRoom: vi.fn() };
  render(<NearbyTransferPanel mode="receive" initialCode="ABC234" signaling={signaling} />);
  expect(screen.getByLabelText('Yakındaki cihaz kodu')).toHaveValue('ABC234');
  expect(signaling.joinRoom).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Bağlan' })).toBeEnabled();
});
```

- [ ] **Step 6: Yönlendirme paketini GREEN doğrula**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-invite-routing.test.jsx src/__tests__/nearby-transfer-ui.test.jsx src/__tests__/three-method-routing.test.jsx --pool=threads --maxWorkers=1
```

Expected: geçerli/geçersiz link, açık onay ve yöntem cleanup testleri PASS.

---

### Task 4: Davet Kartı, Kopyalama, Paylaşma ve Geri Sayım

**Files:**
- Create: `src/nearby/NearbyInviteCard.jsx`
- Create: `src/__tests__/nearby-invite-card.test.jsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `room: { code: string, expiresAt: string }`
- Consumes: `onCancel(): void`, `onExpire(): void`
- Optional test dependencies: `origin`, `clipboard`, `share`, `now`
- Produces: Kopyala, destekleniyorsa Paylaş, kısa kod, sayaç, iptal ve pano yedeği arayüzü.

- [ ] **Step 1: Davet kartı davranışları için RED testleri yaz**

```jsx
const ROOM = Object.freeze({
  code: 'ABC234',
  expiresAt: '2026-08-14T12:05:00.000Z',
});

it('davet bağlantısını panoya kopyalar, token ve dosya bilgisini göstermez', async () => {
  const clipboard = { writeText: vi.fn().mockResolvedValue() };
  render(<NearbyInviteCard
    room={{ code: 'ABC234', expiresAt: '2026-08-14T12:05:00.000Z' }}
    origin="https://vaultdrop.test"
    clipboard={clipboard}
    now={() => new Date('2026-08-14T12:00:00.000Z').getTime()}
    onCancel={vi.fn()}
    onExpire={vi.fn()}
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Bağlantı davetini kopyala' }));
  expect(clipboard.writeText).toHaveBeenCalledWith('https://vaultdrop.test/transfer?nearby=ABC234');
  expect(document.body.textContent).not.toMatch(/token|secret|dosya\.pdf|sha256/i);
});

it('Web Share varsa Paylaş gösterir ve yalnız güvenli daveti yollar', async () => {
  const share = vi.fn().mockResolvedValue();
  render(<NearbyInviteCard room={ROOM} share={share} origin="https://vaultdrop.test" />);
  fireEvent.click(screen.getByRole('button', { name: 'Paylaş' }));
  expect(share).toHaveBeenCalledWith({
    title: 'VaultDrop Yakındaki Cihazlar',
    text: 'Yakındaki cihaz bağlantı daveti',
    url: 'https://vaultdrop.test/transfer?nearby=ABC234',
  });
});

it('süre sıfırlanınca bir kez onExpire çağırır', async () => {
  vi.useFakeTimers();
  const onExpire = vi.fn();
  const base = new Date('2026-08-14T12:00:00.000Z').getTime();
  vi.setSystemTime(base);
  render(<NearbyInviteCard room={{ code: 'ABC234', expiresAt: new Date(base + 2_000).toISOString() }} onExpire={onExpire} />);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(onExpire).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

Pano reddi testinde `clipboard.writeText` reject eder; kartın seçilebilir, salt-okunur davet URL alanını göstermesi beklenir.

- [ ] **Step 2: Testi çalıştır ve bileşen eksikliği nedeniyle RED al**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-invite-card.test.jsx --pool=threads --maxWorkers=1
```

Expected: `NearbyInviteCard.jsx` bulunamadığı için FAIL.

- [ ] **Step 3: Davet kartını tek sorumlulukla uygula**

Temel durum ve geri sayım:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { createNearbyInviteUrl } from './invite-link.js';

const systemNow = () => Date.now();

function secondsUntil(expiresAt, nowMs) {
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return 0;
  return Math.max(0, Math.ceil((expiryMs - nowMs) / 1000));
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export default function NearbyInviteCard({
  room,
  onCancel,
  onExpire,
  origin = globalThis.location?.origin ?? 'http://localhost',
  clipboard = globalThis.navigator?.clipboard,
  share = typeof globalThis.navigator?.share === 'function'
    ? globalThis.navigator.share.bind(globalThis.navigator)
    : null,
  now = systemNow,
}) {
  const inviteUrl = useMemo(
    () => createNearbyInviteUrl({ origin, code: room.code }),
    [origin, room.code],
  );
  const [remainingSeconds, setRemainingSeconds] = useState(() => secondsUntil(room.expiresAt, now()));
  const [copyFailed, setCopyFailed] = useState(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    let expiryReported = false;
    const update = () => {
      const next = secondsUntil(room.expiresAt, now());
      setRemainingSeconds(next);
      if (next === 0 && !expiryReported) {
        expiryReported = true;
        onExpireRef.current?.();
      }
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [now, room.expiresAt]);
```

Kopyalama ve paylaşma:

```jsx
async function copyInvite() {
  try {
    await clipboard?.writeText(inviteUrl);
    setCopyFailed(false);
  } catch {
    setCopyFailed(true);
  }
}

async function shareInvite() {
  await share?.({
    title: 'VaultDrop Yakındaki Cihazlar',
    text: 'Yakındaki cihaz bağlantı daveti',
    url: inviteUrl,
  });
}
```

Kartın dönüş yapısı erişilebilir adları ve pano yedeğini açıkça taşısın:

```jsx
return (
  <section className="nearby-invite-card" aria-label="Yakındaki Cihazlar daveti">
    <p>Bağlantıyı ikinci cihazda aç. Dosya, bu bağlantının içinden geçmez.</p>
    <output aria-label="Davet için kalan süre">{formatCountdown(remainingSeconds)}</output>
    <strong aria-label="Kısa bağlantı kodu">{room.code}</strong>
    <div className="nearby-invite-actions">
      <button type="button" onClick={copyInvite}>Bağlantı davetini kopyala</button>
      {share && <button type="button" onClick={shareInvite}>Paylaş</button>}
      <button type="button" onClick={onCancel}>Daveti iptal et</button>
    </div>
    {copyFailed && (
      <label>
        Davet bağlantısı
        <input className="nearby-invite-fallback" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
      </label>
    )}
  </section>
);
```

- [ ] **Step 4: Mobil ve masaüstü CSS kurallarını ekle**

```css
.nearby-invite-card { display: grid; gap: 12px; }
.nearby-invite-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.nearby-invite-actions button { min-height: 44px; }
.nearby-invite-fallback { width: 100%; overflow: hidden; text-overflow: ellipsis; }

@media (max-width: 640px) {
  .nearby-invite-actions { display: grid; grid-template-columns: 1fr; }
  .nearby-invite-actions button { width: 100%; }
}
```

- [ ] **Step 5: Kart ve responsive testlerini GREEN doğrula**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-invite-card.test.jsx src/__tests__/nearby-transfer-ui.test.jsx --pool=threads --maxWorkers=1
```

Expected: kopyalama, paylaşma, fallback, sayaç ve mobil sınıf sözleşmeleri PASS.

---

### Task 5: Gönderici Davet Yaşam Döngüsü ve Host Bekleme Süresi

**Files:**
- Modify: `src/NearbyTransferPanel.jsx`
- Modify: `src/__tests__/nearby-transfer-ui.test.jsx`
- Modify: `src/__tests__/nearby-peer-session.test.js`

**Interfaces:**
- Consumes: `NearbyInviteCard` from Task 4.
- Produces: `waiting-recipient`, `expired`, `cancelled` UI durumları.
- Preserves: guest `peer.connect({ timeoutMs: 15_000 })`.
- Changes: host timeout, `expiresAt - Date.now()` kadar davet bekleme bütçesi kullanır.

- [ ] **Step 1: Hostun 15 saniyede düşmemesi ve davet kartını hemen göstermesi için RED test yaz**

```jsx
it('host davet süresi boyunca bekler ve bağlantı kurulmadan daveti paylaşılabilir gösterir', async () => {
  const neverConnects = new Promise(() => {});
  const peer = { connect: vi.fn(() => neverConnects), close: vi.fn() };
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const signaling = { createRoom: vi.fn().mockResolvedValue({ code: 'ABC234', token: 'secret', expiresAt }) };

  render(<NearbyTransferPanel
    mode="send"
    user={{ id: 'user-1', plan: 'standard' }}
    signaling={signaling}
    peerSessionFactory={() => peer}
    reserveActivity={async () => ({ id: 'reservation-1' })}
    completeActivity={async () => ({ id: 'reservation-1' })}
  />);
  fireEvent.change(screen.getByLabelText('Yakındaki cihaza gönderilecek dosya'), {
    target: { files: [new File(['x'], 'rapor.txt')] },
  });

  expect(await screen.findByRole('button', { name: 'Bağlantı davetini kopyala' })).toBeInTheDocument();
  expect(peer.connect).toHaveBeenCalledWith(expect.objectContaining({
    timeoutMs: expect.any(Number),
  }));
  expect(peer.connect.mock.calls[0][0].timeoutMs).toBeGreaterThan(295_000);
  expect(peer.connect.mock.calls[0][0].timeoutMs).toBeLessThanOrEqual(300_000);
});
```

- [ ] **Step 2: Davet iptali ve süre dolumu için RED testleri yaz**

```jsx
it('Daveti iptal et bağlantı, rezervasyon ve oda kaynaklarını temizler', async () => {
  // Oda oluştur, davet kartını bekle ve iptal düğmesine bas.
  fireEvent.click(await screen.findByRole('button', { name: 'Daveti iptal et' }));
  expect(peer.close).toHaveBeenCalledTimes(1);
  expect(completeActivity).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  expect(screen.queryByText('ABC234')).not.toBeInTheDocument();
});
```

Fake timer testi kalan süre sıfırlandığında `Davet süresi doldu. Yeni davet oluştur.` mesajını, peer close ve yarım rezervasyon iadesini beklesin.

- [ ] **Step 3: Testleri çalıştır ve mevcut `connecting`/3 dakika kartında RED al**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-transfer-ui.test.jsx --pool=threads --maxWorkers=1
```

Expected: davet kartı/iptal bulunmadığı ve host timeout hâlâ 15 saniye olduğu için FAIL.

- [ ] **Step 4: Sender yaşam döngüsünü NearbyTransferPanel'e bağla**

Oda oluşturulduğunda state/ref birlikte güncellensin ve davet kartı hemen render edilsin:

```jsx
const roomRef = useRef(null);

function setActiveRoom(nextRoom) {
  roomRef.current = nextRoom;
  setRoom(nextRoom);
}

const created = await signaling.createRoom();
if (!isCurrent(generation)) return;
setActiveRoom(created);
setStatus('waiting-recipient');
const expiresAt = new Date(created.expiresAt).getTime();
const hostWaitMs = Math.max(1, expiresAt - Date.now());
const peer = peerSessionFactory({ role: 'host', code: created.code, token: created.token, signaling });
peerRef.current = peer;
channelRef.current = await peer.connect({
  signal: operationRef.current.signal,
  timeoutMs: hostWaitMs,
});
```

Sender görünümü:

```jsx
{mode === 'send' && room && ['waiting-recipient', 'connecting'].includes(status) && (
  <NearbyInviteCard
    room={room}
    onCancel={() => cancelInvite('cancelled')}
    onExpire={() => cancelInvite('expired')}
  />
)}
```

İptal/süre dolumu tek fonksiyonda generation artırmalı, mevcut peer/worker/timerları kapatmalı, odayı ve dosyayı temizlemeli, rezervasyonu `failed` sonuçlandırmalı:

```jsx
function cancelInvite(reason) {
  generationRef.current += 1;
  resetActiveTransfer();
  roomRef.current = null;
  setRoom(null);
  setFile(null);
  setProgress(0);
  setStatus(reason);
  setError(reason === 'expired' ? 'Davet süresi doldu. Yeni davet oluştur.' : '');
}
```

- [ ] **Step 5: Eski async sonucun yeni daveti bozmamasını test et**

İlk `peer.connect` deferred bırakılır; iptal sonrası ikinci dosya seçilip yeni oda oluşturulur; ilk promise sonradan resolve edildiğinde ekranda ikinci oda kodu kalmalı ve eski doğrulama ifadesi görünmemelidir. Beklenti generation kontrolüne dayanır.

- [ ] **Step 6: Sender ve peer regresyonlarını GREEN doğrula**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-transfer-ui.test.jsx src/__tests__/nearby-peer-session.test.js src/__tests__/method-handoff.test.jsx --pool=threads --maxWorkers=1
```

Expected: davet paylaşımı, beş dakikalık host beklemesi, iptal, expiry, stale sonuç, READY/ACK ve VaultDrop handoff PASS.

---

### Task 6: Alıcı Açık Onayı ve Davet Hata Mesajları

**Files:**
- Modify: `src/NearbyTransferPanel.jsx`
- Modify: `src/nearby/signaling-client.js`
- Modify: `src/__tests__/nearby-transfer-ui.test.jsx`
- Modify: `src/__tests__/nearby-signaling-client.test.js`

**Interfaces:**
- Consumes: `initialCode` from Task 3.
- Preserves: `signaling.joinRoom(code)` yalnız form submit ile çağrılır.
- Produces user messages for: `ROOM_EXPIRED`, `ROOM_ALREADY_JOINED`/`ROOM_CONFLICT`, `RATE_LIMITED`, `DIRECT_CONNECTION_TIMEOUT`.

- [ ] **Step 1: Bağlan onayı ve tek join çağrısı testini yaz**

```jsx
it('davet kodunu gösterir ve yalnız Bağlan tıklanınca bir kez katılır', async () => {
  const signaling = { joinRoom: vi.fn().mockResolvedValue(ROOM) };
  render(<NearbyTransferPanel
    mode="receive"
    initialCode="ABC234"
    signaling={signaling}
    peerSessionFactory={() => peer}
    receiveControllerFactory={() => receiver}
  />);

  expect(screen.getByText('Yakındaki bir cihaz sana bağlantı daveti gönderdi.')).toBeInTheDocument();
  expect(signaling.joinRoom).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Bağlan' }));
  await waitFor(() => expect(signaling.joinRoom).toHaveBeenCalledTimes(1));
  expect(signaling.joinRoom).toHaveBeenCalledWith('ABC234');
});
```

- [ ] **Step 2: Davet hataları için tablo testi yaz**

```jsx
it.each([
  ['ROOM_EXPIRED', 'Bu davetin süresi dolmuş. Göndericiden yeni davet iste.'],
  ['ROOM_CANCELLED', 'Gönderici bu daveti iptal etmiş.'],
  ['ROOM_ALREADY_JOINED', 'Bu davet daha önce kullanılmış.'],
  ['ROOM_CONFLICT', 'Bu davet daha önce kullanılmış.'],
  ['RATE_LIMITED', 'Çok fazla bağlantı denemesi yapıldı. Biraz bekleyip yeniden dene.'],
])('%s hatasını güvenli kullanıcı metnine çevirir', async (code, message) => {
  const signaling = { joinRoom: vi.fn().mockRejectedValue(Object.assign(new Error('ham hata'), { code })) };
  render(<NearbyTransferPanel mode="receive" initialCode="ABC234" signaling={signaling} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bağlan' }));
  expect(await screen.findByText(message)).toBeInTheDocument();
});
```

- [ ] **Step 3: Testleri çalıştır ve genel hata metni/eski buton adı nedeniyle RED al**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-transfer-ui.test.jsx src/__tests__/nearby-signaling-client.test.js --pool=threads --maxWorkers=1
```

Expected: `Cihaza bağlan` adı ve genel hata metni nedeniyle FAIL.

- [ ] **Step 4: Sinyalleşme hata kodunu koru ve kullanıcı mesajlarını eşle**

`signaling-client.js` sunucudan gelen `ROOM_*` kodlarını korumaya devam etmeli; 409 status kodu yalnız sunucu kodu yoksa `ROOM_CONFLICT` olmalı. Panel eşlemesi:

```js
const NEARBY_ERROR_MESSAGES = Object.freeze({
  ROOM_EXPIRED: 'Bu davetin süresi dolmuş. Göndericiden yeni davet iste.',
  ROOM_CANCELLED: 'Gönderici bu daveti iptal etmiş.',
  ROOM_ALREADY_JOINED: 'Bu davet daha önce kullanılmış.',
  ROOM_CONFLICT: 'Bu davet daha önce kullanılmış.',
  RATE_LIMITED: 'Çok fazla bağlantı denemesi yapıldı. Biraz bekleyip yeniden dene.',
});

function nearbyErrorMessage(error) {
  if (error?.code === 'DIRECT_CONNECTION_TIMEOUT') {
    return 'Doğrudan bağlantı 15 saniyede kurulamadı. Bu ağda VaultDrop kullan.';
  }
  return NEARBY_ERROR_MESSAGES[error?.code]
    ?? error?.message
    ?? 'Cihaz bağlantısı tamamlanamadı.';
}
```

Alıcı submit düğmesinin görünür adı tam `Bağlan` olsun. Disabled koşulu Task 1'deki ortak kod patternine dayansın.

- [ ] **Step 5: İkinci alıcının ilk bağlantıya yan etkisi olmadığını API + UI ile doğrula**

API testi ilk join tokenıyla signal yazma/okumanın ikinci join 409 sonrasında hâlâ çalıştığını doğrulasın. UI testi `ROOM_ALREADY_JOINED` sonrasında yalnız ikinci panelin hata göstermesini beklesin; ilk peer mockunda `close` çağrısı olmamalı.

- [ ] **Step 6: Doğrulama ifadesi farklıysa iki yönde de güvenli kapatmayı test et ve uygula**

Gönderici ve alıcı panel testlerinde peer bağlantısını `verify` durumuna getir; `İfadeler farklı, bağlantıyı kapat` düğmesine basıldığında dosya gönderme/alma controller'ı başlamamalı, peer bir kez kapanmalı ve kullanıcıya güvenli hata gösterilmelidir:

```jsx
fireEvent.click(await screen.findByRole('button', {
  name: 'İfadeler farklı, bağlantıyı kapat',
}));
expect(peer.close).toHaveBeenCalledTimes(1);
expect(sendControllerFactory).not.toHaveBeenCalled();
expect(screen.getByRole('alert')).toHaveTextContent(
  'Doğrulama ifadeleri eşleşmedi. Bağlantı güvenlik için kapatıldı.',
);
```

Panelde iki doğrulama seçeneği birlikte gösterilsin. Olumsuz seçim aynı cleanup kapısından geçsin ve göndericide yarım rezervasyonu iade etsin:

```jsx
function rejectVerificationPhrase() {
  generationRef.current += 1;
  resetActiveTransfer();
  roomRef.current = null;
  setRoom(null);
  setStatus('failed');
  setError('Doğrulama ifadeleri eşleşmedi. Bağlantı güvenlik için kapatıldı.');
}
```

Doğrulama kartına şu ikincil düğmeyi ekle:

```jsx
<button type="button" onClick={rejectVerificationPhrase}>
  İfadeler farklı, bağlantıyı kapat
</button>
```

- [ ] **Step 7: Alıcı görev paketini GREEN doğrula**

Run aynı Task 6 komutu.  
Expected: açık onay, tek join, hata metinleri, ikinci alıcı izolasyonu, ifade uyuşmazlığında güvenli kapatma ve 15 saniye VaultDrop fallback PASS.

---

### Task 7: Birleşik Güvenlik, Dokümantasyon ve Yayın Kapısı

**Files:**
- Create: `src/__tests__/nearby-invite-security.test.jsx`
- Modify: `src/__tests__/three-method-routing.test.jsx`
- Modify: `src/__tests__/three-method-security-contract.test.jsx`
- Modify: `docs/nearby-devices-manual-test.md`
- Modify: `docs/three-method-acceptance-test.md`
- Modify: `README.md`

**Interfaces:**
- Consumes all Tasks 1–6.
- Produces: davet linki, URL yönlendirmesi, HTTP izolasyonu, cleanup ve manuel kabul için tek yayın kanıt paketi.

- [ ] **Step 1: Davet güvenlik entegrasyon testini yaz**

```jsx
import { createNearbyInviteUrl } from '../nearby/invite-link.js';
import { createNearbySignalingClient } from '../nearby/signaling-client.js';

it('davet oluşturma ve açma boyunca dosya bilgilerini URL veya HTTP isteğine sızdırmaz', async () => {
  const marker = 'DOSYA-ICERIK-GIZLI';
  const fileName = 'gizli-rapor.xlsx';
  const sha256 = 'A'.repeat(43);
  const requests = [];
  const apiRequest = vi.fn(async (path, options = {}) => {
    requests.push({ path, body: options.body, headers: options.headers });
    if (path === '/api/nearby/rooms') {
      return { code: 'ABC234', token: 'HOST_SECRET', expiresAt: new Date(Date.now() + 300_000).toISOString() };
    }
    throw new Error(`Beklenmeyen istek: ${path}`);
  });

  const signaling = createNearbySignalingClient({ apiRequest });
  const room = await signaling.createRoom();
  const invite = createNearbyInviteUrl({ origin: 'https://vaultdrop.test', code: 'ABC234' });
  expect(room.code).toBe('ABC234');
  expect(requests).toEqual([{
    path: '/api/nearby/rooms',
    body: '{}',
    headers: undefined,
  }]);
  expect(invite).toBe('https://vaultdrop.test/transfer?nearby=ABC234');
  const serialized = JSON.stringify({ invite, requests });
  expect(serialized).not.toContain(marker);
  expect(serialized).not.toContain(fileName);
  expect(serialized).not.toContain(sha256);
  expect(invite).not.toContain('HOST_SECRET');
});
```

- [ ] **Step 2: TransferPage yöntem değişiminde davet panelinin kaynaklarını kapattığını test et**

Gerçek sayfada davetle alım paneli açılır; sonra VaultDrop seçilir. Mock Nearby panel cleanup işlevinin bir kez çağrıldığı ve gecikmiş join sonucunun DOM'a yazılmadığı doğrulanır. Mevcut `three-method-routing.test.jsx` unmount sözleşmesi davet başlangıcıyla genişletilir.

- [ ] **Step 3: Belgeleri gerçek akışla eşitle**

`README.md` ve manuel form aşağıdaki kesin bilgileri içersin:

- Davet bağlantısı ana akış, kısa kod yedektir.
- Davet tek kullanımlık ve beş dakika geçerlidir.
- Bağlantıyı açmak otomatik katılım yapmaz; kullanıcı `Bağlan` der.
- Dosya mesajlaşma kanalından veya tanıştırma API'sinden geçmez.
- Aynı ağ/WebRTC kurulamazsa VaultDrop kullanılır.
- Özellik gerçek cihaz matrisi tamamlanmadan üretimde kapalıdır.

`docs/nearby-devices-manual-test.md` satırlarına davet kanalı sütunu ekle: Teams, WhatsApp Web, e-posta. Her satır oda kurulma süresi, ifade eşleşmesi, aktarım süresi ve SHA sonucunu kaydetsin.

- [ ] **Step 4: Hedefli kabul paketini çalıştır**

Run:

```powershell
cmd /c npx vitest run src/__tests__/nearby-invite-link.test.js src/__tests__/nearby-invite-routing.test.jsx src/__tests__/nearby-invite-card.test.jsx src/__tests__/nearby-invite-security.test.jsx src/__tests__/nearby-transfer-ui.test.jsx src/__tests__/nearby-peer-session.test.js src/__tests__/nearby-transfer-controllers.test.js src/__tests__/nearby-network-isolation.test.js src/__tests__/three-method-routing.test.jsx src/__tests__/three-method-security-contract.test.jsx server/__tests__/nearby-service.test.js server/__tests__/nearby-api.test.js server/__tests__/nearby-abuse.test.js server/__tests__/nearby-repositories.test.js server/__tests__/nearby-cleanup.test.js --pool=threads --maxWorkers=1
```

Expected: tüm davet, WebRTC, güvenlik, server ve yöntem testleri PASS.

- [ ] **Step 5: Tam regresyonu çalıştır**

Run:

```powershell
cmd /c npm test -- --run --exclude .superpowers/**
```

Expected: çıkış kodu 0; bilinçli atlanan gerçek PostgreSQL testi ayrıca raporlanır.

- [ ] **Step 6: Kod kalitesi ve üretim derlemesini çalıştır**

Run:

```powershell
cmd /c npm run lint
cmd /c npm run build
```

Expected: iki komut da exit 0. Önceden var olan lint uyarıları yeni hata sayılmaz; yeni uyarı oluşursa ilgili görevde giderilir.

- [ ] **Step 7: Yayın kararını gerçek cihaz durumuyla raporla**

Final rapor aşağıdaki ayrımı açıkça yapar:

- Otomatik testlerle kanıtlanan davet/URL/tek-kullanım/ağ izolasyonu davranışları.
- `TEST_DATABASE_URL` olmadığı için atlanan gerçek PostgreSQL testi.
- Windows/Edge, Windows/macOS ve macOS/Safari manuel matrisinin boş veya tamamlanan satırları.
- Manuel matris tamamlanmadıysa `VITE_ENABLE_NEARBY=false` üretim kararı.
- VaultDrop'un aynı ağ başarısızlıklarında stabil yedek olarak çalışmaya devam ettiği.
