import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteCredential,
  updateCredential,
} from '@/lib/credentials';

export const runtime = 'nodejs';

const patchSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  config: z.record(z.string().optional()).optional(),
  secrets: z.record(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const row = await updateCredential(id, parsed.data);
    return NextResponse.json({ credential: row });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteCredential(id);
  return NextResponse.json({ ok: true });
}
