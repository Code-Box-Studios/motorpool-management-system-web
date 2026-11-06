import { z } from 'zod';

export const TRACKER_PACKET_KINDS = [
  'position',
  'heartbeat',
  'unknown',
  'fragment',
  'socket_error'
] as const;

export const TRACKER_PACKET_OUTCOMES = [
  'received',
  'saved',
  'heartbeat',
  'invalid_fix',
  'device_unavailable',
  'unsupported',
  'incomplete',
  'oversized',
  'resolution_error',
  'forward_error',
  'socket_error'
] as const;

const utcTimestamp = z.string().max(32).datetime();
const nullableNumber = z.number().finite().nullable();
const boundedText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !value.includes('\u0000'), 'Text cannot contain NUL');

export const trackerPacketBodySchema = z
  .object({
    id: z.string().uuid(),
    revision: z.union([z.literal(0), z.literal(1)]),
    receivedAt: utcTimestamp,
    connectionId: z.string().uuid(),
    peer: boundedText(256),
    deviceId: boundedText(128).nullable(),
    vehicleId: z.string().uuid().nullable(),
    messageType: boundedText(32).nullable(),
    kind: z.enum(TRACKER_PACKET_KINDS),
    outcome: z.enum(TRACKER_PACKET_OUTCOMES),
    rawHex: z
      .string()
      .max(16384)
      .regex(/^(?:[0-9a-fA-F]{2})*$/),
    fixTime: utcTimestamp.nullable(),
    latitude: nullableNumber,
    longitude: nullableNumber,
    speed: nullableNumber,
    heading: nullableNumber,
    ignition: z.boolean().nullable(),
    reason: boundedText(2000).nullable()
  })
  .superRefine((packet, ctx) => {
    if ((packet.revision === 0) !== (packet.outcome === 'received')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message:
          'Revision 0 requires received; revision 1 requires a final outcome'
      });
    }
  });

export type TrackerPacketBody = z.infer<typeof trackerPacketBodySchema>;
export type TrackerPacketLog = TrackerPacketBody & { storedAt: string };

const packetCursor = z
  .string()
  .max(100)
  .refine((value) => {
    const parts = value.split('|');
    return (
      parts.length === 2 &&
      utcTimestamp.safeParse(parts[0]).success &&
      z.string().uuid().safeParse(parts[1]).success
    );
  }, 'Invalid packet cursor');

export const trackerPacketQuerySchema = z
  .object({
    deviceId: boundedText(128).optional(),
    search: boundedText(128).optional(),
    outcome: z.enum(TRACKER_PACKET_OUTCOMES).optional(),
    kind: z.enum(TRACKER_PACKET_KINDS).optional(),
    from: utcTimestamp.optional(),
    to: utcTimestamp.optional(),
    cursor: packetCursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25)
  })
  .superRefine((query, ctx) => {
    if (
      query.from &&
      query.to &&
      Date.parse(query.from) > Date.parse(query.to)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'End time must be on or after start time'
      });
    }
  });

export type TrackerPacketQuery = z.infer<typeof trackerPacketQuerySchema>;
export type TrackerPacketPage = {
  data: TrackerPacketLog[];
  count: number;
  nextCursor: string | null;
};
