import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const globalForDb = globalThis as unknown as { __chambaDb?: DB };

export function rutaBaseDatos(): string {
  const p = process.env.DATABASE_PATH || "data/chamba.db";
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

/** Abre (o crea) una base de datos y aplica las migraciones commiteadas en /drizzle. */
export function abrirBaseDatos(ruta: string): DB {
  if (ruta !== ":memory:") fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const sqlite = new Database(ruta);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema }) as DB;
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

/** Conexión compartida de la app (perezosa, para que `next build` no toque la BD). */
export function getDb(): DB {
  if (!globalForDb.__chambaDb) globalForDb.__chambaDb = abrirBaseDatos(rutaBaseDatos());
  return globalForDb.__chambaDb;
}

/** Solo para pruebas: reemplaza la conexión compartida. */
export function setDbParaPruebas(db: DB | undefined) {
  globalForDb.__chambaDb = db;
}

export { schema };
