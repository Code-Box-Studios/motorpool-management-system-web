import { z } from 'zod';

// Device ingest payload (header-only device auth handled in middleware).
export const ingestGpsBodySchema = z.object({
  vehicleId: z.string().uuid(),
  tripId: z.string().uuid().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  speed: z.coerce.number().nullable().optional(),
  heading: z.coerce.number().nullable().optional(),
  engineStatus: z.string().nullable().optional() // free text; only 'on' seen today
});
export type IngestGpsBody = z.infer<typeof ingestGpsBodySchema>;

export const gpsHistoryQuerySchema = z.object({
  vehicleId: z.string().uuid(),
  tripId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500)
});
export type GpsHistoryQuery = z.infer<typeof gpsHistoryQuerySchema>;
