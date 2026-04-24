import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../src/lib/env';
import { JOBS_QUEUE, type JobPayload } from '../src/lib/queue';
import { pollJob, startJob } from '../src/lib/jobs';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<JobPayload>(
  JOBS_QUEUE,
  async (job) => {
    const data = job.data;
    if (data.type === 'start') {
      await startJob(data.jobId);
      return;
    }
    if (data.type === 'poll') {
      await pollJob(data.jobId, data.attempt ?? 0);
      return;
    }
  },
  {
    connection,
    concurrency: 4,
  },
);

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err);
});
worker.on('completed', (job) => {
  console.log(`[worker] job ${job?.id} done (${job?.name})`);
});
worker.on('ready', () => {
  console.log('[worker] ready, queue =', JOBS_QUEUE);
});

async function shutdown() {
  console.log('[worker] shutting down...');
  await worker.close();
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
