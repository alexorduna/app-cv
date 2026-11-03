/**
 * Punto único para obtener la base de datos, sea local o en Google Sheets.
 *
 *  - Local (por defecto): SQLite en data/chamba.db.
 *  - Sheets (si existe GOOGLE_SHEET_ID): el Google Sheet es la base de datos. En cada petición se lee
 *    a una SQLite en memoria y, al terminar una acción, guardar() escribe solo lo que cambió.
 */
import { abrirBaseDatos, getDb, type DB } from "./index";
import { clienteDesdeEntorno, type ClienteSheets } from "./sheets/google";
import { hidratar, volcar } from "./sheets/sincronizar";
import { sembrarFiltros } from "@/lib/filtros/repo";
import { sembrarListas } from "@/lib/fuentes/github";

export type Modo = "local" | "sheets";

export function modoAlmacen(env: Record<string, string | undefined> = process.env): Modo {
  return env.GOOGLE_SHEET_ID ? "sheets" : "local";
}

let clienteCompartido: ClienteSheets | null = null;

/** Solo para pruebas: usa un cliente de Sheets propio (p. ej. contra un servidor falso). */
export function usarClienteSheets(c: ClienteSheets | null) {
  clienteCompartido = c;
}

/** Abre la base: en modo Sheets lee el Sheet completo (unas 2 llamadas a Google). */
export async function obtenerDb(): Promise<DB> {
  if (modoAlmacen() === "local" && !clienteCompartido) return getDb();
  clienteCompartido ??= clienteDesdeEntorno();
  const db = abrirBaseDatos(":memory:");
  await hidratar(db, clienteCompartido);
  // Primera vez: siembra configuración y listas por defecto y las guarda en el Sheet.
  sembrarFiltros(db);
  sembrarListas(db);
  await guardar(db);
  return db;
}

/** Escribe en el Sheet lo que cambió. En modo local no hace nada (SQLite ya guardó). */
export async function guardar(db: DB) {
  await volcar(db);
}
