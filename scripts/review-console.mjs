#!/usr/bin/env node
/** Loopback-only operator console. Never deploy this with the public application. */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { runReviewOperation } from './review.mjs';

export async function startReviewConsole({
  port = 3200,
  environment = process.env,
  run = runReviewOperation,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid review port.');
  const token = randomBytes(32).toString('hex');
  const assets = new Map(
    await Promise.all(
      ['index.html', 'console.js', 'console.css'].map(async (name) => [
        name,
        await readFile(new URL(`./review-console/${name}`, import.meta.url), 'utf8'),
      ]),
    ),
  );
  let origin;
  const server = createServer(async (request, response) => {
    const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    };
    const send = (status, value) => {
      response.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    // Reject rebinding/forwarded hostnames even though the listener is loopback-only.
    if (
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      return send(403, { error: 'LOCAL_ORIGIN_REQUIRED' });
    if (request.url === '/api/review' && request.method === 'POST') {
      const supplied = request.headers['x-review-token'];
      if (
        request.headers.origin !== origin ||
        typeof supplied !== 'string' ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(token) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
      )
        return send(403, { error: 'REVIEW_TOKEN_REQUIRED' });
      if (request.headers['content-type'] !== 'application/json')
        return send(415, { error: 'JSON_REQUIRED' });
      try {
        let bytes = 0;
        const chunks = [];
        for await (const chunk of request.iterator({ destroyOnReturn: false })) {
          bytes += chunk.length;
          if (bytes > 32768) {
            request.resume();
            return send(413, { error: 'BODY_TOO_LARGE' });
          }
          chunks.push(chunk);
        }
        let input;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, { error: 'INVALID_JSON' });
        }
        const result = await run(input, environment);
        return send(200, result);
      } catch (error) {
        const code = error.safeCode;
        if (code === 'DEDICATED_OPERATOR_DATABASE_URL_REQUIRED') return send(503, { error: code });
        if (code === 'DEDICATED_NONPRIVILEGED_OPERATOR_REQUIRED' || error.code === '42501')
          return send(403, { error: 'REVIEW_OPERATOR_REQUIRED' });
        if (error.code?.startsWith('23')) return send(409, { error: 'REVIEW_STALE_REFRESH_QUEUE' });
        if (
          code &&
          [
            'INVALID_ARGUMENTS',
            'VALID_UUID_REQUIRED',
            'NOTE_MUST_BE_1_TO_1000_CHARACTERS',
            'INVALID_WEBSITE',
            'INVALID_REVISION',
            'PROFILE_FILE_TOO_LARGE',
          ].includes(code)
        )
          return send(422, { error: code });
        if (error.code?.startsWith('22')) return send(422, { error: 'INVALID_REVIEW_CONTENT' });
        // No connection strings, database diagnostics, or draft text in logs/responses.
        return send(503, { error: 'REVIEW_UNAVAILABLE' });
      }
    }
    const asset = request.url === '/' ? 'index.html' : request.url?.slice(1);
    if (request.method !== 'GET' || !assets.has(asset)) return send(404, { error: 'NOT_FOUND' });
    response.writeHead(200, {
      ...headers,
      'Content-Type': asset.endsWith('.js')
        ? 'text/javascript'
        : asset.endsWith('.css')
          ? 'text/css'
          : 'text/html; charset=utf-8',
    });
    response.end(assets.get(asset).replace('__REVIEW_TOKEN__', token));
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const consoleServer = await startReviewConsole({
    port: Number(process.env.SWIPE_REVIEW_PORT || 3200),
  });
  console.log(`Operator review console: ${consoleServer.origin}`);
  if (!process.env.SWIPE_REVIEW_DATABASE_URL)
    console.log(
      'Queues unavailable until SWIPE_REVIEW_DATABASE_URL is configured with an individual reviewer login.',
    );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      void consoleServer.close().then(() => process.exit(0));
    });
}
