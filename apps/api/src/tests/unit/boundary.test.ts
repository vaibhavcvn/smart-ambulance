import { describe, it, expect } from 'vitest';
import { isPointInAurangabad, getServiceBoundaryGeoJSON } from '../../integrations/maps/boundary.js';

describe('Aurangabad Geospatial Boundary Validation', () => {
  it('correctly validates core Aurangabad landmarks as inside boundary', () => {
    // Kranti Chowk
    expect(isPointInAurangabad(19.8762, 75.3242)).toBe(true);

    // GMCH Ghati Hospital
    expect(isPointInAurangabad(19.8906, 75.3218)).toBe(true);

    // CIDCO Cannaught Place
    expect(isPointInAurangabad(19.8885, 75.3582)).toBe(true);

    // Waluj MIDC
    expect(isPointInAurangabad(19.8398, 75.2285)).toBe(true);

    // Seven Hills Flyover
    expect(isPointInAurangabad(19.8778, 75.3524)).toBe(true);
  });

  it('correctly rejects coordinates outside Aurangabad EMS boundary', () => {
    // Pune coordinates
    expect(isPointInAurangabad(18.5204, 73.8567)).toBe(false);

    // Mumbai coordinates
    expect(isPointInAurangabad(19.076, 72.8777)).toBe(false);

    // Far North (Khuldabad / Ellora border)
    expect(isPointInAurangabad(20.08, 75.35)).toBe(false);

    // Far East (Jalna district center)
    expect(isPointInAurangabad(19.841, 75.886)).toBe(false);
  });

  it('loads valid GeoJSON boundary geometry', () => {
    const geojson = getServiceBoundaryGeoJSON();
    expect(geojson).toBeDefined();
    expect(geojson.type === 'Feature' || geojson.type === 'Polygon').toBe(true);
  });
});
