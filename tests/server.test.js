'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

async function withServer(server, callback) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('serves the existing frontend and reports provider configuration without revealing credentials', async () => {
  const server = createServer({ env: { LLM_API_KEY: 'test-secret' } });
  await withServer(server, async base => {
    const [page, health] = await Promise.all([
      fetch(`${base}/`),
      fetch(`${base}/api/health`)
    ]);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Echo — Music Discovery/);
    assert.deepEqual(await health.json(), { status: 'ok', llmConfigured: true });
  });
});

test('uses local fallback availability when no LLM API key is configured', async () => {
  const server = createServer({ env: {} });
  await withServer(server, async base => {
    const response = await fetch(`${base}/api/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'calm music for studying' })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'LLM is not configured' });
  });
});

test('validates request shape and content type before contacting an LLM', async () => {
  let calls = 0;
  const server = createServer({ env: { LLM_API_KEY: 'test-secret' }, fetchImpl: async () => { calls++; } });
  await withServer(server, async base => {
    const wrongType = await fetch(`${base}/api/intent`, { method: 'POST', body: 'prompt=hello' });
    assert.equal(wrongType.status, 415);
    const emptyPrompt = await fetch(`${base}/api/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: ' ' })
    });
    assert.equal(emptyPrompt.status, 400);
    assert.equal(calls, 0);
  });
});

test('forwards prompts to an OpenAI-compatible provider and validates structured intent output', async () => {
  let providerRequest;
  const server = createServer({
    env: { LLM_API_KEY: 'server-only-secret', LLM_MODEL: 'mock-model', LLM_BASE_URL: 'https://provider.example/v1' },
    fetchImpl: async (url, options) => {
      providerRequest = { url: String(url), options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          search: 'Hindi calm instrumental',
          tags: ['ambient', 'instrumental'],
          moods: ['calm'],
          activities: ['meditation'],
          genres: ['ambient'],
          language: 'Hindi',
          tempo: 'slow',
          energy: 0.15,
          label: 'calm meditation'
        }) } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  await withServer(server, async base => {
    const response = await fetch(`${base}/api/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'calm Hindi music for meditation' })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.source, 'llm');
    assert.equal(result.intent.language, 'Hindi');
    assert.equal(result.intent.energy, 0.15);
    assert.equal(providerRequest.url, 'https://provider.example/v1/chat/completions');
    assert.equal(providerRequest.options.headers.Authorization, 'Bearer server-only-secret');
    assert.equal(providerRequest.body.model, 'mock-model');
  });
});

test('does not expose dotfiles or return the configured API key from public routes', async () => {
  const server = createServer({ env: { LLM_API_KEY: 'never-send-this' } });
  await withServer(server, async base => {
    const dotfile = await fetch(`${base}/.env.example`);
    const backendSource = await fetch(`${base}/server.js`);
    const traversal = await fetch(`${base}/%2e%2e%2fserver.js`);
    const script = await fetch(`${base}/script.js`);
    assert.equal(dotfile.status, 404);
    assert.equal(backendSource.status, 404);
    assert.equal(traversal.status, 404);
    assert.equal((await script.text()).includes('never-send-this'), false);
  });
});

test('limits intent request rates per client', async () => {
  const server = createServer({ env: {}, rateMaxRequests: 1 });
  await withServer(server, async base => {
    const post = () => fetch(`${base}/api/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'calm music' })
    });
    assert.equal((await post()).status, 503);
    assert.equal((await post()).status, 429);
  });
});
