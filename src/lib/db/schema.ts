import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const providerEnum = pgEnum('provider', [
  'replicate',
  'kling',
  'minimax',
]);

export const credentials = pgTable(
  'credentials',
  {
    id: text('id').primaryKey(),
    provider: providerEnum('provider').notNull(),
    label: text('label').notNull(),
    isDefault: text('is_default').notNull().default('false'),
    // Encrypted JSON blob of secret fields. Format: "<ivHex>:<authTagHex>:<cipherHex>"
    secretEncrypted: text('secret_encrypted').notNull(),
    // Non-secret fields (e.g. API base URL, group id overrides, region).
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastTestOk: text('last_test_ok'),
    lastTestMessage: text('last_test_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    providerIdx: index('credentials_provider_idx').on(t.provider),
  }),
);

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // 'image' | 'video' | 'audio'
    mimeType: text('mime_type').notNull(),
    bytes: integer('bytes').notNull().default(0),
    s3Key: text('s3_key').notNull(),
    url: text('url').notNull(),
    sourceUrl: text('source_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kindIdx: index('assets_kind_idx').on(t.kind),
  }),
);

export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    provider: providerEnum('provider').notNull(),
    credentialId: text('credential_id'),
    model: text('model').notNull(),
    mode: text('mode').notNull(), // 'image-to-video' | 'act' | 'talking-head' | ...
    status: jobStatusEnum('status').notNull().default('queued'),
    prompt: text('prompt'),
    negativePrompt: text('negative_prompt'),
    inputImageAssetId: text('input_image_asset_id'),
    inputVideoAssetId: text('input_video_asset_id'),
    inputAudioAssetId: text('input_audio_asset_id'),
    outputAssetId: text('output_asset_id'),
    params: jsonb('params').$type<Record<string, unknown>>().default({}),
    providerTaskId: text('provider_task_id'),
    providerRaw: jsonb('provider_raw').$type<Record<string, unknown>>(),
    error: text('error'),
    progress: integer('progress').notNull().default(0),
    durationSec: integer('duration_sec'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('jobs_status_idx').on(t.status),
    providerIdx: index('jobs_provider_idx').on(t.provider),
    createdAtIdx: index('jobs_created_at_idx').on(sql`${t.createdAt} DESC`),
  }),
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
