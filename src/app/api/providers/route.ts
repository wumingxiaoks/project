import { NextResponse } from 'next/server';
import { describeProviders } from '@/lib/providers';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ providers: describeProviders() });
}
