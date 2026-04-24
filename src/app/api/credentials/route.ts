import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createCredential,
  listCredentials,
} from '@/lib/credentials';

export const runtime = 'nodejs';

const createSchema = z.object({
  provider: z.enum(['replicate', 'kling', 'minimax']),
  label: z.string().min(1).max(80),
  config: z.record(z.string().optional()).optional(),
  secrets: z.record(z.string()),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  const rows = await listCredentials();
  return NextResponse.json({ credentials: rows });
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
  try {
    const row = await createCredential(parsed.data);
    return NextResponse.json({ credential: row });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
