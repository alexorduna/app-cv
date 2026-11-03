import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { filtros } from "@/db/schema";
import { FILTROS_SEMILLA } from "./semilla";
import { construirConfig, type ConfigFiltros } from "./motor";

export function leerFiltros(db: DB): Record<string, string> {
  const filas = db.select().from(filtros).all();
  const r: Record<string, string> = { ...FILTROS_SEMILLA };
  for (const f of filas) r[f.clave] = f.valor;
  return r;
}

export function leerConfigFiltros(db: DB): ConfigFiltros {
  return construirConfig(leerFiltros(db));
}

export function guardarFiltro(db: DB, clave: string, valor: string) {
  db.insert(filtros).values({ clave, valor }).onConflictDoUpdate({ target: filtros.clave, set: { valor } }).run();
}

export function leerFiltro(db: DB, clave: string): string {
  const fila = db.select().from(filtros).where(eq(filtros.clave, clave)).get();
  return fila?.valor ?? FILTROS_SEMILLA[clave] ?? "";
}

/** Inserta las claves semilla que falten, sin pisar lo que el usuario ya editó. */
export function sembrarFiltros(db: DB) {
  for (const [clave, valor] of Object.entries(FILTROS_SEMILLA)) {
    db.insert(filtros).values({ clave, valor }).onConflictDoNothing().run();
  }
}
