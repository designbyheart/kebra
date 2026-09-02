import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
type Sql = ReturnType<typeof postgres>;

declare global {
  var __kebraSql: Sql | undefined;
  var __kebraDb: Db | undefined;
}

/**
 * The client is created on first use, not at import time, so `next build`
 * (which loads route modules to collect config) works without DATABASE_URL.
 * In dev the instance is cached on globalThis to survive HMR reloads.
 */
function getSql(): Sql {
  if (globalThis.__kebraSql) return globalThis.__kebraSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, {
    max: 10,
    prepare: false, // safe behind pgbouncer / pooled envs
    idle_timeout: 20,
    connect_timeout: 10,
  });
  globalThis.__kebraSql = client;
  return client;
}

export function getDb(): Db {
  if (globalThis.__kebraDb) return globalThis.__kebraDb;
  const instance = drizzle(getSql(), { schema });
  globalThis.__kebraDb = instance;
  return instance;
}

function lazy<T extends object>(resolve: () => T, callable = false): T {
  const target = (callable ? function () {} : {}) as T;
  return new Proxy(target, {
    get(_t, prop) {
      const real = resolve();
      const v = Reflect.get(real, prop, real);
      return typeof v === "function" ? v.bind(real) : v;
    },
    apply(_t, _this, args) {
      return Reflect.apply(resolve() as unknown as (...a: unknown[]) => unknown, resolve(), args);
    },
    has(_t, prop) {
      return Reflect.has(resolve(), prop);
    },
  });
}

/** postgres.js client (tagged template: sql`select 1`). */
export const sql: Sql = lazy(getSql, true);
/** Drizzle instance bound to the schema. */
export const db: Db = lazy(getDb);
export { schema };
