import { describe, expect, it } from "vitest";
import { transferReservationSchema, transferSchema } from "../validation.js";

const STARTED_AT = "2026-08-13T10:00:00.000Z";

it("işlem öğesinde yalnız boyutu tutar", () => {
  const parsed = transferReservationSchema.parse({
    method: "secure_package",
    startedAt: STARTED_AT,
    items: [{ sizeBytes: 1200, extension: "pdf", name: "gizli.pdf", type: "application/pdf" }],
  });
  expect(parsed.items).toEqual([{ sizeBytes: 1200 }]);
});

describe("aktif aktarım yöntemleri", () => {
  it("yeni QR Video kaydını reddeder", () => {
    expect(transferReservationSchema.safeParse({
      method: "qr_video", startedAt: STARTED_AT, items: [{ sizeBytes: 1 }],
    }).success).toBe(false);
  });

  it("VaultDrop 50 MiB aşımını reddeder", () => {
    expect(transferReservationSchema.safeParse({
      method: "secure_package", startedAt: STARTED_AT,
      items: [{ sizeBytes: 30 * 1024 * 1024 }, { sizeBytes: 20 * 1024 * 1024 + 1 }],
    }).success).toBe(false);
  });

  it("Canlı QR için 10 MiB kabul eder, bir bayt fazlasını reddeder", () => {
    expect(transferReservationSchema.safeParse({
      method: "live_qr", startedAt: STARTED_AT, items: [{ sizeBytes: 10 * 1024 * 1024 }],
    }).success).toBe(true);
    expect(transferReservationSchema.safeParse({
      method: "live_qr", startedAt: STARTED_AT, items: [{ sizeBytes: 10 * 1024 * 1024 + 1 }],
    }).success).toBe(false);
  });

  it("Yakındaki Cihazlar tek dosyada 100 MiB kabul eder", () => {
    const reservation = {
      method: "nearby", startedAt: STARTED_AT, items: [{ sizeBytes: 100 * 1024 * 1024 }],
    };
    expect(transferReservationSchema.safeParse(reservation).success).toBe(true);
    expect(transferSchema.safeParse({
      ...reservation, direction: "receive", status: "completed",
    }).success).toBe(true);
  });

  it("Yakındaki Cihazlar ikinci dosyayı ve 100 MiB aşımını reddeder", () => {
    expect(transferReservationSchema.safeParse({
      method: "nearby", startedAt: STARTED_AT, items: [{ sizeBytes: 1 }, { sizeBytes: 1 }],
    }).success).toBe(false);
    expect(transferReservationSchema.safeParse({
      method: "nearby", startedAt: STARTED_AT, items: [{ sizeBytes: 100 * 1024 * 1024 + 1 }],
    }).success).toBe(false);
  });
});
