import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { decryptFile } from '@wecom/aibot-node-sdk';
import type { Media } from './model.ts';
const limit = 25 * 1024 * 1024;
export async function boundedBody(response: Response, max = limit): Promise<Buffer> {
  if (!response.ok || Number(response.headers.get('content-length')) > max || !response.body) throw new Error('DOWNLOAD_FAILED');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > max) throw new Error('FILE_TOO_LARGE'); chunks.push(value); } } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
export function mediaMime(buffer: Buffer): string {
  if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (['GIF87a','GIF89a'].includes(buffer.toString('ascii', 0, 6))) return 'image/gif';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (/^%PDF-\d\.\d/.test(buffer.toString('ascii', 0, 8))) return 'application/pdf';
  throw new Error('UNSUPPORTED_ATTACHMENT');
}
export async function downloadMedia(media: Media) {
  const url = new URL(media.url || '');
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password || !['weixin.qq.com','qpic.cn','myqcloud.com'].some(h => url.hostname === h || url.hostname.endsWith('.' + h))) throw new Error('UNTRUSTED_MEDIA_HOST');
  const encrypted = await boundedBody(await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) }));
  const buffer = media.aeskey ? decryptFile(encrypted, media.aeskey) : encrypted;
  if (!buffer.length || buffer.length > limit) throw new Error('FILE_TOO_LARGE');
  return { buffer, mime: mediaMime(buffer) };
}
function storage() {
  if(process.env.LOCAL_PREVIEW==='true')return null;
  if (!process.env.S3_BUCKET) { if (process.env.NODE_ENV === 'production' && process.env.LOCAL_PREVIEW !== 'true') throw new Error('PRIVATE_STORAGE_REQUIRED'); return null; }
  return new S3Client({ region: process.env.S3_REGION || 'us-east-1', endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: !!process.env.S3_ENDPOINT });
}
function validKey(key: string) { if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(key)) throw new Error('INVALID_OBJECT_KEY'); return key; }
export async function putMedia(key: string, buffer: Buffer, mime: string) {
  validKey(key); const s3 = storage();
  if (s3) { await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: mime })); return; }
  const target = resolve('.data/objects', key); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, buffer);
}
export async function getMedia(key: string): Promise<Buffer> {
  validKey(key); const s3 = storage(); if (!s3) return readFile(resolve('.data/objects', key));
  const result = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); if (!result.Body || (result.ContentLength ?? 0) > limit) throw new Error('MISSING_MEDIA'); return Buffer.from(await result.Body.transformToByteArray());
}

export async function deleteMedia(key: string) { validKey(key); const s3 = storage(); if (s3) await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); else await unlink(resolve('.data/objects', key)); }
