import { apiRequest } from "../api/client.js";
import {
  createFallbackFinalizationStore,
  createFinalizationOutbox,
  createIndexedDbFinalizationStore,
  createLocalStorageFinalizationStore,
} from "./finalization-outbox.js";

const FINALIZATION_ATTEMPTS = 3;

export function buildTransferPayload({ method, direction, status, files, startedAt, completedAt }) {
  return {
    method,
    direction,
    status,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt?.toISOString() ?? null,
    items: Array.from(files).map((file) => ({
      sizeBytes: file.size,
    })),
  };
}

export async function recordTransferActivity({ user, ...activity }) {
  if (!user) return null;
  try {
    return await apiRequest("/api/transfers", {
      method: "POST",
      body: JSON.stringify(buildTransferPayload(activity)),
    });
  } catch {
    // Geçmiş kaydı başarısız olsa bile cihazlar arası aktarımı bozma.
    return null;
  }
}

export async function reserveTransferActivity({ user, method, files, startedAt }) {
  if (!user) return null;
  const payload = buildTransferPayload({
    method,
    direction: "send",
    status: "completed",
    files,
    startedAt,
  });
  const reservation = await apiRequest("/api/transfers/reservations", {
    method: "POST",
    body: JSON.stringify({ method, startedAt: payload.startedAt, items: payload.items }),
  });
  if (!reservation?.id) throw new Error("Aylık kota rezervasyonu doğrulanamadı.");
  return reservation;
}

export async function finalizeTransferActivity({ user, reservationId, status, completedAt }) {
  if (!user || !reservationId) return null;
  for (let attempt = 0; attempt < FINALIZATION_ATTEMPTS; attempt += 1) {
    try {
      return await apiRequest(`/api/transfers/${reservationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, completedAt: completedAt.toISOString() }),
      });
    } catch {
      // Aynı idempotent istek bir sonraki turda yeniden denenir.
    }
  }
  return null;
}

function getLocalStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

const finalizationOutbox = createFinalizationOutbox({
  store: createFallbackFinalizationStore(
    createIndexedDbFinalizationStore(),
    createLocalStorageFinalizationStore(getLocalStorage()),
  ),
  finalize: finalizeTransferActivity,
});

export class FinalizationNotSecuredError extends Error {
  constructor() {
    super("Aylık kullanım kaydı güvenceye alınamadı.");
    this.name = "FinalizationNotSecuredError";
    this.code = "FINALIZATION_NOT_SECURED";
  }
}

export function createTransferCompletion({ outbox, finalize }) {
  return async function complete(activity) {
    if (!activity.user || !activity.reservationId) return null;
    try {
      return await outbox.enqueueAndFlush(activity);
    } catch {
      const result = await finalize(activity);
      if (result) return result;
      throw new FinalizationNotSecuredError();
    }
  };
}

export const completeTransferActivity = createTransferCompletion({
  outbox: finalizationOutbox,
  finalize: finalizeTransferActivity,
});

export function resumePendingTransferFinalizations(user) {
  return finalizationOutbox.attachOnlineRetry(user);
}

export function recordReceiveActivity({ user, method, files, startedAt, completedAt }) {
  return recordTransferActivity({
    user,
    method,
    direction: "receive",
    status: "completed",
    files,
    startedAt,
    completedAt,
  });
}
