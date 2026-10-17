# Windows-First Developer Setup & Launch Guide

This application is built and verified to run directly on Windows 10/11 using PowerShell without Docker or WSL dependencies.

---

## 1. Prerequisites
- **Node.js**: LTS `v20.x` or `v24.x` (verified with `v24.19.0`)
- **npm**: `v10.x` or `v11.x` (verified with `11.17.0`)
- **Git** (optional, recommended)
- **PowerShell** (standard built-in Windows PowerShell)

---

## 2. One-Time Setup Instructions

Open PowerShell in the project directory:
```powershell
cd C:\Users\vaibh\OneDrive\Desktop\MP1APOORV
```

### Step 1: Install Monorepo Dependencies
```powershell
npm install
```

### Step 2: Initialize & Migrate SQLite Database
```powershell
npm run db:push
```

### Step 3: Seed Demo Accounts & Data
```powershell
npm run db:seed
```

### Step 4: (Optional) Retrain Pure TS Random Forest ML Model
```powershell
npm run ml:train
```

---

## 3. Running the Application (Simultaneous Web + API)

Launch both the Fastify API server and Vite frontend together:
```powershell
npm run dev
```

The terminal will boot:
- **Frontend Web UI**: `http://localhost:5173`
- **Backend API Server**: `http://localhost:4000`
- **Swagger OpenAPI Documentation**: `http://localhost:4000/docs`

---

## 4. Demo Login Credentials (Local Development)

All demo accounts can be logged in with a single click using the **Instant Demo Logins** panel on `http://localhost:5173/login`:

| Role | Email | Password | Target Interface |
|------|-------|----------|------------------|
| **Patient** | `patient@aurangabad-ems.local` | `Patient@12345` | `http://localhost:5173/` |
| **Driver (ALS)** | `driver.ramesh@aurangabad-ems.local` | `Driver@12345` | `http://localhost:5173/driver` |
| **Driver (BLS)** | `driver.sunil@aurangabad-ems.local` | `Driver@12345` | `http://localhost:5173/driver` |
| **Hospital (Ghati)** | `staff.ghati@aurangabad-ems.local` | `Hospital@12345` | `http://localhost:5173/hospital` |
| **Hospital (MGM)** | `staff.mgm@aurangabad-ems.local` | `Hospital@12345` | `http://localhost:5173/hospital` |
| **Traffic Police** | `police.control@aurangabad-ems.local` | `Police@12345` | `http://localhost:5173/police` |
| **System Admin** | `admin@aurangabad-ems.gov.in` | `Admin@12345` | `http://localhost:5173/admin` |

---

## 5. Helpful Verification Commands

| Command | Action |
|---------|--------|
| `npm run test` | Run all 17 unit and integration tests |
| `npm run typecheck` | Run strict TypeScript checks across monorepo |
| `npm run build` | Build production bundles for API and Web |
| `npm run db:studio` | Open interactive visual database browser |
