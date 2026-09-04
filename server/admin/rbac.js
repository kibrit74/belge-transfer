export const ROLE_PERMISSIONS = Object.freeze({
  user: [],
  analyst: ["dashboard.view", "transactions.view"],
  support: [
    "dashboard.view",
    "users.view",
    "users.suspend",
    "transactions.view",
    "logs.view",
  ],
  admin: [
    "dashboard.view",
    "users.view",
    "users.suspend",
    "users.ban",
    "users.limits",
    "transactions.view",
    "logs.view",
    "audit.view",
  ],
  super_admin: ["*"],
});

export function getPermissions(role) {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.user;
}

export function hasPermission(user, permission) {
  const permissions = getPermissions(user?.role);
  return permissions.includes("*") || permissions.includes(permission);
}

export function requirePermission(permission) {
  return function enforcePermission(request, response, next) {
    if (!request.user) {
      return response.status(401).json({
        code: "AUTH_REQUIRED",
        error: "Giriş yapmanız gerekiyor.",
      });
    }
    if (!hasPermission(request.user, permission)) {
      return response.status(403).json({
        code: "FORBIDDEN",
        error: "Bu işlem için yetkiniz bulunmuyor.",
      });
    }
    next();
  };
}
