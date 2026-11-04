/**
 * Punto único para obtener la base de datos, sea local o en Google Sheets.
 *
 *  - Local (por defecto): SQLite en data/chamba.db.
 *  - Sheets (si existe GOOGLE_SHEET_ID): el Google Sheet es la base de datos. En cada petición se lee
 *    a una SQLite en memoria y, al terminar una acción, guardar() escribe solo lo que cambió.
 */
import { abrirBaseDatos, getDb, type DB } from "./index";
import { clienteDesdeEntorno, type ClienteSheets } from "./sheets/google";
import { cargarPestanas, hidratar, volcar } from "./sheets/sincronizar";
import { PESTANA_DESCARTADAS, PESTANA_VISTAS } from "./sheets/mapa";
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

/**
 * Cuánto del Sheet se lee (en modo local no importa: SQLite ya tiene todo).
 *  - "lectura": pantallas. Sin las pestañas pesadas que casi ninguna pantalla usa
 *    (_Vistas ~1.6 MB de huellas, _Descartadas, _Actividad); se cargan aparte con cargarExtra().
 *  - "escritura": acciones normales (cambiar estado, aceptar, descartar…). Todo menos _Vistas.
 *  - "ingesta": búsqueda, alertas y enlaces nuevos (necesitan las huellas para no duplicar). Todo.
 */
export type ModoLectura = "lectura" | "escritura" | "ingesta";

const OMITIR: Record<ModoLectura, string[]> = {
  lectura: [PESTANA_VISTAS, PESTANA_DESCARTADAS, "_Actividad"],
  escritura: [PESTANA_VISTAS],
  ingesta: [],
};

/** Abre la base: en modo Sheets lee el Sheet (unas 2 llamadas a Google). */
export async function obtenerDb(modo: ModoLectura = "ingesta"): Promise<DB> {
  if (modoAlmacen() === "local" && !clienteCompartido) return getDb();
  clienteCompartido ??= clienteDesdeEntorno();
  const db = abrirBaseDatos(":memory:");
  await hidratar(db, clienteCompartido, { omitir: OMITIR[modo] });
  // Primera vez: siembra configuración y listas por defecto y las guarda en el Sheet.
  sembrarFiltros(db);
  sembrarListas(db);
  await guardar(db);
  return db;
}

/** En pantallas que lo necesitan, carga las pestañas que "lectura" omitió. En modo local no hace nada. */
export async function cargarExtra(db: DB, ...que: ("descartadas" | "actividad")[]) {
  const nombres = que.map((q) => (q === "descartadas" ? PESTANA_DESCARTADAS : "_Actividad"));
  await cargarPestanas(db, nombres);
}

/** Escribe en el Sheet lo que cambió. En modo local no hace nada (SQLite ya guardó). */
export async function guardar(db: DB) {
  await volcar(db);
}
