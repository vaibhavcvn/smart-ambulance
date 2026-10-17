# Automated Testing & Verification Suite

## 1. Test Architecture
The test suite utilizes **Vitest** for fast, native TypeScript testing across both the Fastify backend and React frontend.

## 2. Test Coverage & Specifications

### Backend Test Modules (`apps/api/src/tests/`):
1. **`src/tests/unit/boundary.test.ts` (3 tests)**:
   - Validates that core landmarks (Kranti Chowk, CIDCO Connaught, GMCH Ghati, Waluj MIDC, Seven Hills) are inside the Aurangabad emergency service boundary.
   - Rejects out-of-boundary locations (Pune, Mumbai, outer Jalna).
   - Verifies GeoJSON boundary loading.
2. **`src/tests/unit/state-machine.test.ts` (4 tests)**:
   - Enforces sequential mission transitions (`REQUESTED` -> `DRIVER_REQUESTED` -> `ACCEPTED` -> `EN_ROUTE_TO_PICKUP` -> `ARRIVED_AT_PICKUP` -> `PATIENT_PICKED_UP` -> `EN_ROUTE_TO_HOSPITAL` -> `ARRIVED_AT_HOSPITAL` -> `COMPLETED`).
   - Rejects illegal state jumps (e.g. `REQUESTED` -> `COMPLETED`).
   - Validates role authorization for state transitions.
   - Verifies terminal and en-route status checkers.
3. **`src/tests/unit/ml.test.ts` (4 tests)**:
   - Validates strict Zod feature schema checking (rejecting NaN, negative distances, invalid categories).
   - Validates feature vector mapping (priority codes, peak hour flags, weekend indicators).
   - Mathematically verifies MAE, RMSE, and R² calculations against theoretical ground truth.
   - Tests fallback prediction when model is uninitialized.
4. **`src/tests/unit/privacy.test.ts` (1 test)**:
   - Confirms zero-PII compliance: patient name, phone number, and medical notes are completely removed for users querying with role `TRAFFIC_POLICE`, while preserving operational coordinates and priority.
5. **`src/tests/integration/dispatch-concurrency.test.ts` (3 tests)**:
   - Prevents duplicate active booking submissions for the same patient.
   - **Race condition protection**: Two drivers attempting to accept the same dispatch offer simultaneously — Driver 1 commits atomically and Driver 2 is rejected with `409 Conflict`.
   - **Expiry protection**: Offers with elapsed 45-second countdowns are rejected with `409 Conflict`.

### Frontend Test Modules (`apps/web/src/tests/`):
1. **`src/tests/booking.test.tsx` (2 tests)**:
   - Validates all 6 emergency categories and clinical triage priority assignments.
   - Validates boundary input contracts.

## 3. Test Execution Commands
Run all unit and integration tests across the monorepo:
```powershell
npm run test
```

Run backend tests specifically:
```powershell
npm --workspace=@aurangabad-ambulance/api run test
```

Run frontend tests specifically:
```powershell
npm --workspace=@aurangabad-ambulance/web run test
```
