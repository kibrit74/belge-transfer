import { describe, expect, it, vi } from "vitest";
import { hasPermission, requirePermission } from "../admin/rbac.js";

describe("admin RBAC", () => {
  it("support rolüne kullanıcı banlama yetkisi vermez", () => {
    expect(hasPermission({ role: "support" }, "users.ban")).toBe(false);
  });

  it("super admin rolüne bütün tanımlı izinleri verir", () => {
    expect(hasPermission({ role: "super_admin" }, "users.ban")).toBe(true);
    expect(hasPermission({ role: "super_admin" }, "audit.view")).toBe(true);
  });

  it("oturumsuz isteği 401 ile reddeder", () => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requirePermission("users.view")({ user: null }, response, next);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: "AUTH_REQUIRED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("yetkisi olmayan kullanıcıyı 403 ile reddeder", () => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requirePermission("users.ban")({ user: { role: "support" } }, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(next).not.toHaveBeenCalled();
  });
});
