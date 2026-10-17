import { RawMLTripFeatures } from './feature-extractor.js';
import { EmergencyCategory } from '@aurangabad-ambulance/shared';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateMLInput(input: unknown): { isValid: boolean; data?: RawMLTripFeatures; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { isValid: false, errors: ['Input features must be a non-null object.'] };
  }

  const raw = input as Record<string, unknown>;

  if (typeof raw.distanceKm !== 'number' || isNaN(raw.distanceKm) || raw.distanceKm <= 0) {
    errors.push('distanceKm must be a positive number.');
  }

  if (typeof raw.osrmDurationSeconds !== 'number' || isNaN(raw.osrmDurationSeconds) || raw.osrmDurationSeconds <= 0) {
    errors.push('osrmDurationSeconds must be a positive number.');
  }

  if (
    typeof raw.emergencyCategory !== 'string' ||
    !Object.values(EmergencyCategory).includes(raw.emergencyCategory as EmergencyCategory)
  ) {
    errors.push(`emergencyCategory must be one of [${Object.values(EmergencyCategory).join(', ')}].`);
  }

  if (typeof raw.hourOfDay !== 'number' || isNaN(raw.hourOfDay) || raw.hourOfDay < 0 || raw.hourOfDay > 23) {
    errors.push('hourOfDay must be an integer between 0 and 23.');
  }

  if (typeof raw.dayOfWeek !== 'number' || isNaN(raw.dayOfWeek) || raw.dayOfWeek < 0 || raw.dayOfWeek > 6) {
    errors.push('dayOfWeek must be an integer between 0 (Sun) and 6 (Sat).');
  }

  if (raw.activeBlockagesNearby !== undefined) {
    if (typeof raw.activeBlockagesNearby !== 'number' || isNaN(raw.activeBlockagesNearby) || raw.activeBlockagesNearby < 0) {
      errors.push('activeBlockagesNearby must be a non-negative number if provided.');
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      distanceKm: raw.distanceKm as number,
      osrmDurationSeconds: raw.osrmDurationSeconds as number,
      emergencyCategory: raw.emergencyCategory as EmergencyCategory,
      hourOfDay: Math.floor(raw.hourOfDay as number),
      dayOfWeek: Math.floor(raw.dayOfWeek as number),
      activeBlockagesNearby: raw.activeBlockagesNearby !== undefined ? Math.floor(raw.activeBlockagesNearby as number) : 0,
    },
    errors: [],
  };
}
