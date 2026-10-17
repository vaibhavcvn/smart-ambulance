import { EmergencyCategory, EmergencyPriority, EMERGENCY_CATEGORIES_META } from '@aurangabad-ambulance/shared';

export interface RawMLTripFeatures {
  distanceKm: number;
  osrmDurationSeconds: number;
  emergencyCategory: EmergencyCategory;
  hourOfDay: number; // 0-23
  dayOfWeek: number; // 0-6 (0 is Sunday)
  activeBlockagesNearby?: number;
}

export const FEATURE_NAMES = [
  'distanceKm',
  'osrmDurationSeconds',
  'priorityCode', // 0 = Standard, 1 = Urgent, 2 = Critical
  'hourOfDay',
  'isPeakHour',
  'isWeekend',
  'activeBlockagesNearby',
] as const;

export function extractFeatureVector(input: RawMLTripFeatures): number[] {
  const meta = EMERGENCY_CATEGORIES_META[input.emergencyCategory] || {
    priority: EmergencyPriority.STANDARD,
  };

  let priorityCode = 0;
  if (meta.priority === EmergencyPriority.URGENT) priorityCode = 1;
  if (meta.priority === EmergencyPriority.CRITICAL) priorityCode = 2;

  const isPeakHour =
    (input.hourOfDay >= 9 && input.hourOfDay <= 11) ||
    (input.hourOfDay >= 17 && input.hourOfDay <= 20)
      ? 1
      : 0;

  const isWeekend = input.dayOfWeek === 0 || input.dayOfWeek === 6 ? 1 : 0;
  const blockages = Math.max(0, input.activeBlockagesNearby ?? 0);

  return [
    Math.max(0.1, input.distanceKm),
    Math.max(10, input.osrmDurationSeconds),
    priorityCode,
    input.hourOfDay,
    isPeakHour,
    isWeekend,
    blockages,
  ];
}
