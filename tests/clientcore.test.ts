import test from 'node:test';
import assert from 'node:assert/strict';
import { canQueryClientCoreCustomers, resolveClientCoreCustomer, searchClientCoreCustomers } from '../src/lib/clientcore.ts';

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
