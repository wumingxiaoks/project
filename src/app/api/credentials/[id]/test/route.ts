import { NextRequest, NextResponse } from 'next/server';
import { testCredential } from '@/lib/credentials';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await testCredential(id);
  return NextResponse.json(result);
}
