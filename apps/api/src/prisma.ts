import { env } from './config/env.js';
import { PrismaClient as SqliteClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function initializePrismaClient() {
  const isProduction = env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  // Detect PostgreSQL connection URL from POSTGRES_DATABASE_URL or postgres-prefixed DATABASE_URL
  const postgresUrl =
    (env.POSTGRES_DATABASE_URL?.startsWith('postgres://') || env.POSTGRES_DATABASE_URL?.startsWith('postgresql://')
      ? env.POSTGRES_DATABASE_URL
      : undefined) ||
    (env.DATABASE_URL?.startsWith('postgres://') || env.DATABASE_URL?.startsWith('postgresql://')
      ? env.DATABASE_URL
      : undefined);

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
    try {
      const { PrismaClient: PostgresClient } = require('../prisma/generated/client-postgres/index.js');
      return new PostgresClient({
        datasources: {
          db: {
            url: postgresUrl,
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
