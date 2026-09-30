import type { Metadata } from 'next';
import './globals.css';
import './workspace-theme.css';
export const metadata: Metadata = { title: 'Team Kanban · 团队事务看板', description: '团队任务、资料与保险方案管理。' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="zh-CN"><body>{children}</body></html>; }
