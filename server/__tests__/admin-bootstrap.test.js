import { expect, it } from "vitest";
import { applyBootstrapAdminRole } from "../admin/bootstrap.js";
import { readConfig } from "../config.js";

it("ortam değişkenindeki e-postaları küçük harfe dönüştürüp ayırır", () => {
  const config = readConfig({
    VAULTDROP_SUPER_ADMIN_EMAILS: " Root@Example.com, ikinci@example.com ",
  });
  expect(config.superAdminEmails).toEqual(["root@example.com", "ikinci@example.com"]);
});

it("yalnız eşleşen e-postaya sunucu tarafında super admin rolü verir", () => {
  expect(applyBootstrapAdminRole(
    { email: "ROOT@example.com", role: "user" },
    ["root@example.com"],
  ).role).toBe("super_admin");
  expect(applyBootstrapAdminRole(
    { email: "uye@example.com", role: "admin" },
    ["root@example.com"],
  ).role).toBe("admin");
});
