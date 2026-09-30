'use client';
import { useEffect, useRef, useState } from 'react';

export default function AccountPassword({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby="account-password-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} style={{ width: 'min(440px, calc(100vw - 32px))', maxHeight: '85dvh', overflow: 'auto', padding: 24, border: '1px solid #d8e1d7', borderRadius: 12 }}>
    <h2 id="account-password-title">统一账号密码</h2><p>修改后需要重新登录管家和 Team Kanban。</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      const form = new FormData(event.currentTarget); setBusy(true); setError('');
      try {
        const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'changePassword', current: form.get('current'), password: form.get('password') }) });
        const result = await r.json(); if (!r.ok) throw new Error(result.error || '修改失败'); onChanged();
      } catch (e) { setError(e instanceof Error ? e.message : '修改失败'); } finally { setBusy(false); }
    }}>
      <label className="field">当前密码<input name="current" type="password" autoComplete="current-password" maxLength={128} required autoFocus /></label>
      <label className="field">新密码<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存并重新登录'}</button>{' '}
      <button type="button" disabled={busy} onClick={onClose}>取消</button>
    </form>
  </dialog>;
}
