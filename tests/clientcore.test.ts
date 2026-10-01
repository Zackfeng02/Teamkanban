import test from 'node:test';
import assert from 'node:assert/strict';
import { canQueryClientCoreCustomers, clientCoreRequest, resolveClientCoreCustomer, searchClientCoreCustomers } from '../src/lib/clientcore.ts';

test('local and hosted deployments share the HTTPS default and require a private key', async () => {
  const originalFetch = globalThis.fetch;
  const keys = ['CLIENTCORE_KANBAN_API_BASE_URL', 'CLIENTCORE_KANBAN_API_KEY'];
  const original = { ...process.env };
  const calls: string[] = [];
  globalThis.fetch = async url => { calls.push(String(url)); return Response.json({ items: [] }); };
  try {
    delete process.env.CLIENTCORE_KANBAN_API_BASE_URL;
    delete process.env.CLIENTCORE_KANBAN_API_KEY;
    await assert.rejects(searchClientCoreCustomers('Synthetic'), /尚未配置/);
    assert.equal(calls.length, 0);
    process.env.CLIENTCORE_KANBAN_API_KEY = 'synthetic-integration-key';
    for (const value of [undefined, '', '   ']) {
      if (value === undefined) delete process.env.CLIENTCORE_KANBAN_API_BASE_URL;
      else process.env.CLIENTCORE_KANBAN_API_BASE_URL = value;
      assert.deepEqual(await searchClientCoreCustomers('Synthetic'), []);
    }
    assert.equal(calls.length, 3);
    assert.ok(calls.every(url => url === 'https://clientcore.zmservice.ca/api/integrations/team-kanban/v1/client-candidates?q=Synthetic'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});

test('ClientCore lookup signs a server-only request and retains only approved fields', async () => {
  const originalFetch = globalThis.fetch; const original = { ...process.env };
  Object.assign(process.env, { CLIENTCORE_KANBAN_API_BASE_URL: 'http://127.0.0.1:5174/integrations/team-kanban', CLIENTCORE_KANBAN_API_KEY: 'synthetic-integration-key' });
  const calls: any[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(String(url).includes('/client-candidates/client-1')
      ? { id: 'client-1', clientCode: 'CC-100', displayName: '测试客户', matchTypes: ['clientCode'] }
      : { items: [{ id: 'client-1', clientCode: 'CC-100', displayName: '测试客户', matchTypes: ['name'] }] });
  };
  try {
    assert.deepEqual(await searchClientCoreCustomers('测试'), [{ id: 'client-1', clientCode: 'CC-100', displayName: '测试客户', matchTypes: ['name'] }]);
    assert.deepEqual(await resolveClientCoreCustomer('client-1'), { clientCoreId: 'client-1', clientCode: 'CC-100', displayName: '测试客户' });
    assert.match(calls[0].url, /client-candidates\?q=/);
    assert.match(String(calls[0].init.headers['X-Kanban-Signature']), /^[a-f0-9]{64}$/);
    assert.equal(calls[0].init.headers.authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ['CLIENTCORE_KANBAN_API_BASE_URL', 'CLIENTCORE_KANBAN_API_KEY']) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});

test('demo teams cannot use the ClientCore customer lookup', () => {
  assert.equal(canQueryClientCoreCustomers({ demo: true }), false);
  assert.equal(canQueryClientCoreCustomers({ demo: false }), true);
});

test('versioned ClientCoreBMS requests retain the prefix and surface actionable conflicts', async () => {
  const originalFetch = globalThis.fetch;
  const keys = ['CLIENTCORE_KANBAN_API_BASE_URL', 'CLIENTCORE_KANBAN_API_KEY'];
  const original = { ...process.env };
  const calls: string[] = [];
  process.env.CLIENTCORE_KANBAN_API_BASE_URL = 'http://127.0.0.1:5190/api/integrations/team-kanban/v1';
  process.env.CLIENTCORE_KANBAN_API_KEY = 'synthetic-integration-key';
  globalThis.fetch = async url => {
    calls.push(String(url));
    return Response.json({ message: 'The record has changed. Reload and review.' }, { status: 409 });
  };
  try {
    await assert.rejects(clientCoreRequest('clients/client-1/workflow-targets'),
      (error: any) => error.status === 409 && error.message === 'The record has changed. Reload and review.');
    assert.equal(calls[0], 'http://127.0.0.1:5190/api/integrations/team-kanban/v1/clients/client-1/workflow-targets');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  }
});

test('Docker host HTTP requires explicit opt-in and rejects lookalike hosts', async () => {
  const originalFetch = globalThis.fetch;
  const keys = ['CLIENTCORE_KANBAN_API_BASE_URL', 'CLIENTCORE_KANBAN_API_KEY', 'CLIENTCORE_ALLOW_DOCKER_HOST'];
  const original = { ...process.env };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ items: [] }); };
  try {
    process.env.CLIENTCORE_KANBAN_API_KEY = 'synthetic-key';
    process.env.CLIENTCORE_KANBAN_API_BASE_URL = 'http://host.docker.internal:5174/api/';
    delete process.env.CLIENTCORE_ALLOW_DOCKER_HOST;
    await assert.rejects(searchClientCoreCustomers('test'), /HTTPS/);
    assert.equal(calls, 0);
    process.env.CLIENTCORE_ALLOW_DOCKER_HOST = 'true';
    assert.deepEqual(await searchClientCoreCustomers('test'), []);
    assert.equal(calls, 1);
    for (const host of ['host.docker.internal.example.com', 'example.com']) {
      process.env.CLIENTCORE_KANBAN_API_BASE_URL = 'http://' + host + '/api/';
      await assert.rejects(searchClientCoreCustomers('test'), /HTTPS/);
    }
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});
