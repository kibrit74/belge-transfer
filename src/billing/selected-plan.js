import { PLAN_LIMIT_BYTES, normalizePlan } from "../../shared/plan-policy.js";

export const SELECTED_PLAN_STORAGE_KEY = "vaultdrop:selected-plan";

function isKnownPlan(plan) {
  return Object.hasOwn(PLAN_LIMIT_BYTES, plan);
}

export function readSelectedPlan(storage = globalThis.localStorage) {
  try {
    const storedPlan = storage?.getItem(SELECTED_PLAN_STORAGE_KEY);
    return isKnownPlan(storedPlan) ? storedPlan : null;
  } catch {
    return null;
  }
}

export function writeSelectedPlan(plan, storage = globalThis.localStorage) {
  const normalizedPlan = normalizePlan(plan);
  if (!isKnownPlan(plan) && plan !== "member") return null;

  try {
    storage?.setItem(SELECTED_PLAN_STORAGE_KEY, normalizedPlan);
    return normalizedPlan;
  } catch {
    return null;
  }
}
