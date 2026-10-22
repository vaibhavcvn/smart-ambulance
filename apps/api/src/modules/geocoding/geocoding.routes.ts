import { FastifyInstance } from 'fastify';
import { searchLocations, reverseGeocode } from '../../integrations/geocoding/nominatim.js';
import { getServiceBoundaryGeoJSON } from '../../integrations/maps/boundary.js';
import { getRoute } from '../../integrations/routing/osrm.js';
import { z } from 'zod';

const SearchQuerySchema = z.object({
  q: z.string().default(''),
});

const ReverseQuerySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});

const RouteQuerySchema = z.object({
  originLat: z.coerce.number(),
  originLng: z.coerce.number(),
  destLat: z.coerce.number(),
  destLng: z.coerce.number(),
});

export async function geocodingRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/geo/search', async (request) => {
    const query = SearchQuerySchema.parse(request.query);
    return searchLocations(query.q);
  });

  fastify.get('/api/v1/geo/reverse', async (request) => {
    const query = ReverseQuerySchema.parse(request.query);
    const address = await reverseGeocode(query.lat, query.lng);
    return { address };
  });

  fastify.get('/api/v1/geo/boundary', async () => {
    return getServiceBoundaryGeoJSON();
  });

  fastify.get('/api/v1/geo/route', async (request) => {
    const query = RouteQuerySchema.parse(request.query);
    return getRoute(query.originLat, query.originLng, query.destLat, query.destLng);
  });
}
