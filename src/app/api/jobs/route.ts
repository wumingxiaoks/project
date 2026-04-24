import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { createJob } from '@/lib/jobs';

export const runtime = 'nodejs';

const createSchema = z.object({
  provider: z.enum(['replicate', 'kling', 'minimax']),
  model: z.string().min(1),
  mode: z.enum(['image-to-video', 'text-to-video', 'act', 'talking-head']),
  prompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  inputImageAssetId: z.string().optional(),
  inputVideoAssetId: z.string().optional(),
  inputAudioAssetId: z.string().optional(),
  params: z.record(z.unknown()).optional(),
});

export async function GET() {
  const rows = await db
    .select()
    .from(schema.jobs)
    .orderBy(desc(schema.jobs.createdAt))
    .limit(100);
  return NextResponse.json({ jobs: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const job = await createJob(parsed.data);
  return NextResponse.json({ job });
}
