export function createNearbySignalingClient({ apiRequest, pollIntervalMs = 500 } = {}) {
  if (typeof apiRequest !== "function") {
    throw new TypeError("Yakındaki Cihazlar API istemcisi gerekli.");
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new RangeError("Sorgulama aralığı geçersiz.");
  }

  async function call(path, options) {
    try {
      return await apiRequest(path, options);
    } catch (error) {
      throw mapClientError(error);
    }
  }

  async function pollOnce({ code, token, after = 0, signal, onSignal }) {
    throwIfAborted(signal);
    const normalizedCode = normalizeCode(code);
    const result = await call(
      `/api/nearby/rooms/${encodeURIComponent(normalizedCode)}/signals?after=${after}`,
      {
        method: "GET",
        headers: { "X-Nearby-Token": token },
        ...(signal ? { signal } : {}),
      },
    );
    throwIfAborted(signal);

    const seen = new Set();
    let latest = after;
    for (const item of [...(result?.signals ?? [])].toSorted((left, right) => left.sequence - right.sequence)) {
      if (!Number.isSafeInteger(item?.sequence) || item.sequence <= after || seen.has(item.sequence)) continue;
      seen.add(item.sequence);
      latest = Math.max(latest, item.sequence);
      await onSignal?.(item);
    }
    return latest;
  }

  return {
    createRoom() {
      return call("/api/nearby/rooms", { method: "POST", body: "{}" });
    },

    joinRoom(code, { signal } = {}) {
      return call(`/api/nearby/rooms/${encodeURIComponent(normalizeCode(code))}/join`, {
        method: "POST",
        body: "{}",
        ...(signal ? { signal } : {}),
      });
    },

    publish({ code, token, kind, sequence, payload, signal }) {
      return call(`/api/nearby/rooms/${encodeURIComponent(normalizeCode(code))}/signals`, {
        method: "POST",
        headers: { "X-Nearby-Token": token },
        body: JSON.stringify({ kind, sequence, payload }),
        ...(signal ? { signal } : {}),
      });
    },

    pollOnce,

    async poll({ code, token, after = 0, signal, onSignal }) {
      throwIfAborted(signal);
      let latest = after;
      let retryDelay = pollIntervalMs;

      while (true) {
        try {
          latest = await pollOnce({ code, token, after: latest, signal, onSignal });
          retryDelay = pollIntervalMs;
          throwIfAborted(signal);
          await abortableDelay(pollIntervalMs, signal);
        } catch (error) {
          const mapped = mapClientError(error);
          if (mapped.code === "ABORTED" || mapped.status) throw mapped;
          await abortableDelay(retryDelay, signal);
          retryDelay = Math.min(Math.max(retryDelay * 2, pollIntervalMs), 3000);
        }
      }
    },

    async close({ code, token, signal, timeoutMs = 1_000 }) {
      const bounded = createBoundedSignal(signal, timeoutMs);
      try {
        return await call(`/api/nearby/rooms/${encodeURIComponent(normalizeCode(code))}`, {
          method: "DELETE",
          headers: { "X-Nearby-Token": token },
          signal: bounded.signal,
        });
      } finally {
        bounded.cleanup();
      }
    },
  };
}

function normalizeCode(code) {
  if (typeof code !== "string") throw new TypeError("Oda kodu geçersiz.");
  return code.trim().toUpperCase();
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createClientError("ABORTED", "İşlem iptal edildi.");
}

function abortableDelay(milliseconds, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(finish, milliseconds);

    function finish() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }

    function abort() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(createClientError("ABORTED", "İşlem iptal edildi."));
    }

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function createBoundedSignal(externalSignal, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Kapatma zaman aşımı geçersiz.");
  }
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

function mapClientError(error) {
  if (error?.code === "ABORTED" || error?.name === "AbortError") {
    return createClientError("ABORTED", "İşlem iptal edildi.");
  }
  if (error?.code?.startsWith?.("ROOM_") || error?.code === "RATE_LIMITED") return error;

  const codesByStatus = {
    401: "INVALID_ROOM_TOKEN",
    404: "ROOM_NOT_FOUND",
    409: "ROOM_CONFLICT",
    410: "ROOM_EXPIRED",
    429: "RATE_LIMITED",
  };
  const code = codesByStatus[error?.status] ?? "SIGNALING_FAILED";
  return createClientError(code, error?.message || "Cihaz bağlantısı kurulamadı.", error?.status);
}

function createClientError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  return error;
}
