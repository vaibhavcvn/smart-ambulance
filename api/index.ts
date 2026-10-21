import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { AdminBootstrapService } from '../apps/api/src/services/admin-bootstrap.service.js';
import { trafficService } from '../apps/api/src/services/traffic.service.js';

let fastifyApp: FastifyInstance | null = null;
let isBootstrapped = false;

async function getFastifyApp(): Promise<FastifyInstance> {
  if (!fastifyApp) {
    fastifyApp = await buildApp();
    await fastifyApp.ready();
  }

  if (!isBootstrapped) {
    try {
      await AdminBootstrapService.ensureCanonicalAdmin();
      await trafficService.ensureSignalsSeeded();
      isBootstrapped = true;
    } catch (err) {
      // In serverless environments where the DB is cold or during pre-deploy health checks,
      // log warning instead of crashing the function instance
      console.warn('⚠️ Serverless cold-start bootstrap notice:', (err as any)?.message || err);
    }
  }

  return fastifyApp;
}

// Disable Vercel's default body parser so Fastify's raw stream parser handles payloads safely
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Vercel Serverless Function entry point.
 * Normalizes rewrite paths from Vercel's edge network and bridges incoming
 * Node.js HTTP request/response streams into the initialized Fastify instance.
 */
export default async function handler(req: any, res: any) {
  try {
    // Normalize request URL from query __path or Vercel routing headers
    const rawUrl = req.url || '';
    const queryIndex = rawUrl.indexOf('?');
    const searchParams = new URLSearchParams(queryIndex !== -1 ? rawUrl.slice(queryIndex + 1) : '');

    const queryPath = searchParams.get('__path');
    if (queryPath) {
      searchParams.delete('__path');
      const cleanQuery = searchParams.toString();
      const normalizedPath = queryPath.startsWith('/') ? queryPath : `/${queryPath}`;
      const fullPath = normalizedPath.startsWith('/api') ? normalizedPath : `/api${normalizedPath}`;
      req.url = `${fullPath}${cleanQuery ? `?${cleanQuery}` : ''}`;
    } else {
      const matchedPath = req.headers?.['x-matched-path'] || req.headers?.['x-forwarded-uri'];
      if (
        typeof matchedPath === 'string' &&
        matchedPath.length > 0 &&
        !matchedPath.includes('(') &&
        !matchedPath.includes('*') &&
        matchedPath !== '/api' &&
        matchedPath !== '/api/'
      ) {
        const queryString = queryIndex !== -1 ? rawUrl.slice(queryIndex) : '';
        req.url = matchedPath.includes('?') ? matchedPath : `${matchedPath}${queryString}`;
      }
    }

    const app = await getFastifyApp();
    app.server.emit('request', req, res);
  } catch (error: any) {
    console.error('❌ Serverless invocation error:', error?.message || error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        code: 'SERVERLESS_INITIALIZATION_ERROR',
        message: 'The serverless API gateway encountered an error initializing.',
      }));
    }
  }
}

