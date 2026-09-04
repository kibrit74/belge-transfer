import { z } from "zod";

const itemSchema = z.object({
  sizeBytes: z.number().int().min(0).max(100 * 1024 * 1024),
});

function validateMethodLimits(value, context) {
  if (value.method === "live_qr" && value.items.length !== 1) {
    context.addIssue({ code: "custom", path: ["items"], message: "Canlı QR tek dosya destekler." });
  }
  const totalBytes = value.items.reduce((total, item) => total + item.sizeBytes, 0);
  if (value.method === "live_qr" && totalBytes > 10 * 1024 * 1024) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "Canlı QR en fazla 10 MiB destekler. Daha büyük veya uzaktaki gönderimler için VaultDrop kullanın.",
    });
  }
  if (value.method === "nearby" && value.items.length !== 1) {
    context.addIssue({ code: "custom", path: ["items"], message: "Yakındaki Cihazlar tek dosya destekler." });
  }
  if (value.method === "nearby" && totalBytes > 100 * 1024 * 1024) {
    context.addIssue({ code: "custom", path: ["items"], message: "Yakındaki Cihazlar en fazla 100 MiB destekler." });
  }
  if (value.method === "qr_video" && totalBytes > 15 * 1024 * 1024) {
    context.addIssue({ code: "custom", path: ["items"], message: "QR Video toplam 15 MiB ile sınırlıdır." });
  }
  if (value.method === "secure_package" && totalBytes > 50 * 1024 * 1024) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "Şifreli Paket toplam 50 MiB ile sınırlıdır.",
    });
  }
}

export const transferSchema = z.object({
  method: z.enum(["live_qr", "nearby", "secure_package"]),
  direction: z.enum(["send", "receive"]),
  status: z.enum(["completed", "failed"]),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable().optional(),
  items: z.array(itemSchema).min(1).max(15),
}).superRefine(validateMethodLimits);

export const transferReservationSchema = z.object({
  method: z.enum(["live_qr", "nearby", "secure_package"]),
  startedAt: z.iso.datetime(),
  items: z.array(itemSchema).min(1).max(15),
}).superRefine(validateMethodLimits);

export const transferFinalizationSchema = z.object({
  status: z.enum(["completed", "failed"]),
  completedAt: z.iso.datetime(),
});

export const transferIdSchema = z.uuid();

export const transferQuerySchema = z.object({
  method: z.enum(["live_qr", "nearby", "secure_package", "qr_video"]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
