import { env } from './config/env.js';
import { PrismaClient as SqliteClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Normalizes PostgreSQL connection URLs for Supabase and connection poolers.
 * When connecting via Supabase Transaction Pooler (port 6543) in serverless,
 * Prisma requires `pgbouncer=true` to disable prepared statements and prevent
 * `prepared statement "s0" already exists` errors.
 * Sets a healthy connection limit (10) and timeout (20s) to allow concurrent Fastify queries
 * and interactive transactions without connection pool exhaustion.
 */
function normalizePostgresPoolerUrl(rawUrl: string, isServerless: boolean): string {
  try {
    const url = new URL(rawUrl);
    const isTransactionPoolerPort = url.port === '6543';

    if (isTransactionPoolerPort || url.searchParams.has('pgbouncer')) {
      if (!url.searchParams.has('pgbouncer')) {
        url.searchParams.set('pgbouncer', 'true');
      }
    }

    // Set healthy connection limits and timeouts for concurrent serverless requests and transactions
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '10');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20');
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

function initializePrismaClient() {
  const isProduction = env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  // Detect PostgreSQL connection URL from POSTGRES_DATABASE_URL, POSTGRES_URL, or postgres-prefixed DATABASE_URL
  const rawPostgres =
    (env.POSTGRES_DATABASE_URL?.startsWith('postgres://') || env.POSTGRES_DATABASE_URL?.startsWith('postgresql://')
      ? env.POSTGRES_DATABASE_URL
      : undefined) ||
    ((env as any).POSTGRES_URL?.startsWith('postgres://') || (env as any).POSTGRES_URL?.startsWith('postgresql://')
      ? (env as any).POSTGRES_URL
      : undefined) ||
    ((env as any).SUPABASE_DATABASE_URL?.startsWith('postgres://') || (env as any).SUPABASE_DATABASE_URL?.startsWith('postgresql://')
      ? (env as any).SUPABASE_DATABASE_URL
      : undefined) ||
    (env.DATABASE_URL?.startsWith('postgres://') || env.DATABASE_URL?.startsWith('postgresql://')
      ? env.DATABASE_URL
      : undefined);

  const postgresUrl = rawPostgres;

  // 1. Production Safety Check: Never allow production or Vercel serverless to silently run on ephemeral SQLite
  if (isProduction && !postgresUrl) {
    throw new Error(
      '❌ FATAL: Production environment detected (VERCEL or NODE_ENV=production), but no valid PostgreSQL connection URL was provided (DATABASE_URL or POSTGRES_DATABASE_URL must start with postgresql:// or postgres://). Ephemeral SQLite databases are strictly prohibited in production to prevent silent data loss.'
    );
  }

  const logLevels: ('warn' | 'error')[] =
    env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'];

  // 2. PostgreSQL Mode (Production or explicitly configured)
  if (postgresUrl) {
    const poolerUrl = normalizePostgresPoolerUrl(postgresUrl, isProduction);
    try {
      const { PrismaClient: PostgresClient } = require('../prisma/generated/client-postgres/index.js');
      return new PostgresClient({
        datasources: {
          db: {
            url: poolerUrl,
          },
        },
        log: logLevels,
      });
    } catch (err: any) {
      throw new Error(
        `❌ FATAL: PostgreSQL database mode selected, but the PostgreSQL Prisma client could not be loaded from '../prisma/generated/client-postgres'. Ensure 'npm run db:postgres:generate' has run. Details: ${err.message}`
      );
    }
  }

  // 3. SQLite Mode (Local development and test environments)
  return new SqliteClient({
    datasources: env.DATABASE_URL
      ? {
          db: {
            url: env.DATABASE_URL,
          },
        }
      : undefined,
    log: logLevels,
  });
}
export type AppPrismaClient = SqliteClient;

export const prisma: AppPrismaClient = initializePrismaClient() as unknown as AppPrismaClient;
