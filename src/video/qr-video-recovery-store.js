const DATABASE_NAME = "vaultdrop-qr-video-recovery";
const STORE_NAME = "sessions";
const RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;

class QrVideoRecoveryError extends Error {
  constructor(cause) {
    super("Yerel QR Video kurtarma alanı kullanılamıyor.", { cause });
    this.name = "QrVideoRecoveryError";
    this.code = "RECOVERY_UNAVAILABLE";
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB isteği başarısız."));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB işlemi başarısız."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB işlemi iptal edildi."));
  });
}

function outgoingRecord(record) {
  return {
    id: String(record.id),
    direction: "outgoing",
    protocolVersion: String(record.protocolVersion),
    transferId: String(record.transferId),
    createdAt: record.createdAt,
    expiresAt: record.createdAt + RECOVERY_TTL_MS,
    encryptedBytes: new Uint8Array(record.encryptedBytes),
  };
}

function incomingRecord(record) {
  const deduplicated = new Map();
  for (const symbol of record.symbols ?? []) {
    deduplicated.set(symbol.symbolId, {
      symbolId: symbol.symbolId,
      data: new Uint8Array(symbol.data),
    });
  }
  const metadata = record.metadata ?? {};
  return {
    id: String(record.id),
    direction: "incoming",
    protocolVersion: String(record.protocolVersion),
    transferId: String(record.transferId),
    createdAt: record.createdAt,
    expiresAt: record.createdAt + RECOVERY_TTL_MS,
    metadata: {
      transferId: String(record.transferId),
      sourceCount: metadata.sourceCount,
      blockBytes: metadata.blockBytes,
      originalBytes: metadata.originalBytes,
      sha256: metadata.sha256,
    },
    symbols: [...deduplicated.values()],
  };
}

function cloneRecord(record) {
  if (!record) return null;
  return record.direction === "outgoing"
    ? { ...record, encryptedBytes: new Uint8Array(record.encryptedBytes) }
    : {
        ...record,
        metadata: { ...record.metadata },
        symbols: record.symbols.map((symbol) => ({
          symbolId: symbol.symbolId,
          data: new Uint8Array(symbol.data),
        })),
      };
}

export function createQrVideoRecoveryStore(indexedDb = globalThis.indexedDB) {
  let openedDatabase;

  function openDatabase() {
    if (!indexedDb) throw new QrVideoRecoveryError();
    if (!openedDatabase) {
      try {
        const request = indexedDb.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("expiresAt", "expiresAt", { unique: false });
        };
        openedDatabase = requestResult(request);
      } catch (error) {
        throw new QrVideoRecoveryError(error);
      }
    }
    return openedDatabase;
  }

  async function safely(operation) {
    try {
      return await operation();
    } catch (error) {
      if (error?.code === "RECOVERY_UNAVAILABLE") throw error;
      throw new QrVideoRecoveryError(error);
    }
  }

  async function run(mode, operation) {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, mode);
    const completed = transactionResult(transaction);
    const result = await operation(transaction.objectStore(STORE_NAME));
    await completed;
    return result;
  }

  function put(record) {
    return safely(() => run("readwrite", (store) => requestResult(store.put(record))));
  }

  return {
    saveOutgoing(record) {
      return put(outgoingRecord(record));
    },
    saveIncoming(record) {
      return put(incomingRecord(record));
    },
    get(id, now = Date.now()) {
      return safely(async () => {
        const record = await run("readonly", (store) => requestResult(store.get(id)));
        if (!record || record.expiresAt <= now) {
          if (record) await run("readwrite", (store) => requestResult(store.delete(id)));
          return null;
        }
        return cloneRecord(record);
      });
    },
    delete(id) {
      return safely(() => run("readwrite", (store) => requestResult(store.delete(id))));
    },
    deleteExpired(now = Date.now()) {
      return safely(() => run("readwrite", async (store) => {
        const records = await requestResult(store.getAll());
        const expired = records.filter((record) => record.expiresAt <= now);
        await Promise.all(expired.map((record) => requestResult(store.delete(record.id))));
        return expired.length;
      }));
    },
    list(now = Date.now()) {
      return safely(async () => {
        await this.deleteExpired(now);
        const records = await run("readonly", (store) => requestResult(store.getAll()));
        return records.map(cloneRecord).sort((a, b) => b.createdAt - a.createdAt);
      });
    },
  };
}
