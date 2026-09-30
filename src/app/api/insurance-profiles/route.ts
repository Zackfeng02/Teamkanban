import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate } from '../../../lib/security.ts';
import { failure, jsonBody, originCheck } from '../../../lib/http.ts';
import { listCloudProfiles, saveCloudProfile, importCloudProfiles } from '../../../lib/insurance-cloud-store.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { const actor = await authenticate((await cookies()).get('kanban_session')?.value);
    return NextResponse.json({ profiles: await listCloudProfiles(actor) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    originCheck(request);
    const actor = await authenticate((await cookies()).get('kanban_session')?.value);
    const body = await jsonBody(request, 2_000_000);
    if (body.op === 'import') return NextResponse.json(await importCloudProfiles(actor, z.array(z.unknown()).min(1).max(100).parse(body.profiles)));
    return NextResponse.json({ profile: await saveCloudProfile(actor, body.profile) });
  } catch (error) { return failure(error); }
}
