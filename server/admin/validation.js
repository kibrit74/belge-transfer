import { z } from "zod";

const optionalFilter = z.preprocess((value) => value === "" ? null : value, z.string().max(120).nullable().optional());

export const adminUserQuerySchema = z.object({
  search: optionalFilter,
  status: z.preprocess((value) => value === "" ? null : value, z.enum(["active", "suspended", "banned"]).nullable().optional()),
  role: z.preprocess((value) => value === "" ? null : value, z.enum(["user", "analyst", "support", "admin", "super_admin"]).nullable().optional()),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const restrictionSchema = z.object({
  status: z.enum(["active", "suspended", "banned"]),
  restrictedUntil: z.iso.datetime().nullable().optional(),
  reason: z.string().trim().min(3).max(500),
  transfersBlocked: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.status === "suspended" && !value.restrictedUntil) {
    context.addIssue({ code: "custom", path: ["restrictedUntil"], message: "Askı bitiş zamanı zorunludur." });
  }
});

export const limitSchema = z.object({
  monthlyLimitOverrideBytes: z.number().int().min(0).max(10 * 1024 * 1024 * 1024).nullable(),
  reason: z.string().trim().min(3).max(500),
});

export const transactionQuerySchema = z.object({
  status: optionalFilter,
  method: optionalFilter,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const logQuerySchema = z.object({
  level: optionalFilter,
  category: optionalFilter,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
