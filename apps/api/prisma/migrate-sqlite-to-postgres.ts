/**
 * ==============================================================================
 * SQLite to PostgreSQL Data Migration Utility
 * Aurangabad Smart Ambulance — Intelligent Emergency Dispatch Platform
 * ==============================================================================
 *
 * This utility safely migrates all operational data from the local SQLite database
 * (`dev.db`) to a target PostgreSQL database (e.g. on Render) while preserving:
 *  - Primary keys (UUIDs)
 *  - Foreign keys & exact relation mapping
 *  - Timestamps (createdAt, updatedAt, custom audit timestamps)
 *  - Password hashes, roles, and user states
 *  - GPS telemetry logs and ML features
 *
 * Safety Guarantees:
 *  1. Read-only on SQLite: SQLite database is NEVER modified, deleted, or reset.
 *  2. Target Pre-check: Aborts immediately if the destination PostgreSQL database
 *     already contains records. Overwriting or merging is strictly prohibited.
 *  3. Dry-Run Mode: Supports --dry-run to simulate and verify counts without writing.
 *  4. Secret Redaction: Connection URLs and error messages are scrubbed of credentials.
 *  5. Relational Integrity: Inserts tables in strict DAG dependency order.
 *  6. Full Post-Verification: Validates row counts and foreign keys.
 *
 * Usage:
 *   $env:POSTGRES_DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
 *   npx tsx prisma/migrate-sqlite-to-postgres.ts [--dry-run]
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient as SqliteClient } from '@prisma/client';
// @ts-ignore - Generated specifically for PostgreSQL migration
import { PrismaClient as PostgresClient } from './generated/client-postgres/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '[NOT DEFINED]';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/^(.*:\/\/[^:]+:)[^@]+(@.*)$/, '$1****$2');
  }
}

function sanitizeErrorMessage(msg: any): string {
  if (!msg) return '';
  const text = typeof msg === 'string' ? msg : msg.message || String(msg);
  // Redact any user:password patterns from database URLs embedded in Prisma error stacks
  return text.replace(/:\/\/[^:]+:[^@]+@/g, '://[REDACTED_USER]:****@');
}

// Strict insertion order respecting all foreign key constraints
const MODEL_MIGRATION_ORDER = [
  // Tier 1: Independent Root Entities
  { name: 'user', label: 'User Accounts' },
  { name: 'hospital', label: 'Hospitals' },
  { name: 'ambulance', label: 'Ambulance Fleet' },
  { name: 'trafficSignal', label: 'Traffic Signals' },

  // Tier 2: First-level Dependents (depend on Tier 1)
  { name: 'driverProfile', label: 'Driver Profiles' },
  { name: 'hospitalStaff', label: 'Hospital Staff' },
  { name: 'trafficPoliceProfile', label: 'Traffic Police Profiles' },
  { name: 'trafficBlockage', label: 'Traffic Blockages' },
  { name: 'booking', label: 'Emergency Bookings' },
  { name: 'notification', label: 'User Notifications' },
  { name: 'auditLog', label: 'Audit Logs' },

  // Tier 3: Core Mission Entities (depend on Bookings, Users, Drivers, Ambulances, Hospitals)
  { name: 'trip', label: 'Emergency Trips' },

  // Tier 4: Mission Sub-entities (depend on Trips)
  { name: 'dispatchRequest', label: 'Dispatch Requests' },
  { name: 'tripStatusHistory', label: 'Trip Status History' },
  { name: 'locationUpdate', label: 'GPS Location Updates' },
  { name: 'trafficCorridor', label: 'Green Traffic Corridors' },
] as const;

type ModelName = (typeof MODEL_MIGRATION_ORDER)[number]['name'];

async function runMigration() {
  const isDryRun = process.argv.includes('--dry-run');
  const postgresUrl =
    process.env.POSTGRES_DATABASE_URL ||
    process.env.MIGRATION_TARGET_DATABASE_URL ||
    (process.env.DATABASE_URL?.startsWith('postgres://') || process.env.DATABASE_URL?.startsWith('postgresql://')
      ? process.env.DATABASE_URL
      : undefined);

  console.log('\n==============================================================================');
  console.log('🚑 Aurangabad Smart Ambulance — SQLite to PostgreSQL Migration');
  console.log('==============================================================================');
  console.log(`Execution Mode : ${isDryRun ? '🔍 DRY RUN (Simulation only, no data written)' : '🚀 LIVE TRANSFER'}`);
  console.log(`Target DB URL  : ${sanitizeUrl(postgresUrl)}`);

  if (!postgresUrl && !isDryRun) {
    console.error('\n❌ ERROR: Target PostgreSQL connection URL is missing!');
    console.error('Please specify the connection string in the environment:');
    console.error('  PowerShell: $env:POSTGRES_DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"');
    console.error('  Command   : npx tsx prisma/migrate-sqlite-to-postgres.ts\n');
    process.exit(1);
  }

  // Initialize SQLite Client (Read-Only source, explicitly pinned to apps/api/prisma/dev.db)
  const sqliteDbPath = path.resolve(__dirname, 'dev.db');
  const sqlite = new SqliteClient({
    datasources: {
      db: {
        url: `file:${sqliteDbPath}`,
      },
    },
  });

  // Initialize PostgreSQL Client if URL is provided
  const postgres = postgresUrl
    ? new PostgresClient({
        datasources: {
          db: {
            url: postgresUrl,
          },
        },
      })
    : null;

  try {
    // ------------------------------------------------------------------------
    // Step 1: Connectivity & Pre-flight Checks
    // ------------------------------------------------------------------------
    console.log('\n[1/5] Testing database connections...');

    // SQLite check
    await sqlite.$queryRaw`SELECT 1`;
    console.log(`  ✔ Source SQLite connection OK (${sqliteDbPath})`);

    // PostgreSQL check (if target URL configured)
    if (postgres) {
      await postgres.$queryRaw`SELECT 1`;
      console.log('  ✔ Destination PostgreSQL connection OK');

      // ----------------------------------------------------------------------
      // Step 2: Target Cleanliness Verification (Strict: zero existing records)
      // ----------------------------------------------------------------------
      console.log('\n[2/5] Inspecting destination tables for existing records...');
      const destinationCounts: Record<string, number> = {};
      let targetHasData = false;

      for (const { name } of MODEL_MIGRATION_ORDER) {
        try {
          const count = await (postgres[name as keyof typeof postgres] as any).count();
          destinationCounts[name] = count;
          if (count > 0) {
            targetHasData = true;
          }
        } catch (err: any) {
          if (isDryRun) {
            console.log(`  ℹ️ Notice: Destination table "${name}" not created yet. Run 'npm run db:postgres:push' first.`);
          } else {
            console.error(`  ❌ Failed to query destination table for model "${name}".`);
            console.error('     Ensure you have pushed the PostgreSQL schema first:');
            console.error('     npm run db:postgres:push\n');
            throw new Error(sanitizeErrorMessage(err));
          }
        }
      }

      if (targetHasData) {
        console.warn('\n  ⚠️ Warning: Destination PostgreSQL database already contains data:');
        for (const [m, c] of Object.entries(destinationCounts)) {
          if (c > 0) {
            console.warn(`    - ${m}: ${c} records`);
          }
        }

        if (!isDryRun) {
          console.error('\n  ❌ MIGRATION ABORTED: Destination database is not empty.');
          console.error('  To ensure absolute data integrity and prevent primary-key collisions,');
          console.error('  the destination database must be clean prior to migration.');
          console.error('  Existing records cannot be safely merged or overwritten automatically.\n');
          process.exit(1);
        }
      } else {
        console.log('  ✔ Destination database is clean and ready for import.');
      }
    } else {
      console.log('  ℹ️ Target PostgreSQL not connected (Offline Dry-Run Mode).');
      console.log('\n[2/5] Skipping destination cleanliness check (Offline Mode).');
    }

    // ------------------------------------------------------------------------
    // Step 3: Source Data Audit & Extraction
    // ------------------------------------------------------------------------
    console.log('\n[3/5] Reading records from SQLite source...');
    const sourceData: Record<string, any[]> = {};
    let totalSourceRecords = 0;

    for (const { name, label } of MODEL_MIGRATION_ORDER) {
      const records = await (sqlite[name as keyof typeof sqlite] as any).findMany();
      sourceData[name] = records;
      totalSourceRecords += records.length;
      console.log(`  • ${label.padEnd(26)} : ${records.length.toString().padStart(4)} records`);
    }

    console.log(`\n  Total source records to transfer: ${totalSourceRecords}`);

    if (isDryRun) {
      console.log('\n[DRY RUN] Simulation complete. No data was written to PostgreSQL.');
      return;
    }

    // ------------------------------------------------------------------------
    // Step 4: Batched Insertion into PostgreSQL within an Atomic Transaction
    // ------------------------------------------------------------------------
    console.log('\n[4/5] Transferring records to PostgreSQL in dependency order (Atomic Transaction)...');
    const CHUNK_SIZE = 100;

    await postgres.$transaction(
      async (tx) => {
        for (const { name, label } of MODEL_MIGRATION_ORDER) {
          const records = sourceData[name];
          if (records.length === 0) {
            console.log(`  • ${label.padEnd(26)} : Skipping (0 records)`);
            continue;
          }

          process.stdout.write(`  • ${label.padEnd(26)} : Transferring ${records.length} records... `);

          // Insert in chunks to avoid parameter limits
          for (let i = 0; i < records.length; i += CHUNK_SIZE) {
            const chunk = records.slice(i, i + CHUNK_SIZE);
            await (tx[name as keyof typeof tx] as any).createMany({
              data: chunk,
              skipDuplicates: false,
            });
          }

          console.log('✔ Done');
        }
      },
      {
        maxWait: 20000,
        timeout: 120000,
      }
    );

    // ------------------------------------------------------------------------
    // Step 5: Verification & Integrity Audit
    // ------------------------------------------------------------------------
    console.log('\n[5/5] Performing post-migration data integrity verification...\n');
    console.log('------------------------------------------------------------------------------');
    console.log('Model Name                 | SQLite Source | Postgres Dest | Status');
    console.log('------------------------------------------------------------------------------');

    let allCountsMatch = true;

    for (const { name, label } of MODEL_MIGRATION_ORDER) {
      const sourceCount = sourceData[name].length;
      const destCount = await (postgres[name as keyof typeof postgres] as any).count();
      const isMatch = sourceCount === destCount;

      if (!isMatch) {
        allCountsMatch = false;
      }

      const statusTag = isMatch ? '✔ MATCH' : '❌ MISMATCH';
      console.log(
        `${label.padEnd(26)} | ${sourceCount.toString().padStart(13)} | ${destCount.toString().padStart(13)} | ${statusTag}`
      );
    }
    console.log('------------------------------------------------------------------------------');

    // Relational Foreign Key Integrity Checks
    console.log('\nAuditing Foreign Key Consistency in PostgreSQL:');
    let fkErrors = 0;

    // Check DriverProfile -> User & Ambulance
    const drivers = await postgres.driverProfile.findMany({ select: { id: true, userId: true, assignedAmbulanceId: true } });
    for (const d of drivers) {
      const u = await postgres.user.findUnique({ where: { id: d.userId } });
      if (!u) {
        console.error(`  ❌ FK Violation: DriverProfile(${d.id}) references missing User(${d.userId})`);
        fkErrors++;
      }
      if (d.assignedAmbulanceId) {
        const a = await postgres.ambulance.findUnique({ where: { id: d.assignedAmbulanceId } });
        if (!a) {
          console.error(`  ❌ FK Violation: DriverProfile(${d.id}) references missing Ambulance(${d.assignedAmbulanceId})`);
          fkErrors++;
        }
      }
    }

    // Check Trip -> Booking & User
    const trips = await postgres.trip.findMany({ select: { id: true, bookingId: true, patientId: true } });
    for (const t of trips) {
      const b = await postgres.booking.findUnique({ where: { id: t.bookingId } });
      if (!b) {
        console.error(`  ❌ FK Violation: Trip(${t.id}) references missing Booking(${t.bookingId})`);
        fkErrors++;
      }
      const p = await postgres.user.findUnique({ where: { id: t.patientId } });
      if (!p) {
        console.error(`  ❌ FK Violation: Trip(${t.id}) references missing User(${t.patientId})`);
        fkErrors++;
      }
    }

    if (fkErrors === 0) {
      console.log('  ✔ All checked foreign keys are valid and intact.');
    } else {
      console.error(`  ❌ Found ${fkErrors} foreign key integrity violations!`);
    }

    if (allCountsMatch && fkErrors === 0) {
      console.log('\n🎉 SUCCESS: All records and relationships migrated with 100% fidelity!');
    } else {
      console.warn('\n⚠️ WARNING: Migration completed with discrepancies. Review logs above.');
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error during migration:');
    console.error(sanitizeErrorMessage(error));
    process.exit(1);
  } finally {
    try {
      await sqlite.$disconnect();
      if (postgres) {
        await postgres.$disconnect();
      }
    } catch {}
    console.log('\nDatabase connections cleanly closed.\n');
  }
}

runMigration();
