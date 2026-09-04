export function can(user, permission) {
  return user?.permissions?.includes("*") || user?.permissions?.includes(permission);
}
