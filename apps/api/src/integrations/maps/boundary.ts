import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { AURANGABAD_BOUNDS } from '@aurangabad-ambulance/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidatePaths = [
  path.resolve(__dirname, '../../../../../data/geo/aurangabad-boundary.geojson'),
  path.resolve(__dirname, '../../../../data/geo/aurangabad-boundary.geojson'),
  path.resolve(process.cwd(), 'data/geo/aurangabad-boundary.geojson'),
  path.resolve(process.cwd(), '../../data/geo/aurangabad-boundary.geojson'),
];

let boundaryFeature: any = null;

for (const p of candidatePaths) {
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw);
      boundaryFeature = parsed.features?.[0] || parsed;
      if (boundaryFeature) break;
    }
  } catch {
    // continue checking next path
  }
}

if (!boundaryFeature) {
  // Safe fallback polygon feature from AURANGABAD_BOUNDS
  boundaryFeature = {
    type: 'Feature',
    properties: { name: 'Aurangabad EMS Municipal Bounds' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [AURANGABAD_BOUNDS.minLng, AURANGABAD_BOUNDS.minLat],
          [AURANGABAD_BOUNDS.maxLng, AURANGABAD_BOUNDS.minLat],
          [AURANGABAD_BOUNDS.maxLng, AURANGABAD_BOUNDS.maxLat],
          [AURANGABAD_BOUNDS.minLng, AURANGABAD_BOUNDS.maxLat],
          [AURANGABAD_BOUNDS.minLng, AURANGABAD_BOUNDS.minLat],
        ],
      ],
    },
  };
}

export function isPointInAurangabad(latitude: number, longitude: number): boolean {
  // 1. Fast bounding box pre-filter
  if (
    latitude < AURANGABAD_BOUNDS.minLat ||
    latitude > AURANGABAD_BOUNDS.maxLat ||
    longitude < AURANGABAD_BOUNDS.minLng ||
    longitude > AURANGABAD_BOUNDS.maxLng
  ) {
    return false;
  }

  // 2. Exact Turf.js point-in-polygon check if GeoJSON boundary is loaded
  if (boundaryFeature) {
    try {
      const pt = point([longitude, latitude]);
      const fn = (booleanPointInPolygon as any).default || booleanPointInPolygon;
      return fn(pt, boundaryFeature);
    } catch (err) {
      console.warn('Error during Turf point-in-polygon evaluation, falling back to bounds:', err);
    }
  }

  // Fallback: point is inside bounding box
  return true;
}

export function getServiceBoundaryGeoJSON(): any {
  return boundaryFeature;
}
