/**
 * Wherewise edge worker.
 *
 * Static assets (the single-page app) are served by the ASSETS binding.
 * This worker only answers /api/* :
 *   /api/health           liveness probe, with the age of each stored feed
 *   /api/feeds/usgs       USGS earthquakes, past 30 days (GeoJSON, passed through)
 *   /api/feeds/chicago    City of Chicago traffic crashes, past 90 days (CSV, passed through)
 *
 * Feeds are fetched on a schedule (cron) and stored in KV. Requests are served
 * from KV, so a visitor never waits on a slow public API and never sees it fail.
 * The worker never parses the feeds; the browser does all the work. That keeps
 * each request to a few milliseconds of CPU.
 */

interface Env {
  ASSETS: Fetcher;
  FEEDS: KVNamespace;
}

type FeedId = 'usgs' | 'chicago';

interface Feed {
  /** seconds before a stored copy should be refreshed */
  refresh: number;
  type: string;
  url: () => string;
}

interface StoredMeta {
  generated: string;
}

export const FEEDS: Record<FeedId, Feed> = {
  usgs: {
    refresh: 15 * 60,
    type: 'application/geo+json; charset=utf-8',
    url: () => 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson',
  },
  chicago: {
    refresh: 3 * 3600,
    type: 'text/csv; charset=utf-8',
    url: () => {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      const params = new URLSearchParams({
        $select: [
          'crash_date as date_time',
          'first_crash_type as crash_type',
          'prim_contributory_cause as primary_cause',
          'weather_condition as weather',
          'lighting_condition as lighting',
          'injuries_total',
          'injuries_fatal',
          'posted_speed_limit as speed_limit_mph',
          'latitude',
          'longitude',
        ].join(','),
        $where: `crash_date > '${since}T00:00:00' AND latitude IS NOT NULL`,
        $limit: '50000',
      });
      return `https://data.cityofchicago.org/resource/85ca-t3if.csv?${params}`;
    },
  },
};

const key = (id: FeedId) => `feed:${id}`;

async function refreshFeed(env: Env, id: FeedId): Promise<{ body: ArrayBuffer; meta: StoredMeta }> {
  const feed = FEEDS[id];
  const upstream = await fetch(feed.url(), { headers: { accept: feed.type.split(';')[0] }, signal: AbortSignal.timeout(90_000) });
  if (!upstream.ok) throw new Error(`Upstream answered ${upstream.status}`);
  const body = await upstream.arrayBuffer();
  if (body.byteLength < 2_000) throw new Error('Upstream returned an empty feed');
  const meta: StoredMeta = { generated: new Date().toISOString() };
  await env.FEEDS.put(key(id), body, { metadata: meta });
  return { body, meta };
}

function feedResponse(id: FeedId, body: ArrayBuffer | ReadableStream, meta: StoredMeta, stale: boolean): Response {
  const feed = FEEDS[id];
  return new Response(body, {
    headers: {
      'content-type': feed.type,
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
      'x-wherewise-generated': meta.generated,
      ...(stale ? { 'x-wherewise-stale': '1' } : {}),
    },
  });
}

async function serveFeed(env: Env, id: FeedId, ctx: ExecutionContext): Promise<Response> {
  const stored = await env.FEEDS.getWithMetadata<StoredMeta>(key(id), { type: 'stream' });
  if (stored.value && stored.metadata) {
    const age = (Date.now() - Date.parse(stored.metadata.generated)) / 1000;
    // too old: refresh in the background, still answer immediately
    if (age > FEEDS[id].refresh * 2) ctx.waitUntil(refreshFeed(env, id).catch(() => undefined));
    // stale means "the source has been failing for a while"
    return feedResponse(id, stored.value, stored.metadata, age > FEEDS[id].refresh * 8);
  }
  try {
    const { body, meta } = await refreshFeed(env, id);
    return feedResponse(id, body, meta, false);
  } catch (err) {
    return Response.json(
      { error: 'feed_unavailable', feed: id, message: err instanceof Error ? err.message : 'Upstream failed' },
      { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '120' } },
    );
  }
}

async function health(env: Env): Promise<Response> {
  const ages: Record<string, number | null> = {};
  for (const id of Object.keys(FEEDS) as FeedId[]) {
    const { metadata } = await env.FEEDS.getWithMetadata<StoredMeta>(key(id), { type: 'stream' });
    ages[id] = metadata ? Math.round((Date.now() - Date.parse(metadata.generated)) / 1000) : null;
  }
  return Response.json({ ok: true, service: 'wherewise', time: new Date().toISOString(), feedAgeSeconds: ages }, { headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'GET, HEAD' } });
      }
      if (url.pathname === '/api/health') return health(env);
      const m = url.pathname.match(/^\/api\/feeds\/(usgs|chicago)$/);
      if (m) return serveFeed(env, m[1] as FeedId, ctx);
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },

  /** Cron: keep the stored feeds fresh. Each feed fails independently. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const id of Object.keys(FEEDS) as FeedId[]) {
      const { metadata } = await env.FEEDS.getWithMetadata<StoredMeta>(key(id), { type: 'stream' });
      const age = metadata ? (Date.now() - Date.parse(metadata.generated)) / 1000 : Infinity;
      if (age >= FEEDS[id].refresh - 60) ctx.waitUntil(refreshFeed(env, id).catch(() => undefined));
    }
  },
} satisfies ExportedHandler<Env>;
