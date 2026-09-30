'use client';
import { CheckCheck, Kanban, Scale, LogOut, UsersRound } from 'lucide-react';
import { workspacePages, type NavigationPage, type LocalNavigationPage } from '../lib/workspace-pages.ts';
import styles from './workspace-shell.module.css';
export type { NavigationPage } from '../lib/workspace-pages.ts';
export type NavigationData = { team: { name: string }; members: { active: boolean }[]; me: { id?: string; name: string; role: string }; sources?: { sender: string; taskIds: string[] }[] };
export type WorkspaceNavigationProps = { page: NavigationPage; data: NavigationData | null; onNavigate?: (page: LocalNavigationPage) => void; onLogout: () => void };
const icons = { board: Kanban, team: UsersRound, insurance: Scale };
export default function WorkspaceNavigation({ page, data, onNavigate, onLogout }: WorkspaceNavigationProps) {
  const links = workspacePages.map(({ id, kind, href, label, shortLabel, icon }) => {
    const Icon = icons[icon];
    return <a key={id} href={href} className={styles.navLink} aria-current={page === id ? 'page' : undefined} onClick={e => {
      if (onNavigate && kind === 'local' && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onNavigate(id); }
    }}><span className={styles.navIcon}><Icon aria-hidden="true"/></span><span className={styles.longLabel}>{label}</span><span className={styles.shortLabel}>{shortLabel}</span></a>;
  });
  return <aside className={styles.navigation} aria-label="工作空间导航面板" data-workspace-navigation>
    <a href="/" className={styles.brand}><span><CheckCheck aria-hidden="true"/></span>Team Kanban</a>
    <div className={styles.workspace}><span className={styles.avatar}>{data?.team.name.slice(0, 1) || 'T'}</span><div>{data?.team.name || '工作空间'}<small>{data ? `${data.members.filter(m => m.active).length} 位团队成员` : '登录后查看团队'}</small></div></div>
    <div className={styles.caption}>工作空间</div>
    <nav className={styles.links} aria-label="工作空间">{links}</nav>
    <div className={styles.user}><span className={styles.avatar}>{data?.me.name.slice(-2) || '客'}</span><div><strong>{data?.me.name || '尚未登录'}</strong><small>{data?.me.role === 'admin' ? '团队管理员' : '团队成员'}</small></div><button type="button" aria-label="退出登录" onClick={onLogout}><LogOut aria-hidden="true"/></button></div>
    <button type="button" className={styles.mobileLogout} aria-label="退出登录" onClick={onLogout}><LogOut aria-hidden="true"/><span>退出</span></button>
  </aside>;
}
