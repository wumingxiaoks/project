import { NextResponse } from 'next/server';
import { listProviders } from '@/lib/providers';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ providers: listProviders() });
}
