import { describe, expect, it } from "vitest";
import {
  getPlanLabel,
  getPlanLimitBytes,
  getUtcMonthlyPeriod,
  normalizePlan,
} from "../../shared/plan-policy.js";

describe("aylık paket politikası", () => {
  it.each([
    ["free", 10 * 1024 * 1024, "Free"],
    ["standard", 50 * 1024 * 1024, "Standart"],
    ["plus", 250 * 1024 * 1024, "Plus"],
    ["corporate", 1024 * 1024 * 1024, "Kurumsal"],
  ])("%s paketini doğru tanımlar", (plan, bytes, label) => {
    expect(getPlanLimitBytes(plan)).toBe(bytes);
    expect(getPlanLabel(plan)).toBe(label);
  });

  it("eski üyeyi standarda, bilinmeyen planı güvenli Free paketine düşürür", () => {
    expect(normalizePlan("member")).toBe("standard");
    expect(normalizePlan("unknown")).toBe("free");
  });

  it("UTC aylık dönemini hesaplar", () => {
    expect(getUtcMonthlyPeriod(new Date("2026-08-09T10:00:00Z"))).toEqual({
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-09-01T00:00:00.000Z"),
    });
  });
});
