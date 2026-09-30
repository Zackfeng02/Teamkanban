import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

type JsonObject = Record<string, unknown>;
export type Issue = { path: string; code: string };
export type Entry = {
  path: string;
  kind: string;
  authorProvided: boolean;
  timeProvided: boolean;
  textLength?: number;
  textDigest?: string;
  media?: { state: 'verified-bytes' | 'missing' | 'invalid'; bytes?: number; sha256?: string };
};
export type Inspection = {
  schemaVersion: 1;
  purpose: 'offline-structure-check';
  sampleSha256: string;
  messageType: string;
  sourceMessageIdProvided: boolean;
  forwarderProvided: boolean;
  entries: Entry[];
  counts: { text: number; image: number; verifiedImages: number };
  issues: Issue[];
  structurallyComplete: boolean;
  liveIntegrationVerified: false;
};

export const digest = (data: string | Buffer, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');
const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

async function readJsonBytes(path: string): Promise<Buffer> {
  if ((await stat(path)).size > 10 * 1024 * 1024) throw new Error('JSON_TOO_LARGE');
  const bytes = await readFile(path);
  if (bytes.length > 10 * 1024 * 1024) throw new Error('JSON_TOO_LARGE');
  return bytes;
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse((await readJsonBytes(path)).toString('utf8').replace(/^\uFEFF/, ''));
}

// Media paths are local relative paths. Resolve symlinks too; never fetch arbitrary URLs.
export async function containedPath(root: string, name: string): Promise<string> {
  if (!nonempty(name) || isAbsolute(name) || name.includes(':')) throw new Error('INVALID_RELATIVE_PATH');
  const base = await realpath(root);
  const target = await realpath(resolve(base, name));
  const rel = relative(base, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('PATH_OUTSIDE_ROOT');
  return target;
}

function imageSignature(bytes: Buffer): boolean {
  return (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    || (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)))
    || (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
}

/** Candidate archive payload shape, NOT a live WeCom adapter. Calibrate with current account samples. */
export async function inspectSample(samplePath: string, mediaManifestPath?: string): Promise<Inspection> {
  const bytes = await readJsonBytes(samplePath);
  const input: unknown = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  let manifest: JsonObject = {};
  if (mediaManifestPath) {
    const parsed = await readJson(mediaManifestPath);
    if (!object(parsed) || !object(parsed.files)) throw new Error('INVALID_MEDIA_MANIFEST');
    manifest = parsed.files;
  }
  const issues: Issue[] = [];
  const entries: Entry[] = [];
  const issue = (path: string, code: string) => issues.push({ path, code });
  let visited = 0;

  async function media(data: JsonObject, path: string): Promise<Entry['media']> {
    const id = data.sdkfileid;
    if (!nonempty(id)) { issue(path, 'MEDIA_REFERENCE_MISSING'); return { state: 'missing' }; }
    const file = Object.hasOwn(manifest, id) ? manifest[id] : undefined;
    if (!nonempty(file) || !mediaManifestPath) { issue(path, 'MEDIA_BYTES_MISSING'); return { state: 'missing' }; }
    try {
      const filePath = await containedPath(dirname(mediaManifestPath), file);
      const info = await stat(filePath);
      if (!info.isFile() || info.size === 0 || info.size > 25 * 1024 * 1024) {
        issue(path, 'MEDIA_SIZE_UNSUPPORTED'); return { state: 'invalid' };
      }
      const contents = await readFile(filePath);
      if (!imageSignature(contents)) { issue(path, 'IMAGE_FORMAT_UNVERIFIED'); return { state: 'invalid' }; }
      if (data.filesize !== undefined && (!Number.isSafeInteger(Number(data.filesize)) || Number(data.filesize) !== contents.length)) {
        issue(path, 'MEDIA_SIZE_MISMATCH'); return { state: 'invalid' };
      }
      if (data.md5sum !== undefined && (typeof data.md5sum !== 'string' || !/^[a-f0-9]{32}$/i.test(data.md5sum) || digest(contents, 'md5') !== data.md5sum.toLowerCase())) {
        issue(path, 'MEDIA_DIGEST_MISMATCH'); return { state: 'invalid' };
      }
      return { state: 'verified-bytes', bytes: contents.length, sha256: digest(contents) };
    } catch { issue(path, 'MEDIA_FILE_UNREADABLE_OR_OUTSIDE_ROOT'); return { state: 'invalid' }; }
  }

  async function visit(type: unknown, value: unknown, path: string, metadata: JsonObject, depth: number): Promise<void> {
    if (++visited > 500 || depth > 8) { issue(path, 'RECORD_LIMIT_EXCEEDED'); return; }
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { issue(path, 'CONTENT_JSON_INVALID'); return; }
    }
    if (!object(value)) { issue(path, 'CONTENT_OBJECT_MISSING'); return; }
    const kind = typeof type === 'string' ? type : 'unknown';
    const entry: Entry = { path, kind, authorProvided: nonempty(metadata.from), timeProvided: typeof metadata.msgtime === 'number' && Number.isFinite(metadata.msgtime) };
    if (kind === 'text') {
      if (!nonempty(value.content)) { issue(path, 'TEXT_CONTENT_MISSING'); return; }
      entries.push({ ...entry, textLength: value.content.length, textDigest: digest(value.content) });
    } else if (kind === 'image') {
      entries.push({ ...entry, media: await media(value, path) });
    } else if (kind === 'chatrecord' || kind === 'mixed') {
      if (!Array.isArray(value.item) || value.item.length === 0) { issue(path, 'RECORD_ITEMS_MISSING'); return; }
      if (value.item.length > 500) { issue(path, 'RECORD_LIMIT_EXCEEDED'); return; }
      for (const [index, child] of value.item.entries()) {
        const nextPath = `${path}.item[${index}]`;
        if (visited >= 500) { issue(nextPath, 'RECORD_LIMIT_EXCEEDED'); break; }
        if (!object(child)) { issue(nextPath, 'ITEM_OBJECT_MISSING'); continue; }
        // Original author/time are optional. Never copy the enclosing forwarder's identity.
        await visit(child.type, child.content, nextPath, child, depth + 1);
      }
    } else {
      // Do not echo unknown type values: malformed input could contain private content.
      issue(path, 'MESSAGE_TYPE_UNSUPPORTED');
    }
  }

  const inputType = object(input) && typeof input.msgtype === 'string' ? input.msgtype : 'unknown';
  const messageType = ['text', 'image', 'chatrecord', 'mixed'].includes(inputType) ? inputType : 'unknown';
  if (!object(input)) issue('$', 'MESSAGE_OBJECT_MISSING');
  else {
    if (!nonempty(input.msgid)) issue('$', 'MESSAGE_ID_MISSING');
    if (!nonempty(input.from)) issue('$', 'FORWARDER_MISSING');
    if (input.action !== 'send') issue('$', 'SEND_ACTION_REQUIRED');
    if (input.encrypt_chat_msg !== undefined) issue('$', 'ENCRYPTED_INPUT_REQUIRES_APPROVED_ADAPTER');
    await visit(input.msgtype, input[inputType], '$', input, 0);
  }
  const counts = {
    text: entries.filter(e => e.kind === 'text').length,
    image: entries.filter(e => e.kind === 'image').length,
    verifiedImages: entries.filter(e => e.media?.state === 'verified-bytes').length,
  };
  return {
    schemaVersion: 1, purpose: 'offline-structure-check', sampleSha256: digest(bytes), messageType,
    sourceMessageIdProvided: object(input) && nonempty(input.msgid),
    forwarderProvided: object(input) && nonempty(input.from),
    entries, counts, issues, structurallyComplete: issues.length === 0 && entries.length > 0,
    liveIntegrationVerified: false,
  };
}
