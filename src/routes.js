export function resolveRoute(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;

  if (normalized === "/") return "landing";
  if (normalized === "/transfer") return "transfer";
  if (normalized === "/sss") return "faq";
  if (normalized === "/paketler") return "pricing";
  if (normalized === "/giris") return "login";
  if (normalized === "/profil") return "profile";
  if (normalized === "/admin" || normalized.startsWith("/admin/")) return "admin";
  if (/^\/al\/[^/]+$/.test(normalized)) return "secure-link-receive";

  return "not-found";
}
