'use client';
import type { ReactNode } from 'react';
import WorkspaceNavigation, { type WorkspaceNavigationProps } from './workspace-navigation';
import { workspacePages } from '../lib/workspace-pages.ts';
import styles from './workspace-shell.module.css';
/** Mandatory outer layout for workspace pages. Page CSS belongs inside content, never on navigation. */
export default function WorkspaceShell({ children, status, className, ...navigation }: WorkspaceNavigationProps & { children: ReactNode; status?: ReactNode; className?: string }) {
  return <div className={styles.shell} data-workspace-shell>
    <WorkspaceNavigation {...navigation}/>
    <div className={styles.content} data-workspace-content>
      <header className={styles.header}><div>{navigation.data?.team.name || '工作空间'}<span>/</span><strong>{workspacePages.find(item => item.id === navigation.page)?.label}</strong></div><div className={styles.status}>{status}</div></header>
      <div className={className}>{children}</div>
    </div>
  </div>;
}
