import fs from 'fs';
import path from 'path';
import { EmergencyCategory } from '@aurangabad-ambulance/shared';
import { RawMLTripFeatures } from '../features/feature-extractor.js';

export interface SyntheticTripRecord extends RawMLTripFeatures {
  actualTripDurationSeconds: number;
  observedDelaySeconds: number; // actual - osrmDurationSeconds
}

export function generateSyntheticDataset(count = 600, seed = 42): SyntheticTripRecord[] {
  // Simple deterministic pseudorandom number generator
  let state = seed;
  function random(): number {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  }

  const categories = Object.values(EmergencyCategory);
  const records: SyntheticTripRecord[] = [];

  for (let i = 0; i < count; i++) {
    // Distance between 1.2 km and 22.0 km (typical Aurangabad urban & peri-urban emergency trip)
    const distanceKm = Math.round((1.2 + random() * 20.8) * 10) / 10;

    // Normal baseline urban speed: 30 to 45 km/h
    const baseSpeedKmh = 32 + random() * 12;
    const osrmDurationSeconds = Math.round((distanceKm / baseSpeedKmh) * 3600);

    const emergencyCategory = categories[Math.floor(random() * categories.length)];
    const hourOfDay = Math.floor(random() * 24);
    const dayOfWeek = Math.floor(random() * 7);

    // 0 to 3 active blockages nearby
    const activeBlockagesNearby = random() < 0.6 ? 0 : random() < 0.85 ? 1 : 2;

    const isPeakHour =
      (hourOfDay >= 9 && hourOfDay <= 11) || (hourOfDay >= 17 && hourOfDay <= 20);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Simulate realistic Aurangabad emergency transit delay
    // 1. Peak hour congestion factor (+60s to +360s depending on distance)
    let congestionDelay = 0;
    if (isPeakHour) {
      congestionDelay = 90 + random() * 240 + distanceKm * 10;
      if (isWeekend) congestionDelay *= 0.7; // Weekend peaks are less congested
    }

    // 2. Road blockage delay
    const blockageDelay = activeBlockagesNearby * (80 + random() * 140);

    // 3. Priority emergency vehicle siren mitigation (-40s to -150s for critical)
    let priorityAdjustment = 0;
    if (
      emergencyCategory === EmergencyCategory.CARDIAC_ARREST ||
      emergencyCategory === EmergencyCategory.TRAUMA_ACCIDENT ||
      emergencyCategory === EmergencyCategory.RESPIRATORY_FAILURE
    ) {
      priorityAdjustment = -(60 + random() * 100);
    } else if (emergencyCategory === EmergencyCategory.STROKE) {
      priorityAdjustment = -(30 + random() * 50);
    }

    // 4. Random noise (traffic signals, pedestrian crossings, sharp turns in old city)
    const noise = (random() - 0.5) * 80;

    const observedDelaySeconds = Math.max(
      0,
      Math.round(congestionDelay + blockageDelay + priorityAdjustment + noise)
    );
    const actualTripDurationSeconds = osrmDurationSeconds + observedDelaySeconds;

    records.push({
      distanceKm,
      osrmDurationSeconds,
      emergencyCategory,
      hourOfDay,
      dayOfWeek,
      activeBlockagesNearby,
      actualTripDurationSeconds,
      observedDelaySeconds,
    });
  }

  return records;
}

export function saveSyntheticDataset(records: SyntheticTripRecord[], targetPath: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, JSON.stringify(records, null, 2), 'utf-8');
}
