# Security & Privacy Architecture

## 1. Authentication & Token Management
- **Password Storage**: Passwords are never stored in plaintext. Passwords are salted and hashed using `bcryptjs` with 10 rounds.
- **JWT Authorization**: Authenticated API endpoints and Socket.IO connections require a valid JSON Web Token in the `Authorization: Bearer <token>` header or `socket.handshake.auth.token`.
- **Role-Based Access Control (RBAC)**: All protected endpoints enforce server-side role validation using the `@fastify/jwt` decorator `fastify.authorize([allowedRoles])`. Client-side route changes cannot grant elevated privileges.

## 2. Zero Patient-PII Privacy for Traffic Police
Under healthcare privacy and operational need-to-know principles, Traffic Police officers coordinating emergency green corridors must never receive patient personally identifiable information (PII):
- In `TripService.getTripById`: When requested by a user with role `TRAFFIC_POLICE`, `patientName`, `patientPhone`, and clinical `notes` are completely deleted before the response is serialized.
- Real-time Socket.IO broadcasts to `role:TRAFFIC_POLICE` contain only vehicle registration, priority (`CRITICAL`, `URGENT`), pickup address, destination hospital, and timestamps.
- Zero patient medical notes or phone numbers appear in traffic command displays or logs.

## 3. Hospital Tenancy Isolation
Hospital staff members are strictly confined to their assigned facility:
- `HospitalStaff` maintains a foreign key to `hospitalId`.
- When updating bed capacity at `PATCH /api/v1/hospitals/:id/capacity`, the backend verifies `user.hospitalId === targetHospitalId` (unless the user possesses the global `ADMIN` role).
- Unauthorized capacity edits are rejected with `403 Forbidden`.

## 4. Log Redaction & Input Sanitation
- The centralized Fastify logger and error serializer automatically redact sensitive fields (`password`, `token`, `authorization`, `creditcard`, `patientPhone`).
- Untrusted request bodies are strictly parsed and validated using Zod schemas (`ZodSchema.safeParse()`) before entering business services.
- Geographic coordinates are validated against Aurangabad regional bounding boxes and service boundary polygons to prevent spoofed out-of-boundary injection.
