import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';
import { boundedBody } from './media.ts';
import type { CustomerRef, Team } from './model.ts';
import { Problem } from './security.ts';

const matchType = z.enum(['clientCode', 'name', 'policyNumber']);
const customerSchema = z.object({ id: z.string().min(1).max(160), clientCode: z.string().max(160), displayName: z.string().min(1).max(160), matchTypes: z.array(matchType).max(3) }).strict();
const candidatesSchema = z.object({ items: z.array(customerSchema).max(10) }).strict();

export type ClientCoreCustomer = z.infer<typeof customerSchema>;

export function canQueryClientCoreCustomers(team: Pick<Team, 'demo'>) { return !team.demo; }

function integrationConfig() {
  const value = process.env.CLIENTCORE_KANBAN_API_BASE_URL?.trim(); const key = process.env.CLIENTCORE_KANBAN_API_KEY?.trim();
  if (!value || !key) throw new Problem(503, 'ClientCore 客户查询尚未配置');
  let base: URL;
  try { base = new URL(value.endsWith('/') ? value : value + '/'); } catch { throw new Problem(503, 'ClientCore 客户查询地址无效'); }
  const localHttp = base.protocol === 'http:' && (['127.0.0.1', 'localhost', '::1'].includes(base.hostname) || (process.env.CLIENTCORE_ALLOW_DOCKER_HOST === 'true' && base.hostname === 'host.docker.internal'));
  if ((!localHttp && base.protocol !== 'https:') || base.username || base.password) throw new Problem(503, 'ClientCore 客户查询地址必须使用 HTTPS');
  return { base, key };
}

export async function clientCoreRequest(path: string, body?:unknown) {
  const method=body===undefined?'GET':'POST';
  function canonical(value:any):any { return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value; }
  const bodyHash=body===undefined?'':createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
  const { base, key } = integrationConfig(); const url = new URL(path, base); const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', key).update(`${timestamp}\n${method}\n${url.pathname}${url.search}${method==='POST'?'\n'+bodyHash:''}`).digest('hex');
  let response: Response;
  try { response = await fetch(url, { method, body:body===undefined?undefined:JSON.stringify(body), headers: { 'Content-Type':'application/json', 'X-Kanban-Timestamp': timestamp, 'X-Kanban-Signature': signature }, redirect: 'error', signal: AbortSignal.timeout(10000) }); }
  catch { throw new Problem(503, 'ClientCore 客户查询暂不可用'); }
  if (response.status === 401 || response.status === 403) throw new Problem(503, 'ClientCore 客户查询授权失败');
  if (!response.ok) { const value=await response.json().catch(()=>({})); throw new Problem(response.status,typeof value.error==='string'?value.error:'ClientCore 请求未完成'); }
  try { return JSON.parse((await boundedBody(response, 256000)).toString('utf8')); } catch { throw new Problem(503, 'ClientCore 客户查询返回无效'); }
}

export async function searchClientCoreCustomers(query: string): Promise<ClientCoreCustomer[]> {
  const body = candidatesSchema.parse(await clientCoreRequest(`client-candidates?q=${encodeURIComponent(query)}`));
  return body.items;
}

export async function resolveClientCoreCustomer(clientCoreId: string): Promise<CustomerRef> {
  const value = customerSchema.parse(await clientCoreRequest(`client-candidates/${encodeURIComponent(clientCoreId)}`));
  return { clientCoreId: value.id, clientCode: value.clientCode, displayName: value.displayName };
}
