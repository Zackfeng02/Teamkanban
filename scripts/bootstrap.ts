import { hash, token } from '../src/lib/security.ts';
import { createTeam } from '../src/lib/store.ts';
import { emptyTeam } from '../src/lib/seed.ts';
const team = emptyTeam(process.argv[2] || '我的团队'); const secret = token();
team.invitations.push({ hash: hash(secret), role: 'admin', expires: Date.now() + 86400000 }); await createTeam(team);
console.log(JSON.stringify({ teamId: team.id, invitation: team.id + '.' + secret }));
process.exit(0);
