export const workspacePages = [
  { id: 'board', kind: 'local', href: '/?page=board', label: '团队看板', shortLabel: '看板', icon: 'board' },
  { id: 'inbox', kind: 'local', href: '/?page=inbox', label: '资料收件箱', shortLabel: '收件箱', icon: 'inbox' },
  { id: 'team', kind: 'local', href: '/?page=team', label: '团队成员', shortLabel: '团队', icon: 'team' },
  { id: 'insurance', kind: 'route', href: '/insurance-review', label: '保险方案对比', shortLabel: '方案对比', icon: 'insurance' },
] as const;
export type NavigationPage = typeof workspacePages[number]['id'];
export type LocalNavigationPage = Extract<typeof workspacePages[number], { kind: 'local' }>['id'];
