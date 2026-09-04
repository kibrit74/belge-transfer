export const PLAN_LIMIT_BYTES = Object.freeze({
  free: 10 * 1024 * 1024,
  standard: 50 * 1024 * 1024,
  plus: 250 * 1024 * 1024,
  corporate: 1024 * 1024 * 1024,
});

const PLAN_LABELS = Object.freeze({
  free: "Free",
  standard: "Standart",
  plus: "Plus",
  corporate: "Kurumsal",
});

export function normalizePlan(plan) {
  if (plan === "member") return "standard";
  return Object.hasOwn(PLAN_LIMIT_BYTES, plan) ? plan : "free";
}

export function getPlanLimitBytes(plan) {
  return PLAN_LIMIT_BYTES[normalizePlan(plan)];
}

export function getPlanLabel(plan) {
  return PLAN_LABELS[normalizePlan(plan)];
}

export function getUtcMonthlyPeriod(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}
