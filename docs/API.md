# REST API & OpenAPI Specifications

## 1. Overview
The backend exposes a standardized REST API under `/api/v1` along with Swagger OpenAPI documentation available interactively at `http://localhost:4000/docs`.

## 2. API Endpoints Reference

### Health & System
- `GET /health`: Liveness & readiness probe checking database, memory, boundary, and ML subsystem.

### Authentication
- `POST /api/v1/auth/login`: Authenticate with email and password, returns JWT and user profile.
- `POST /api/v1/auth/register`: Register new account with role-specific metadata.
- `GET /api/v1/auth/me`: Retrieve currently authenticated user profile.

### Emergency Bookings
- `POST /api/v1/bookings`: Create emergency booking with boundary validation and automated dispatch initiation.
- `GET /api/v1/bookings/active`: Retrieve patient's current active mission.

### Server-Side Dispatch
- `GET /api/v1/dispatch/pending`: Fetch pending 45-second dispatch offer for driver.
- `POST /api/v1/dispatch/respond`: Respond `ACCEPT` or `DECLINE` with atomic concurrency protection.

### Trips & State Machine
- `GET /api/v1/trips/:id`: Retrieve mission status (with Zero-PII filtering for Traffic Police).
- `GET /api/v1/trips/driver/active`: Retrieve driver's active mission.
- `PATCH /api/v1/trips/:id/status`: Transition trip state using centralized transition validator.

### Hospitals & Triage
- `GET /api/v1/hospitals`: List all regional hospitals with current bed counts.
- `GET /api/v1/hospitals/:id`: Get hospital details.
- `PATCH /api/v1/hospitals/:id/capacity`: Update available ER, ICU, and General bed counts (isolated by tenancy).
- `GET /api/v1/hospitals/:id/inbound`: Inbound ambulance queue for triage.
- `POST /api/v1/hospitals/recommend`: Multi-factor hospital recommendation algorithm.

### Traffic Coordination
- `GET /api/v1/traffic/corridors`: List active emergency green corridors (zero patient PII).
- `POST /api/v1/traffic/corridors/action`: Acknowledge or clear green corridors.
- `GET /api/v1/traffic/blockages`: List active road obstructions and roadworks.
- `POST /api/v1/traffic/blockages`: Report new road obstruction.
- `PATCH /api/v1/traffic/blockages/:id/resolve`: Mark obstruction resolved.

### Tracking & Fleet
- `POST /api/v1/tracking/location`: Post driver GPS telemetry (includes `isSimulated` flag).
- `GET /api/v1/tracking/fleet`: Fleet registry with coordinates and stale detection.

### Machine Learning & Analytics
- `GET /api/v1/ml/metrics`: Return trained Random Forest model version and evaluation metrics.
- `POST /api/v1/ml/predict`: Calculate predicted delay and total journey duration.
- `GET /api/v1/analytics/kpis`: Database-backed operational KPI summary.
- `GET /api/v1/analytics/charts`: Emergency volume by time of day.
- `GET /api/v1/analytics/hospital-overview`: Hospital capacity distribution.

### Geospatial
- `GET /api/v1/geo/search?q=query`: Debounced geocoding search with landmark shortcuts.
- `GET /api/v1/geo/reverse?lat=lat&lng=lng`: Reverse geocoding lookup.
- `GET /api/v1/geo/boundary`: Retrieve Aurangabad service boundary GeoJSON.
