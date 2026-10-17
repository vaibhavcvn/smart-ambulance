# Database Architecture & Entity Relational Design

## 1. Overview
The database layer uses Prisma ORM with an ACID-compliant local SQLite database (`dev.db`). The relational design prioritizes transactional integrity, state-machine traceability, and strict isolation between patient PII and operational telemetry.

## 2. Entity Diagram & Descriptions

```
+----------------+       1:1       +------------------+       1:N       +-------------------+
|      User      | <-------------> |  DriverProfile   | <-------------> |  DispatchRequest  |
+----------------+                 +------------------+                 +-------------------+
        ^                                  |                                      |
        | 1:N                              | 1:1                                  | N:1
        v                                  v                                      v
+----------------+       1:1       +------------------+       1:N       +-------------------+
|    Booking     | <-------------> |    Ambulance     | <-------------- |       Trip        |
+----------------+                 +------------------+                 +-------------------+
                                                                                  |
                                           +--------------------------------------+
                                           | 1:1                          | 1:N
                                           v                              v
                                  +-------------------+          +--------------------+
                                  |  TrafficCorridor  |          | TripStatusHistory  |
                                  +-------------------+          +--------------------+
```

### Key Models
- **`User`**: System identity with bcrypt-hashed passwords and roles (`PATIENT`, `DRIVER`, `HOSPITAL_STAFF`, `TRAFFIC_POLICE`, `ADMIN`).
- **`DriverProfile`**: Operational state (`AVAILABLE`, `ASSIGNED`, `BUSY`, `OFFLINE`), latest GPS coordinate, license number, and 1:1 assigned ambulance.
- **`Ambulance`**: Vehicle registration (`MH-20-AQ-1001`), capability (`ALS` or `BLS`), availability status, and GPS coordinates.
- **`Hospital`**: Facilities in Aurangabad (GMCH Ghati, MGM, Dhoot, CIIGMA, Hedgewar), verified capability flags (`hasTraumaCenter`, `hasCathLab`, `hasStrokeUnit`), emergency/ICU bed counters.
- **`HospitalStaff`**: Enforces strict hospital tenancy isolation so staff members can only edit their assigned hospital.
- **`Booking`**: Emergency request record with pickup coordinates, landmark, emergency category, and priority.
- **`Trip`**: Central operational mission entity tracking state from `REQUESTED` to `COMPLETED`, linking patient, assigned driver, vehicle, and hospital.
- **`DispatchRequest`**: Records individual 45-second dispatch offers sent to candidate drivers with response timestamps and decline reasons.
- **`TripStatusHistory`**: Immutable audit log of all trip state transitions with timestamps and user identifiers.
- **`LocationUpdate`**: Bounded historical GPS telemetry stream with simulation indicators.
- **`TrafficBlockage`**: Active roadwork or obstruction reports with severity and coordinates.
- **`TrafficCorridor`**: Dynamic green corridor coordination record connecting pickup and destination with zero patient PII.

## 3. Migration & Reset Procedures
To sync or inspect the database:
- Push schema changes: `npm run db:migrate` or `npm --workspace=@aurangabad-ambulance/api run db:push`
- Re-run idempotent demo seeds: `npm run db:seed`
- Launch Prisma Studio visual browser: `npm run db:studio`
