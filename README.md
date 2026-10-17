# Aurangabad Smart Ambulance — Intelligent Emergency Dispatch & Traffic Coordination Platform

An end-to-end, full-stack emergency mobility platform for **Aurangabad (Chhatrapati Sambhajinagar), Maharashtra, India**. The system coordinates patient ambulance bookings, authoritative server-side 45-second dispatch offers, atomic concurrency protection, real-time GPS tracking with a development simulator, automated hospital bed triage, Zero-PII green corridor coordination for traffic police, and a **pure TypeScript/Node.js Random Forest ML regression model** for travel-delay estimation.

> [!NOTE]
> **Academic / Prototype Disclosure**: This platform is a software engineering prototype and educational development platform. It is not connected to physical municipal traffic lights or real government 112/108 ambulance hardware.

---

## 🚑 Key Capabilities & Modules

1. **Map-First Patient Booking** (`/`):
   - Full-height interactive Leaflet map with OpenStreetMap tiles.
   - Debounced Nominatim address search + local landmark shortcuts (Kranti Chowk, CIDCO Connaught, Nirala Bazaar, GMCH Ghati, Railway Station, Seven Hills, Waluj MIDC).
   - Turf.js boundary validation ensuring bookings stay within the Aurangabad EMS polygon.
   - 6 clinical triage emergency categories (Cardiac Arrest, Trauma, Stroke, Respiratory Failure, Maternity, General).
   - Real-time mission tracker showing live vehicle position, hospital, and ETA.

2. **Authoritative Server-Side Dispatch Engine**:
   - 45-second private countdown offer to the nearest eligible ambulance driver.
   - Atomic database transactions preventing two drivers from accepting the same trip.
   - Automatic cascade to the next eligible candidate upon expiry or decline.
   - State-machine progression: `REQUESTED` &rarr; `DRIVER_REQUESTED` &rarr; `ACCEPTED` &rarr; `EN_ROUTE_TO_PICKUP` &rarr; `ARRIVED_AT_PICKUP` &rarr; `PATIENT_PICKED_UP` &rarr; `EN_ROUTE_TO_HOSPITAL` &rarr; `ARRIVED_AT_HOSPITAL` &rarr; `COMPLETED`.

3. **Driver Console** (`/driver`):
   - Driver availability toggle (`AVAILABLE` vs `OFFLINE`).
   - 45-second incoming dispatch offer card with countdown and distance.
   - Stepwise mission action controls.
   - Opt-in **Demo GPS Simulator** periodically advancing ambulance coordinates along Aurangabad roads with visible `[SIMULATED]` labeling.

4. **Hospital Emergency Portal** (`/hospital`):
   - Live inbound ambulance triage queue with patient condition.
   - Interactive bed capacity controls (Emergency ER beds, ICU/Ventilator beds, General beds) with immediate Socket.IO synchronization.
   - Facility tenancy isolation (staff can only modify their assigned hospital).
   - Multi-factor hospital recommendation engine scoring facilities based on bed availability, distance, trauma/cath-lab capabilities, and priority.

5. **Traffic Police Command** (`/police`):
   - **Zero-PII guarantee**: Patient names, phone numbers, and medical notes are strictly redacted from traffic police feeds.
   - Active green corridor monitor with signal clearance and acknowledgement actions.
   - Road blockage reporting tool with location coordinates and severity.

6. **Admin Operations & Analytics** (`/admin`):
   - Real database queries calculating KPI cards (total bookings, active trips, completed missions, fleet availability, dispatch success rate, SLA response times).
   - Data-driven Recharts graphs (emergency volume by hour, hospital bed distribution).
   - Fleet registry table with coordinates and stale GPS warnings.
   - Machine Learning subsystem diagnostics.

7. **Pure TypeScript/Node.js Machine Learning Subsystem**:
   - Implemented via `ml-random-forest` with zero Python dependencies.
   - Features: distance, baseline duration, priority code, hour of day, peak hour, weekend, active blockages.
   - **Verified Performance**: MAE = **61.54s**, RMSE = **79.95s**, R² = **0.776** (55.7% error reduction over baseline).

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, TypeScript (strict), Tailwind CSS, Leaflet, React Leaflet, Recharts, TanStack Query, Lucide React, Socket.IO Client.
- **Backend**: Node.js LTS (v24), Fastify 5, TypeScript (strict), Prisma ORM, SQLite, bcryptjs, Socket.IO, Fastify Swagger/OpenAPI.
- **Geospatial**: Turf.js, OpenStreetMap, OSRM routing, Nominatim geocoding.
- **Machine Learning**: `ml-random-forest` (Pure JS/TS Random Forest regression).
- **Testing**: Vitest (17 passing automated unit and integration tests).

---

## 🚀 Quick Launch Instructions (Windows PowerShell)

```powershell
# 1. Clone or navigate to the directory
cd C:\Users\vaibh\OneDrive\Desktop\MP1APOORV

# 2. Install monorepo dependencies
npm install

# 3. Initialize and seed SQLite database
npm run db:push
npm run db:seed

# 4. Start Frontend + Backend together
npm run dev
```

- **Frontend Application**: `http://localhost:5173`
- **Backend API & Health**: `http://localhost:4000/health`
- **Swagger OpenAPI Documentation**: `http://localhost:4000/docs`

---

## 📋 Verified Demo Accounts

Log in directly or click any role button on the **Instant Demo Logins** panel at `http://localhost:5173/login`:

| Role | Email | Password |
|------|-------|----------|
| **Patient** | `patient@aurangabad-ems.local` | `Patient@12345` |
| **Driver (ALS)** | `driver.ramesh@aurangabad-ems.local` | `Driver@12345` |
| **Driver (BLS)** | `driver.sunil@aurangabad-ems.local` | `Driver@12345` |
| **Hospital (Ghati)** | `staff.ghati@aurangabad-ems.local` | `Hospital@12345` |
| **Hospital (MGM)** | `staff.mgm@aurangabad-ems.local` | `Hospital@12345` |
| **Traffic Police** | `police.control@aurangabad-ems.local` | `Police@12345` |
| **System Admin** | `admin@aurangabad-ems.gov.in` | `Admin@12345` |

---

## 🧪 Automated Testing

```powershell
# Run all unit and integration tests (17 tests)
npm run test

# Typecheck all monorepo packages
npm run typecheck

# Build production bundles
npm run build
```

---

## 📖 Detailed Engineering Documentation
- [System Architecture](docs/ARCHITECTURE.md)
- [Database Schema & ERD](docs/DATABASE.md)
- [REST API Specifications](docs/API.md)
- [Dispatch Engine & Concurrency](docs/DISPATCH_WORKFLOW.md)
- [Security & Zero-PII Compliance](docs/SECURITY.md)
- [Machine Learning Subsystem](docs/ML_MODEL.md)
- [Test Coverage Report](docs/TESTING.md)
- [Windows Setup Guide](docs/WINDOWS_SETUP.md)
