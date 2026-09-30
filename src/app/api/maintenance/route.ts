import { NextResponse } from 'next/server';
import { maintainLocalDatabase } from '../../../lib/maintenance.ts';
import { failure } from '../../../lib/http.ts';
export const runtime = 'nodejs';
export const maxDuration = 180;
export async function POST(request: Request) {
  try { return NextResponse.json(await maintainLocalDatabase(request.headers.get('authorization')), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}
