// Run while the local preview server is stopped. Creates only synthetic test data.
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { emptyTeam } from '../src/lib/seed.ts';
import { createTeam } from '../src/lib/store.ts';
import { hash, token } from '../src/lib/security.ts';
import { putMedia } from '../src/lib/media.ts';
const team = emptyTeam('HTTP 验收 · 虚构资料', true); const adminId = randomUUID(); const memberId = randomUUID();
team.members.push({ id: adminId, name: '测试管理员', login: 'test-admin', password: '', role: 'admin', active: true }, { id: memberId, name: '测试成员', login: 'test-member', password: '', role: 'member', active: true });
const adminToken = token(); const memberToken = token(); for (const [secret, memberId] of [[adminToken, adminId], [memberToken, team.members[1].id]]) team.sessions.push({ hash: hash(secret), memberId, expires: Date.now() + 3600000 });
const sourceId = randomUUID(); const mediaId = randomUUID(); const key = team.id + '/' + mediaId;
const buffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
await putMedia(key, buffer, 'image/gif');
team.sources.push({ id: sourceId, sender: adminId, messageId: 'synthetic-gif', state: 'ready', taskIds: [], receivedAt: new Date().toISOString(), entries: [{ kind: 'image', mediaId }] });
team.media.push({ id: mediaId, sourceId, key, mime: 'image/gif', bytes: buffer.length }); await createTeam(team);
await writeFile('.data/http-smoke.json', JSON.stringify({ teamId: team.id, admin: team.id + '.' + adminToken, member: team.id + '.' + memberToken, memberId, sourceId, mediaId }), { mode: 0o600 }); console.log('HTTP 验收资料已准备'); process.exit(0);
