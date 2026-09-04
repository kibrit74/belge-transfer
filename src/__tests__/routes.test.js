import { describe, expect, it } from "vitest";
import { resolveRoute } from "../routes";

describe("resolveRoute", () => {
  it.each([
    ["/", "landing"],
    ["/transfer", "transfer"],
    ["/transfer/", "transfer"],
    ["/sss", "faq"],
    ["/paketler", "pricing"],
    ["/giris", "login"],
    ["/profil", "profile"],
    ["/admin", "admin"],
    ["/admin/kullanicilar", "admin"],
    ["/al/550e8400-e29b-41d4-a716-446655440000", "secure-link-receive"],
    ["/bilinmeyen", "not-found"],
  ])("%s yolunu %s sayfasına çözer", (pathname, page) => {
    expect(resolveRoute(pathname)).toBe(page);
  });
});
