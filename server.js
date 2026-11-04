'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const EchoRecommendation = require('./recommendation-core');

const MAX_BODY_BYTES = 8 * 1024;
const MAX_PROMPT_LENGTH = 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 30;
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function loadEnvFile(envPath = path.join(__dirname, '.env')) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large'), { status: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function createServer({
  env = process.env,
  staticRoot = __dirname,
  fetchImpl = globalThis.fetch,
  rateMaxRequests = RATE_MAX_REQUESTS,
  now = Date.now
} = {}) {
  const requestsByIp = new Map();
  const root = path.resolve(staticRoot);
  const publicFiles = new Set(['index.html', 'script.js', 'style.css', 'recommendation-core.js']);

  async function handleIntent(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'Method not allowed' });
    }
    const contentType = request.headers['content-type'] || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return sendJson(response, 415, { error: 'Content-Type must be application/json' });
    }

    const ip = request.socket.remoteAddress || 'unknown';
    const timestamp = now();
    const recent = (requestsByIp.get(ip) || []).filter(value => timestamp - value < RATE_WINDOW_MS);
    if (recent.length >= rateMaxRequests) return sendJson(response, 429, { error: 'Too many requests; try again shortly' });
    recent.push(timestamp);
    requestsByIp.set(ip, recent);

    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
    if (!body || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > MAX_PROMPT_LENGTH) {
      return sendJson(response, 400, { error: `prompt must be a non-empty string of at most ${MAX_PROMPT_LENGTH} characters` });
    }
    const apiKey = env.LLM_API_KEY;
    if (!apiKey) return sendJson(response, 503, { error: 'LLM is not configured' });

    const baseUrl = env.LLM_BASE_URL || 'https://api.openai.com/v1';
    let endpoint;
    try {
      endpoint = new URL(`${baseUrl.replace(/\/+$/, '')}/chat/completions`);
    } catch {
      return sendJson(response, 500, { error: 'LLM_BASE_URL is invalid' });
    }
    const isLocalProvider = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (endpoint.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && isLocalProvider)) {
      return sendJson(response, 500, { error: 'LLM_BASE_URL must use HTTPS' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const providerResponse = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: env.LLM_MODEL || 'gpt-4o-mini',
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'Convert a music request into a JSON object with fields search (string), tags (string array), moods (string array), activities (string array), genres (string array), language (string or null), tempo (slow, medium, fast, or null), energy (number from 0 to 1 or null), and label (short string). Do not recommend tracks or invent track facts. Use only requested attributes. Return JSON only.'
            },
            { role: 'user', content: body.prompt.trim() }
          ]
        })
      });
      if (!providerResponse.ok) {
        return sendJson(response, 502, { error: 'LLM provider request failed' });
      }
      const providerBody = await providerResponse.json();
      const content = providerBody.choices?.[0]?.message?.content;
      if (typeof content !== 'string') return sendJson(response, 502, { error: 'LLM provider returned an unsupported response' });
      let candidate;
      try {
        candidate = JSON.parse(content);
      } catch {
        return sendJson(response, 502, { error: 'LLM provider returned invalid intent JSON' });
      }
      const intent = EchoRecommendation.normalizeIntent(candidate, body.prompt);
      return sendJson(response, 200, { intent, source: 'llm' });
    } catch (error) {
      const timedOut = error.name === 'AbortError';
      return sendJson(response, timedOut ? 504 : 502, { error: timedOut ? 'LLM provider timed out' : 'LLM provider is unavailable' });
    } finally {
      clearTimeout(timeout);
    }
  }

  function serveStatic(request, response, pathname) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return sendJson(response, 405, { error: 'Method not allowed' });
    }
    let requestedPath;
    try {
      requestedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
    } catch {
      return sendJson(response, 404, { error: 'Not found' });
    }
    const absolutePath = path.resolve(root, `.${requestedPath}`);
    if (!absolutePath.startsWith(`${root}${path.sep}`) || !publicFiles.has(path.basename(absolutePath))) {
      return sendJson(response, 404, { error: 'Not found' });
    }
    const contentType = MIME_TYPES[path.extname(absolutePath).toLowerCase()];
    if (!contentType) return sendJson(response, 404, { error: 'Not found' });
    fs.readFile(absolutePath, (error, content) => {
      if (error) return sendJson(response, 404, { error: 'Not found' });
      response.writeHead(200, {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin'
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    });
  }

  return http.createServer((request, response) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      return sendJson(response, 400, { error: 'Invalid request URL' });
    }
    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, { status: 'ok', llmConfigured: Boolean(env.LLM_API_KEY) });
    }
    if (url.pathname === '/api/intent') return handleIntent(request, response);
    serveStatic(request, response, url.pathname);
  });
}

if (require.main === module) {
  loadEnvFile();
  const server = createServer();
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    process.stdout.write(`Echo is available at http://${host}:${port}\n`);
  });
}

module.exports = { createServer, loadEnvFile };
