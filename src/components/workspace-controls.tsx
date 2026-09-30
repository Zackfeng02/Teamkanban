'use client';
import { useEffect, useState, type ButtonHTMLAttributes } from 'react';
import { MoreHorizontal, Plus, ArrowUpRight } from 'lucide-react';
import { MorphIcon } from 'morphicons/react';
import { Bookmark, BookmarkCheck } from 'lucide';
import styles from './workspace-controls.module.css';
/** Galaxy adaptations. Original source and MIT license: docs/galaxy-sources. */
export function ActionButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`${styles.action} ${className}`}><span>{children}</span><i aria-hidden="true"><Plus size={18}/></i></button>;
}
export function DensitySwitch({ checked, onChange, label = '紧凑模式' }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={checked} className={styles.switch} onClick={() => onChange(!checked)}><span aria-hidden="true"><i/></span>{label}</button>;
}
export function BookmarkButton({ storageKey, label }: { storageKey: string; label: string }) {
  const [state, setState] = useState({ key: storageKey, checked: false });
  useEffect(() => { let checked = false; try { checked = localStorage.getItem(storageKey) === 'true'; } catch {} setState({ key: storageKey, checked }); }, [storageKey]);
  const checked = state.key === storageKey && state.checked;
  return <button type="button" className={styles.bookmark} aria-label={`收藏${label}`} aria-pressed={checked} title="个人收藏（仅保存在本浏览器）" onClick={() => {
    setState({ key: storageKey, checked: !checked });
    try { if (checked) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, 'true'); } catch { /* Session state remains usable when browser storage is unavailable. */ }
  }}><MorphIcon icon={checked ? BookmarkCheck : Bookmark} size={16} strokeWidth={1.8} spring="snappy" reducedMotion="user" aria-hidden="true"/></button>;
}
export function TaskMenu({ label, onOpen }: { label: string; onOpen: () => void }) {
  return <details className={styles.menu} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}><summary aria-label={`${label}操作`}><MoreHorizontal size={17}/></summary><div><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onOpen(); }}>查看 / 更新任务 <ArrowUpRight size={14}/></button></div></details>;
}
