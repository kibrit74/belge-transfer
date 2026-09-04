export function applyBootstrapAdminRole(user, superAdminEmails = []) {
  if (!user?.email) return user;
  const email = user.email.trim().toLowerCase();
  if (!superAdminEmails.includes(email)) return user;
  return { ...user, role: "super_admin" };
}
