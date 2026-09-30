import { createHash } from 'node:crypto';
export const TEST_MARKER = 'KANBAN-TEST-4726';
const knownTypes = new Set(['text', 'image', 'mixed', 'voice', 'file', 'video', 'chatrecord', 'event']);
export function messageScope(body: any): string | null {
  if (typeof body?.from?.userid !== 'string') return null;
  if (body.chattype === 'group' && typeof body.chatid !== 'string') return null;
  if (!['group', 'single'].includes(body.chattype)) return null;
  return JSON.stringify([body.from.userid, body.chattype, body.chatid ?? null]);
}
export function isStart(body: any): boolean {
  return body?.msgtype === 'text' && typeof body.text?.content === 'string' && body.text.content.includes(TEST_MARKER);
}
export function summarize(body: any) {
  const content: { path: string; kind: string; characters?: number; testLead?: boolean; testPolicy?: boolean; urlProvided?: boolean }[] = [];
  const imageRefs: { url: string; aeskey?: string }[] = [];
  let visited = 0;
  const inspect = (item: any, path: string, depth: number) => {
    if (!item || typeof item !== 'object' || depth > 6 || ++visited > 100) return;
    const kind = knownTypes.has(item.msgtype) ? item.msgtype : 'unknown';
    if (kind === 'text' && typeof item.text?.content === 'string') {
      const text = item.text.content;
      content.push({ path, kind, characters: text.length, testLead: text.includes('TEST-LEAD'), testPolicy: text.includes('TEST-POLICY') });
    } else if (kind === 'image') {
      content.push({ path, kind, urlProvided: typeof item.image?.url === 'string' });
      if (typeof item.image?.url === 'string') imageRefs.push({ url: item.image.url, aeskey: item.image.aeskey });
    } else if (kind === 'mixed' && Array.isArray(item.mixed?.msg_item)) {
      item.mixed.msg_item.slice(0, 100).forEach((entry: any, i: number) => inspect(entry, path + '.mixed[' + i + ']', depth + 1));
    } else content.push({ path, kind });
    if (item.quote) inspect(item.quote, path + '.quote', depth + 1);
  };
  inspect(body, '$', 0);
  return {
    publicSummary: {
      messageType: knownTypes.has(body?.msgtype) ? body.msgtype : 'unknown',
      chatType: ['single', 'group'].includes(body?.chattype) ? body.chattype : 'unknown',
      sourceDigest: typeof body?.msgid === 'string' ? createHash('sha256').update(body.msgid).digest('hex') : null,
      quotePresent: !!body?.quote,
      chatrecordFieldPresent: Object.hasOwn(body ?? {}, 'chatrecord'),
      content,
      mergedRecordVerified: false,
    },
    imageRefs,
  };
}

