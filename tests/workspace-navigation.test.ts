import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { workspacePages } from '../src/lib/workspace-pages.ts';
const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
// Render the actual TSX components; CSS-module names are deterministic in this Node-only harness.
const oldTsx = require.extensions['.tsx'];
const oldCss = require.extensions['.css'];
require.extensions['.tsx'] = (module: any, file: string) => module._compile(swc.transformSync(readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' }, module: { type: 'commonjs' } }).code, file);
require.extensions['.css'] = (module: any) => { module.exports = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) }); };
const Shell = require('../src/components/workspace-shell.tsx').default;
if (oldTsx) require.extensions['.tsx'] = oldTsx; else delete require.extensions['.tsx'];
if (oldCss) require.extensions['.css'] = oldCss; else delete require.extensions['.css'];
const data = { team: { name: 'Demo' }, me: { id: 'me', name: 'Member', role: 'admin' }, members: [{ active: true }], sources: [{ sender: 'me', taskIds: [] }, { sender: 'other', taskIds: [] }, { sender: 'me', taskIds: ['task'] }] };
const render = (page: string, className = 'app') => renderToStaticMarkup(React.createElement(Shell, { page, className, data, onLogout() {} }, React.createElement('main', null, 'Page content')));
test('every workspace page uses one shared navigation with one active real link', () => {
  for (const page of workspacePages) {
    const html = render(page.id);
    assert.equal((html.match(/data-workspace-navigation=/g) || []).length, 1);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    for (const item of workspacePages) assert.equal((html.match(new RegExp(`href="${item.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length, 1);
    assert.ok(html.includes(`href="${page.href}" class="navLink" aria-current="page"`));
  }
});
test('page styling is outside the navigation subtree and does not change its markup', () => {
  const app = render('insurance', 'app');
  const insurance = render('insurance', 'ir');
  const nav = (html: string) => html.slice(html.indexOf('<aside'), html.indexOf('</aside>') + 8);
  assert.equal(nav(app), nav(insurance));
  assert.ok(insurance.indexOf('</aside>') < insurance.indexOf('class="ir"'));
  assert.equal((insurance.match(/data-workspace-content=/g) || []).length, 1);
});
test('inbox badge uses only the current member unassigned sources on all pages', () => {
  for (const page of workspacePages) assert.ok(render(page.id).includes('aria-label="1 份待整理资料"'));
});
