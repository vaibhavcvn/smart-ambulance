# System Architecture — Aurangabad Smart Ambulance

## 1. Executive Overview
The **Aurangabad Smart Ambulance** platform is an intelligent, real-time emergency dispatch and traffic coordination system engineered for Chhatrapati Sambhajinagar (Aurangabad), Maharashtra. The platform connects patients in acute medical emergencies with eligible ambulances, dynamically routes vehicles, coordinates hospital bed availability across major regional hospitals (such as GMCH Ghati and MGM), and clears emergency green corridors with zero patient-PII exposure for traffic police.

## 2. Monorepo Organization
The repository is managed as a unified npm workspace monorepo:
```
MP1APOORV/
├── apps/
│   ├── web/        # React 18, Vite, TypeScript, Leaflet, Tailwind CSS, Recharts
│   └── api/        # Fastify 5, TypeScript, Prisma ORM, Socket.IO, ml-random-forest
├── packages/
│   └── shared/     # Shared contracts, enums, schemas, state machine transitions, types
├── data/
│   ├── geo/        # Aurangabad EMS GeoJSON operational boundary
│   └── ml/         # Serialized Random Forest model, synthetic data & metadata
├── docs/           # Engineering, database, security, and setup documentation
├── scripts/        # Windows PowerShell and cross-platform automation
└── PROJECT_STATUS.md
```

## 3. Technology Stack Justification
- **Frontend (Vite + React + TypeScript + Leaflet)**: Map-first responsive UX with custom medical markers, debounced geocoding, and TanStack Query caching.
- **Backend (Fastify + TypeScript + Prisma + SQLite)**: High-throughput, low-overhead HTTP API with built-in schema validation, Swagger OpenAPI documentation, and transactional integrity.
- **Real-Time Sockets (Socket.IO)**: Authenticated, room-isolated bidirectional communication for 45s dispatch countdowns, driver GPS updates, and hospital queue sync.
- **Machine Learning (Node.js ml-random-forest)**: 100% pure TypeScript/JavaScript implementation of Random Forest regression for delay estimation with zero Python process dependencies.
- **Geospatial (Turf.js + Nominatim + OSRM)**: Point-in-polygon service boundary validation, local landmark shortcut searching, and route distance/duration estimation with Haversine fallback.

## 4. Role-Based Subsystems
1. **PATIENT**: Map-first booking, address search + landmark shortcuts, geolocation pin, emergency category selection, and live mission tracking.
2. **DRIVER**: Vehicle status toggle, 45s dispatch offer acceptance/decline, stepwise mission actions, and opt-in demo GPS simulator.
3. **HOSPITAL_STAFF**: Facility-isolated bed capacity controls (ER, ICU, General), operational status toggle (OPERATIONAL, HIGH_CAPACITY, DIVERTING, CLOSED), and live inbound triage queue.
4. **TRAFFIC_POLICE**: Zero-PII green corridor coordination, signal acknowledgement, and road obstruction/blockage management.
5. **ADMIN**: Real-time database KPI monitoring, fleet registry, Recharts graphs, service boundary inspector, and ML model diagnostic evaluation.
