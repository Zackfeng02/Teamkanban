import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authenticate } from '../../../lib/security.ts';
import { mutateTeam, readTeam } from '../../../lib/store.ts';
import { applyAction, snapshot } from '../../../lib/domain.ts';
import { failure, jsonBody, originCheck } from '../../../lib/http.ts';
import { aiStatus } from '../../../lib/ai.ts';
import { canQueryClientCoreCustomers, resolveClientCoreCustomer } from '../../../lib/clientcore.ts';
import { Problem } from '../../../lib/security.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { try { const actor = await authenticate((await cookies()).get('kanban_session')?.value); return NextResponse.json({ ...snapshot((await readTeam(actor.teamId))!, actor), ai: aiStatus() }, { headers: { 'Cache-Control': 'no-store' } }); } catch (error) { return failure(error); } }
async function resolveCustomerReference(task: any) {
  if (!task || typeof task !== 'object' || task.customerRef === undefined || task.customerRef === null) return task;
  if (typeof task.customerRef !== 'object' || typeof task.customerRef.clientCoreId !== 'string') throw new Problem(400, '客户关联格式不正确');
  const customerRef = await resolveClientCoreCustomer(task.customerRef.clientCoreId);
  return { ...task, customer: customerRef.displayName, customerRef };
}
function requestsCustomerReference(body: any) {
  if (body?.op === 'confirm') return Array.isArray(body.tasks) && body.tasks.some((task: any) => task?.customerRef !== undefined && task.customerRef !== null);
  if (body?.op === 'createTask') return body.task?.customerRef !== undefined && body.task?.customerRef !== null;
  if (body?.op === 'updateTask') return body.patch?.customerRef !== undefined && body.patch?.customerRef !== null;
  return false;
}
async function resolveCustomerReferences(actor: { teamId: string }, body: any) {
  if (requestsCustomerReference(body)) {
    const team = await readTeam(actor.teamId);
    if (!team || !canQueryClientCoreCustomers(team)) throw new Problem(403, '演示空间不能查询 ClientCore 客户');
  }
  if (body?.op === 'confirm') {
    if (!Array.isArray(body.tasks) || body.tasks.length > 12) return body;
    return { ...body, tasks: await Promise.all(body.tasks.map(resolveCustomerReference)) };
  }
  if (body?.op === 'createTask' && body.task) return { ...body, task: await resolveCustomerReference(body.task) };
  if (body?.op === 'updateTask' && body.patch) return { ...body, patch: await resolveCustomerReference(body.patch) };
  return body;
}
export async function POST(request: Request) { try { originCheck(request); const actor = await authenticate((await cookies()).get('kanban_session')?.value); const body = await resolveCustomerReferences(actor, await jsonBody(request)); const result = await mutateTeam(actor.teamId, team => applyAction(team, actor, body)); return NextResponse.json(result); } catch (error) { return failure(error); } }
