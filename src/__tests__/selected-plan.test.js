import { describe, expect, it, vi } from "vitest";
import { readSelectedPlan, writeSelectedPlan } from "../billing/selected-plan.js";

function createStorage() {
  const items = new Map();
  return {
    getItem: vi.fn((key) => items.get(key) ?? null),
    setItem: vi.fn((key, value) => items.set(key, value)),
  };
}

describe("seçili paket bilgisi", () => {
  it("geçerli paket seçimini güvenli biçimde saklar ve okur", () => {
    const storage = createStorage();

    expect(writeSelectedPlan("plus", storage)).toBe("plus");
    expect(readSelectedPlan(storage)).toBe("plus");
  });

  it("bilinmeyen paket adını saklamaz", () => {
    const storage = createStorage();

    expect(writeSelectedPlan("mega", storage)).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
