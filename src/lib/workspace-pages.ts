export const workspacePages = [
  { id: 'board', kind: 'local', href: '/?page=board', label: '团队看板', shortLabel: '看板', icon: 'board' },
  { id: 'team', kind: 'local', href: '/?page=team', label: '团队成员', shortLabel: '团队', icon: 'team' },
  { id: 'insurance', kind: 'route', href: '/insurance-review', label: '新客报价', shortLabel: '新客报价', icon: 'insurance' },
  { id: 'renewals', kind: 'route', href: '/renewals', label: '续保任务', shortLabel: '续保', icon: 'insurance' },
] as const;
export type NavigationPage = typeof workspacePages[number]['id'];
export type LocalNavigationPage = Extract<typeof workspacePages[number], { kind: 'local' }>['id'];
