// HTTP handler for /api/* (spec §6). Mounted by scripts/serve.mjs; tested in kit/tests/progress/api.test.mjs.
//
//   POST    /api/events  body: JSON array of events (see events.mjs)  -> 200 {applied, duplicates, skipped}
//   OPTIONS /api/events  CORS preflight                                -> 204
//   other methods on /api/events                                       -> 405
//
// Lessons may be opened from file://, so every /api response allows any origin. The server only
// listens on 127.0.0.1, so this exposes the learner's data to their own browser and nothing else.

import { applyEvents, ValidationError } from './events.mjs';

const MAX_BODY_BYTES = 256 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function send(res, status, body, extra = {}) {
  const headers = { ...CORS, ...extra };
  if (body === undefined) {
    res.writeHead(status, headers).end();
    return;
  }
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

// Reads the body with a running size counter. Stops at the cap so an oversized request cannot fill memory.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isJsonContentType(header = '') {
  return header.split(';')[0].trim().toLowerCase() === 'application/json';
}

async function handleEvents(req, res, db) {
  if (req.method === 'OPTIONS') return send(res, 204);
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' }, { Allow: 'POST, OPTIONS' });
  if (!isJsonContentType(req.headers['content-type'])) return send(res, 415, { error: 'content-type must be application/json' });

  let text;
  try {
    text = await readBody(req);
  } catch (err) {
    if (err.status === 413) return send(res, 413, { error: 'body is larger than 256 KB' }, { Connection: 'close' });
    return send(res, 400, { error: 'could not read body' });
  }

  let events;
  try {
    events = JSON.parse(text);
  } catch {
    return send(res, 400, { error: 'body is not valid JSON' });
  }

  try {
    return send(res, 200, applyEvents(db, events));
  } catch (err) {
    if (err instanceof ValidationError) return send(res, 400, { error: err.message });
    console.error('progress: could not apply events:', err);
    return send(res, 500, { error: 'internal error' });
  }
}

/**
 * @returns {boolean} true when the request was an /api/* route and has been answered.
 */
export function handleApi(req, res, db) {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!path.startsWith('/api/')) return false;
  if (path === '/api/events') {
    handleEvents(req, res, db);
    return true;
  }
  send(res, 404, { error: 'no such api route' });
  return true;
}
