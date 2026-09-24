import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import type { Pool as PgPoolInstance } from 'pg';
import { createRequire } from 'module';
import ws from "ws";
import * as schema from "@shared/schema";
import { logger } from "./observability";

// pg is a CommonJS module — use createRequire so esbuild doesn't convert it to
// a named ESM import (import { Pool } from 'pg') which Node ESM cannot resolve.
// (Per-query tracing on this path comes from OpenTelemetry's pg
// auto-instrumentation in server/tracing.ts — no manual patching needed here.)
const _require = createRequire(import.meta.url);
const PgPool = (_require('pg') as typeof import('pg')).Pool;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

let db: ReturnType<typeof neonDrizzle> | ReturnType<typeof pgDrizzle>;
let pool: NeonPool | PgPoolInstance;

if (process.env.DB_DRIVER === "pg") {
  // Standard PostgreSQL — Digital Ocean, Railway, etc.
  // ssl.rejectUnauthorized: false accepts DO's self-signed CA certificate.
  // DB_POOL_MAX defaults to the driver's own default (10) so behavior is
  // unchanged until this is deliberately tuned against the DB plan's actual
  // connection ceiling — see the Phase 0 plan for how to size it.
  pool = new PgPool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: parseInt(process.env.DB_POOL_MAX || "10", 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  db = pgDrizzle(pool as PgPoolInstance, { schema });
} else {
  // Neon serverless (default for local dev)
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString });
  db = neonDrizzle({ client: pool as NeonPool, schema });
}

// Without this handler, a dropped idle connection (DB restart, network blip)
// is an unhandled 'error' event — an uncaught exception that crashes the
// entire single-process app for every branch at once. Logging it here lets
// the pool recover the connection on its own instead of taking the process down.
pool.on("error", (err: Error) => {
  logger.error({ err }, "[db] pool error (connection recovered automatically)");
});

export { pool, db };
