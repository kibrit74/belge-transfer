import { describe, expect, it, vi } from "vitest";
import { getAccountRestriction, requireTransferAccess } from "../account-access.js";

describe("hesap erişim kısıtları", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("banlı hesabı engeller", () => {
    expect(getAccountRestriction({ status: "banned" }, now)).toEqual({
      code: "ACCOUNT_BANNED",
      message: "Hesabınız engellendi.",
    });
  });

  it("süresi dolmuş askıyı erişim engeli saymaz", () => {
    expect(getAccountRestriction({
      status: "suspended",
      restricted_until: "2026-08-24T11:59:59.000Z",
    }, now)).toBeNull();
  });

  it("işlem oluşturması kapalı hesabı transfer uçlarında reddeder", () => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireTransferAccess({
      user: { status: "active", transfers_blocked: true },
    }, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: "TRANSFERS_BLOCKED" }));
    expect(next).not.toHaveBeenCalled();
  });
});
