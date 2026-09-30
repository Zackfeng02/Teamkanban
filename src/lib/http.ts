import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Problem } from './security.ts';
export function failure(error: unknown) { return NextResponse.json({ error: error instanceof Problem ? error.message : error instanceof ZodError ? '输入不符合要求，请检查必填项、日期和长度' : '服务暂时无法完成请求，请稍后重试' }, { status: error instanceof Problem ? error.status : error instanceof ZodError ? 400 : 500 }); }
export function originCheck(request: Request) {
  const origin = request.headers.get('origin'); const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  const localPreview = process.env.LOCAL_PREVIEW === 'true' && !!origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
  if (origin !== expected && !localPreview) throw new Problem(403, '请求来源不正确');
}
export async function jsonBody(request: Request, max = 256000) { const reader = request.body?.getReader(); if (!reader) throw new Problem(400, '请求为空'); const chunks = []; let size = 0; try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) throw new Problem(413, '资料过大，请分批处理'); chunks.push(value); } } finally { await reader.cancel(); } try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Problem(400, '请求格式不正确'); } }
