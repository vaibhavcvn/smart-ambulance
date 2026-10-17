# Dispatch Engine & Concurrency Lifecycle

## 1. Dispatch Engine Philosophy
Ambulance dispatch in Aurangabad cannot rely on naive browser loops or client-side countdowns. The backend dispatch engine runs as an authoritative server process that evaluates vehicle availability, enforces 45-second candidate offer windows, and executes atomic database transactions to eliminate race conditions.

## 2. Dispatch State Machine Lifecycle

```
[PATIENT BOOKS]
       │
       ▼
  [REQUESTED] ──(Boundary check passed)──► [DISPATCHING]
                                                │
                                                ▼
                                      (Candidate Driver Ranked)
                                                │
                                                ▼
                                     [DRIVER_REQUESTED]
                                       │ 45s Countdown
                    ┌──────────────────┴──────────────────┐
           (Driver Accepts)                       (Decline / 45s Expiry)
                    │                                     │
                    ▼                                     ▼
                [ACCEPTED]                      (Seek Next Candidate)
                    │                                     │
                    ▼                                     ▼
          [EN_ROUTE_TO_PICKUP]                   [EXPIRED / RETRY]
                    │
                    ▼
          [ARRIVED_AT_PICKUP]
                    │
                    ▼
          [PATIENT_PICKED_UP] ──► (Hospital Recommended & Assigned)
                    │
                    ▼
         [EN_ROUTE_TO_HOSPITAL]
                    │
                    ▼
         [ARRIVED_AT_HOSPITAL]
                    │
                    ▼
              [COMPLETED] ──► (Driver & Ambulance restored to AVAILABLE)
```

## 3. Concurrency Protection & Race Condition Mitigation
When multiple eligible drivers are active in the city:
1. **Targeted Private Offer**: The engine emits a private Socket.IO offer exclusively to the candidate driver's private room `driver:${driverProfileId}`.
2. **Atomic Acceptance Transaction**:
   - Inside `prisma.$transaction`, the engine verifies `currentTrip.status !== ACCEPTED` and `currentTrip.driverId === null`.
   - If a concurrent acceptance or cancellation has already completed, the transaction aborts and throws `409 Conflict`.
   - The driver profile is set to `ASSIGNED`, the ambulance is set to `DISPATCHED`, and the trip is updated to `ACCEPTED`.
3. **Authoritative Expiry**:
   - The server maintains a timer `NodeJS.Timeout` for 45 seconds.
   - If the driver disconnects or fails to respond before 45 seconds, the request is marked `EXPIRED`, and the trip is automatically dispatched to the next eligible candidate.
   - If the candidate pool is exhausted, the trip transitions to `EXPIRED` and notifies the patient with an option to retry.
