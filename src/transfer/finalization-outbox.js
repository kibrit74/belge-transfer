const DATABASE_NAME = "vaultdrop-finalization-outbox";
const STORE_NAME = "finalizations";
const MAX_RETRY_DELAY_MS = 30_000;
const LOCAL_STORAGE_KEY = "vaultdrop.finalization-outbox.v1";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Kalıcı kuyruk yazılamadı."));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Kalıcı kuyruk güncellenemedi."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Kalıcı kuyruk iptal edildi."));
  });
}

export function createIndexedDbFinalizationStore(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) {
    const unavailable = () => Promise.reject(new Error("Kalıcı kuyruk bu tarayıcıda kullanılamıyor."));
    return { put: unavailable, delete: unavailable, listByUser: unavailable };
  }

  // IndexedDB şeması açılış isteğinin upgrade olayında oluşturulur.
  const openingRequest = indexedDb.open(DATABASE_NAME, 1);
  openingRequest.onupgradeneeded = () => {
    const store = openingRequest.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    store.createIndex("userId", "userId", { unique: false });
  };
  const openedDatabase = requestResult(openingRequest);

  async function run(mode, operation) {
    const db = await openedDatabase;
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);
    const result = await requestResult(request);
    await transactionResult(transaction);
    return result;
  }

  return {
    put(record) {
      return run("readwrite", (store) => store.put(record));
    },
    delete(key) {
      return run("readwrite", (store) => store.delete(key));
    },
    async listByUser(userId) {
      const db = await openedDatabase;
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).index("userId").getAll(userId);
      const result = await requestResult(request);
      await transactionResult(transaction);
      return result;
    },
  };
}

function safeRecord(record) {
  return {
    key: record.key,
    userId: record.userId,
    reservationId: record.reservationId,
    status: record.status,
    completedAt: record.completedAt,
    attempts: record.attempts,
  };
}

export function createLocalStorageFinalizationStore(storage) {
  if (!storage) {
    const unavailable = () => Promise.reject(new Error("localStorage kuyruğu kullanılamıyor."));
    return { put: unavailable, delete: unavailable, listByUser: unavailable };
  }

  function readRecords() {
    const value = storage.getItem(LOCAL_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(safeRecord) : [];
  }

  function writeRecords(records) {
    if (records.length === 0) {
      storage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records.map(safeRecord)));
  }

  return {
    async put(record) {
      const records = readRecords().filter((item) => item.key !== record.key);
      records.push(safeRecord(record));
      writeRecords(records);
    },
    async delete(key) {
      writeRecords(readRecords().filter((record) => record.key !== key));
    },
    async listByUser(userId) {
      return readRecords().filter((record) => record.userId === userId);
    },
  };
}

export function createFallbackFinalizationStore(primary, fallback) {
  return {
    async put(record) {
      try {
        await primary.put(record);
      } catch {
        await fallback.put(record);
      }
    },
    async delete(key) {
      await Promise.allSettled([primary.delete(key), fallback.delete(key)]);
    },
    async listByUser(userId) {
      const results = await Promise.allSettled([
        primary.listByUser(userId),
        fallback.listByUser(userId),
      ]);
      const available = results.filter((result) => result.status === "fulfilled");
      if (available.length === 0) throw new Error("Kalıcı kuyruk okunamadı.");
      const records = new Map();
      for (const result of available) {
        for (const record of result.value) records.set(record.key, safeRecord(record));
      }
      return [...records.values()];
    },
  };
}

function toRecord({ user, reservationId, status, completedAt }) {
  return {
    key: `${user.id}:${reservationId}:${status}`,
    userId: user.id,
    reservationId,
    status,
    completedAt: completedAt.toISOString(),
    attempts: 0,
  };
}

export function createFinalizationOutbox({ store, finalize, setTimer = setTimeout, onlineTarget = globalThis.window }) {
  async function flush(user) {
    if (!user?.id) return null;
    const records = await store.listByUser(user.id);
    let lastResult = null;
    for (const record of records) {
      const result = await finalize({
        user,
        reservationId: record.reservationId,
        status: record.status,
        completedAt: new Date(record.completedAt),
      });
      if (result) {
        await store.delete(record.key);
        lastResult = result;
        continue;
      }
      await store.put({ ...record, attempts: record.attempts + 1 });
    }
    return lastResult;
  }

  async function enqueueAndFlush(activity) {
    if (!activity.user?.id || !activity.reservationId) return null;
    const record = toRecord(activity);
    await store.put(record);
    return flush(activity.user);
  }

  function attachOnlineRetry(user) {
    if (!user?.id || !onlineTarget?.addEventListener) return () => {};
    let timerId;
    const retry = async () => {
      const records = await store.listByUser(user.id);
      const maxAttempts = records.reduce((max, record) => Math.max(max, record.attempts), 0);
      const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * (2 ** Math.max(0, maxAttempts - 1)));
      timerId = setTimer(() => { void flush(user); }, delay);
    };
    void flush(user).then(retry).catch(() => {});
    const onOnline = () => { void flush(user); };
    onlineTarget.addEventListener("online", onOnline);
    return () => {
      onlineTarget.removeEventListener("online", onOnline);
      if (timerId !== undefined) globalThis.clearTimeout(timerId);
    };
  }

  return { enqueueAndFlush, flush, attachOnlineRetry };
}
