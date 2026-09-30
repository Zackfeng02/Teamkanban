"use client";
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCheck, Building2, GraduationCap, House, Loader2 } from 'lucide-react';
import styles from './unified-login.module.css';
const applications = [
  { name: 'Team Kanban', description: 'Tasks, renewals & team collaboration', href: '/', icon: CheckCheck },
  { name: 'ClientCore BMS', description: 'Clients, policies & source documents', href: 'https://clientcore.zmservice.ca/auth/start', icon: Building2 },
  { name: 'Grade128', description: 'Learning & family progress', href: 'https://grade128.zmservice.ca/auth/start', icon: GraduationCap },
  { name: 'Guanjia', description: 'Receipts & household records', href: 'https://guanjia.zmservice.ca/auth/start', icon: House },
];
function continuation() {
  const target = new URLSearchParams(location.search).get('sso');
  return target?.startsWith('/api/sso/authorize?') ? target : null;
}
export default function UnifiedLogin() {
  const [signedIn, setSignedIn] = useState(false), [checking, setChecking] = useState(true);
  const [login, setLogin] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let active = true;
    fetch('/api/state', { cache: 'no-store' }).then(async response => {
      if (!active) return;
      if (response.ok) { const target = continuation(); if (target) { location.assign(target); return; } setSignedIn(true); }
      else if (response.status !== 401) setError('Unable to check your session. Please try again.');
    }).catch(() => { if (active) setError('Unable to connect. Please try again.'); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'login', login, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
      setPassword(''); const target = continuation();
      if (target) location.assign(target); else setSignedIn(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <header className={styles.brand}><span>ZM</span><strong>ZM Services</strong><small>YOUR CONNECTED WORKSPACE</small></header>
    <section className={styles.layout}>
      <div className={styles.intro}><p className={styles.eyebrow}>ONE ACCOUNT. FOUR WORKSPACES.</p><h1>Everything in<br/>its place.</h1><p className={styles.description}>Your work, learning and home.<br/>Connected through your existing Kanban account.</p>
        <div className={styles.apps}>{applications.map(({ name, description, icon: Icon, href }, index) => <div className={styles.app} key={name}><Icon size={22}/><div><strong>{name}</strong><span>{description}</span></div>{signedIn ? <a href={href} aria-label={'Open ' + name}><ArrowRight size={20}/></a> : <small>0{index + 1}</small>}</div>)}</div>
      </div>
      <div className={styles.panel}>{checking ? <p role="status"><Loader2 className={styles.spinner} size={20}/> Checking your session…</p> : signedIn ? <><p className={styles.eyebrow}>SIGNED IN</p><h2>Welcome back.</h2><p>Choose a workspace to continue.</p><a className={styles.primary} href="/">Open Team Kanban <ArrowRight size={18}/></a><p className={styles.note}>Each workspace keeps its existing access permissions.</p></> : <><p className={styles.eyebrow}>WELCOME BACK</p><h2>Sign in</h2><p>Use your existing Kanban username and password.</p><form onSubmit={signIn}><label>Username<input autoComplete="username" name="username" required maxLength={80} value={login} onChange={e => setLogin(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" name="password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/></label>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.primary} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18}/></button></form><a className={styles.help} href="/">Account recovery & invitations</a><p className={styles.note}>Your existing tasks, team and records stay with your account.</p></>}</div>
    </section><footer className={styles.footer}>ZM SERVICES <span>One sign-in. Access where you belong.</span></footer>
  </main>;
}
