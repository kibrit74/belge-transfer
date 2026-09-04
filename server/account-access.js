export function getAccountRestriction(user, now = new Date()) {
  if (user?.status === "banned") {
    return { code: "ACCOUNT_BANNED", message: "Hesabınız engellendi." };
  }
  if (user?.status === "suspended") {
    const restrictedUntil = user.restricted_until ? new Date(user.restricted_until) : null;
    if (!restrictedUntil || restrictedUntil > now) {
      return { code: "ACCOUNT_SUSPENDED", message: "Hesabınız geçici olarak askıya alındı." };
    }
  }
  return null;
}

export function requireTransferAccess(request, response, next) {
  const restriction = getAccountRestriction(request.user);
  if (restriction) {
    return response.status(403).json({ code: restriction.code, error: restriction.message });
  }
  if (request.user?.transfers_blocked) {
    return response.status(403).json({
      code: "TRANSFERS_BLOCKED",
      error: "Bu hesap için yeni aktarım oluşturma kapatıldı.",
    });
  }
  next();
}
