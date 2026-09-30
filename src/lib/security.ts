import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { taskTypes, priorities } from './task-workflow.ts';
import type { Actor, Team } from './model.ts';
import { readTeam } from './store.ts';
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function passwordHash(value: string) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(value, salt, 64).toString('hex'); }
export function checkPassword(value: string, encoded: string) { const [salt, digest] = encoded.split(':'); if (!salt || !digest) return false; const expected = Buffer.from(digest, 'hex'); const actual = scryptSync(value, salt, 64); return expected.length === actual.length && timingSafeEqual(expected, actual); }
export class Problem extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
export function requireMember(team: Team, actor: Actor, admin = false) { const member = team.members.find(m => m.id === actor.memberId && m.active); if (team.id !== actor.teamId || !member) throw new Problem(401, '登录已失效，请重新登录'); if (admin && member.role !== 'admin') throw new Problem(403, '此操作需要管理员'); return member; }
export async function authenticate(cookie: string | undefined): Promise<Actor> {
  const [teamId, secret] = (cookie || '').split('.');
  if (!teamId || !secret) throw new Problem(401, '请先登录');
  const team = await readTeam(teamId); const session = team?.sessions.find(s => s.hash === hash(secret) && s.expires > Date.now());
  if (!team || !session) throw new Problem(401, '请先登录');
  const actor = { teamId, memberId: session.memberId }; requireMember(team, actor); return actor;
}
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const date = new Date(s); return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === s; }).nullable();
export const customerRefSchema = z.object({ clientCoreId: z.string().trim().min(1).max(160), clientCode: z.string().trim().max(160), displayName: z.string().trim().min(1).max(160) }).strict();
export const draftSchema = z.object({ title: z.string().trim().min(1).max(160), type: z.enum(taskTypes), priority:z.enum(priorities).optional().default('normal'), insuranceLine:z.enum(['auto','home','combined','other']).optional().default('other'), customer: z.string().max(160), customerRef: customerRefSchema.nullable().optional().default(null), description: z.string().max(8000), checklist: z.array(z.string().trim().min(1).max(500)).max(40), dueDate: dateSchema, ownerId: z.string().nullable() }).strict();
export const aiSchema = z.object({ tasks: z.array(draftSchema.omit({ ownerId: true, customerRef: true })).min(1).max(12) }).strict();
