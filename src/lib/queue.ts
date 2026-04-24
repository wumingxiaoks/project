import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

const globalForQueue = globalThis as unknown as {
  redis?: IORedis;
  jobsQueue?: Queue;
  jobsEvents?: QueueEvents;
};

export const redis =
  globalForQueue.redis ??
  new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

if (env.NODE_ENV !== 'production') globalForQueue.redis = redis;

export const JOBS_QUEUE = 'video-jobs';

export const jobsQueue =
  globalForQueue.jobsQueue ??
  new Queue(JOBS_QUEUE, { connection: redis });

if (env.NODE_ENV !== 'production') globalForQueue.jobsQueue = jobsQueue;

export const jobsEvents =
  globalForQueue.jobsEvents ?? new QueueEvents(JOBS_QUEUE, { connection: redis });
if (env.NODE_ENV !== 'production') globalForQueue.jobsEvents = jobsEvents;

export interface PollJobPayload {
  type: 'poll';
  jobId: string;
  attempt?: number;
}

export interface StartJobPayload {
  type: 'start';
  jobId: string;
}

export type JobPayload = PollJobPayload | StartJobPayload;
