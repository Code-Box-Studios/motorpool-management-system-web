import { z } from 'zod';

// Validated process env — fail fast on boot if anything required is missing.
const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
  UPLOADS_DIR: z.string().default('uploads')
});

const env = envSchema.parse(process.env);

export const config = {
  databaseUrl: env.DATABASE_URL,
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  jwtSecret: env.JWT_SECRET,
  // Spec §5: cross-site production (Vercel↔Railway) needs SameSite=None;
  // same-site local dev wants Lax. Explicit env always wins.
  cookieSameSite:
    env.COOKIE_SAMESITE ?? (env.NODE_ENV === 'production' ? 'none' : 'lax'),
  uploadsDir: env.UPLOADS_DIR
};
