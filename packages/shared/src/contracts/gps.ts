import { z } from 'zod';
import { trackerPacketBodySchema } from './tracker-packets.js';

// Device ingest payload (header-only device auth handled in middleware).
export const ingestGpsBodySchema = z
  .object({
    vehicleId: z.string().uuid(),
    deviceId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    protocol: z.literal('h02').optional(),
    packet: trackerPacketBodySchema.optional(),
    tripId: z.string().uuid().nullable().optional(),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    speed: z.coerce.number().nullable().optional(),
    heading: z.coerce.number().nullable().optional(),
    engineStatus: z.string().nullable().optional() // free text; only 'on' seen today
  })
  .superRefine((body, ctx) => {
    if (Boolean(body.deviceId) !== Boolean(body.protocol)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deviceId'],
        message: 'Identified ingest requires deviceId and protocol'
      });
    }
    if (
      body.packet &&
      (!body.deviceId ||
        body.packet.deviceId !== body.deviceId ||
        body.packet.kind !== 'position' ||
        body.packet.latitude !== body.latitude ||
        body.packet.longitude !== body.longitude)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['packet'],
        message:
          'Packet identity and coordinates must match the identified position'
      });
    }
  });
export type IngestGpsBody = z.infer<typeof ingestGpsBodySchema>;

export const gpsHistoryQuerySchema = z.object({
  vehicleId: z.string().uuid(),
  tripId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500)
});
export type GpsHistoryQuery = z.infer<typeof gpsHistoryQuerySchema>;
