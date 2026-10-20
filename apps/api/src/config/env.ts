import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root or apps/api
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  API_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  JWT_SECRET: z.string().min(16).default('aurangabad_ems_super_secret_jwt_key_2026_dev_min_32_chars!'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().default(10),
  DISPATCH_TIMEOUT_SECONDS: z.coerce.number().default(45),
  DISPATCH_SEARCH_RADIUS_KM: z.coerce.number().default(25.0),
  MAX_DISPATCH_CANDIDATES: z.coerce.number().default(5),
  OSRM_ROUTING_URL: z.string().default('https://router.project-osrm.org/route/v1/driving'),
  NOMINATIM_GEOCODING_URL: z.string().default('https://nominatim.openstreetmap.org'),
  GEOCODING_USER_AGENT: z.string().default('AurangabadSmartAmbulance/1.0'),
  ML_MODEL_PATH: z.string().default('../../data/ml/aurangabad_delay_rf.json'),
  ENABLE_ML_PREDICTIONS: z
    .string()
    .transform((val) => val === 'true')
    .default('true'),
  ENABLE_DEMO_GPS_SIMULATOR: z
    .string()
    .transform((val) => val === 'true')
    .default('true'),
  ENABLE_CORS_ALL: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  LOG_LEVEL: z.string().default('info'),
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid Environment Variables Configuration:');
  console.error(parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
