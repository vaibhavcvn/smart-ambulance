import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';

describe('Health Check Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 and valid platform health status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toMatch(/ok|degraded/);
    expect(body.platform).toBe('Aurangabad Smart Ambulance Dispatch Platform');
    expect(body.version).toBe('1.0.0');
    expect(body.database).toMatch(/healthy|unreachable/);
    expect(body.services).toBeDefined();
    expect(body.system).toBeDefined();
  });

  it('GET /health returns 200 for root probes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toMatch(/ok|degraded/);
  });

  it('GET /api/health returns 200 for legacy api health probe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toMatch(/ok|degraded/);
  });
});
