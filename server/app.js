import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.js';
import { getAgency, getMapPoints, getMeta, listAgencies, searchReviews } from './queries.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDatabase();
const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

app.get('/api/meta', (c) => c.json({ data: getMeta(db) }));
app.get('/api/reviews', (c) => c.json({ data: searchReviews(db, c.req.query()) }));
app.get('/api/agencies', (c) => c.json({ data: listAgencies(db, c.req.query()) }));
app.get('/api/agencies/:agencyKey', (c) => {
  const agency = getAgency(db, c.req.param('agencyKey'));
  return agency
    ? c.json({ data: agency })
    : c.json({ error: { code: 'NOT_FOUND', message: 'Agency not found' } }, 404);
});
app.get('/api/map', (c) => c.json({ data: getMapPoints(db, c.req.query()) }));
app.get('/api/health', (c) => c.json({ data: { status: 'ok' } }));

const dist = path.join(root, 'dist');
app.use('/assets/*', serveStatic({ root: dist }));
app.get('*', serveStatic({ path: path.join(dist, 'index.html') }));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
});

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 3001);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Rental Record listening on http://localhost:${port}`);
  });
}

export default app;

