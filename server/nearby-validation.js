import { z } from "zod";

const MAX_SDP_LENGTH = 12 * 1024;
const MAX_ICE_CANDIDATE_LENGTH = 2 * 1024;

export const nearbyRoomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);
export const nearbyEmptyBodySchema = z.object({}).strict();
export const nearbyAfterSequenceSchema = z.coerce.number().int().min(0).max(0x7fffffff).default(0);

const offerPayloadSchema = z.object({
  type: z.literal("offer"),
  sdp: z.string().min(1).max(MAX_SDP_LENGTH),
}).strict();

const answerPayloadSchema = z.object({
  type: z.literal("answer"),
  sdp: z.string().min(1).max(MAX_SDP_LENGTH),
}).strict();

const icePayloadSchema = z.object({
  candidate: z.string().min(1).max(MAX_ICE_CANDIDATE_LENGTH),
  sdpMid: z.string().max(256).nullable(),
  sdpMLineIndex: z.number().int().min(0).max(65535).nullable(),
}).strict();

const emptyPayloadSchema = z.object({}).strict();

export const nearbySignalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("offer"), sequence: z.number().int().min(0).max(0x7fffffff), payload: offerPayloadSchema }).strict(),
  z.object({ kind: z.literal("answer"), sequence: z.number().int().min(0).max(0x7fffffff), payload: answerPayloadSchema }).strict(),
  z.object({ kind: z.literal("ice"), sequence: z.number().int().min(0).max(0x7fffffff), payload: icePayloadSchema }).strict(),
  z.object({ kind: z.literal("ready"), sequence: z.number().int().min(0).max(0x7fffffff), payload: emptyPayloadSchema }).strict(),
  z.object({ kind: z.literal("close"), sequence: z.number().int().min(0).max(0x7fffffff), payload: emptyPayloadSchema }).strict(),
]).superRefine((value, context) => {
  if (Buffer.byteLength(JSON.stringify(value.payload), "utf8") > 16 * 1024) {
    context.addIssue({ code: "custom", path: ["payload"], message: "Bağlantı mesajı çok büyük." });
  }
});
