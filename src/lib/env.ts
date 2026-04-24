import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  WEBHOOK_SECRET: z.string().min(8).default('dev-webhook-secret-change-me'),
  // 32-byte hex (or any string >= 16 chars, will be KDF'd). Encrypts provider secrets at rest.
  SECRETS_KEY: z.string().min(16).default('dev-secrets-key-change-me-in-prod'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === 'true'),

});

export const env = schema.parse(process.env);

export type Env = typeof env;
