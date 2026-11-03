/**
 * Google Sheet como base de datos.
 *
 * En cada petición:
 *  1. hidratar(): lee el Sheet (1 llamada para la estructura y 1 para los datos) y llena una SQLite en memoria.
 *     Así toda la lógica de la app (filtros, cartas, tablero) sigue igual.
 *  2. La app trabaja sobre esa SQLite. Unos triggers anotan qué filas cambian.
 *  3. volcar(): escribe en el Sheet SOLO las celdas que cambiaron, agrega filas nuevas y borra las que salieron.
 *     Nunca reescribe columnas que la app no conoce (tus fórmulas, "Días desde la aplicación", "Nota", etc.).
 */
import { eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { mapearArea, mapearEstado, mapearTipo, esPreguntaSalarial } from "@/lib/importacion";
import { calcularHuella } from "@/lib/huella";
import { ahoraISO, normalizar, normalizarFecha } from "@/lib/texto";
import type { ClienteSheets, PropiedadesPestana } from "./google";
import {
  MAX_ACTIVIDAD, MAX_DESCARTADAS_FILTROS, PESTANA_DESCARTADAS, PESTANA_NUEVAS, PESTANA_SEGUIMIENTO, PESTANA_VISTAS, TABLAS,
  colLetra, ref, type Columna, type DefTabla,
} from "./mapa";

const TABLA_DRIZZLE: Record<string, SQLiteTable> = {
  vacantes: schema.vacantes,
  banco_respuestas: schema.bancoRespuestas,
  filtros: schema.filtros,
  cartas: schema.cartas,
  listas_github: schema.listasGithub,
  ejecuciones_fuentes: schema.ejecucionesFuentes,
  actividad: schema.actividad,
};

type Registro = Record<string, unknown>;

interface FilaSheet {
  pestana: string;
  fila: number; // número de fila en el Sheet (1 = encabezados)
  valores: Registro; // valores tal como quedaron en la app al hidratar o al último volcado
}

interface InfoPestana {
  props: PropiedadesPestana;
  /** índice de columna (0 = A) por campo */
  columnas: Map<string, number>;
  /** última fila usada */
  ultimaFila: number;
}

export interface EstadoSheets {
  cliente: ClienteSheets;
  pestanas: Map<string, InfoPestana>;
  /** tabla → clave → fila en el Sheet */
  filas: Map<string, Map<string, FilaSheet>>;
  vistasCeldas: number;
}

const ESTADO = new WeakMap<DB, EstadoSheets>();

export function estadoDe(db: DB): EstadoSheets | undefined {
  return ESTADO.get(db);
}

// ------------------------------------------------------------------ utilidades

function indiceEncabezado(encabezados: string[], col: Columna): number {
  const buscados = col.encabezados.map(normalizar);
  return encabezados.findIndex((h) => buscados.includes(normalizar(h)));
}

function aCelda(col: Columna, v: unknown): string {
  if (col.escribir) return col.escribir(v);
  if (v === null || v === undefined) return "";
  return String(v);
}

function deCelda(col: Columna, celda: string): unknown {
  const c = (celda ?? "").toString();
  if (col.leer) return col.leer(c);
  if (col.formato === "numero") {
    const n = Number(c.replace(/,/g, ""));
    return c.trim() === "" || Number.isNaN(n) ? null : n;
  }
  if (col.formato === "fecha") return normalizarFecha(c);
  return c;
}

/** Ajusta lo que viene del Sheet a lo que espera la app (sin perder información). */
function normalizarRegistro(def: DefTabla, pestana: string, r: Registro): Registro {
  if (def.tabla === "vacantes") {
    const estadoCrudo = String(r.estado ?? "");
    const out: Registro = {
      ...r,
      empresa: r.empresa ?? "",
      puesto: r.puesto ?? "",
      area: mapearArea(String(r.area ?? "")),
      tipo: mapearTipo(String(r.tipo ?? "")),
      estado: mapearEstado(estadoCrudo),
      prioridad: Number(r.prioridad) >= 1 && Number(r.prioridad) <= 3 ? Number(r.prioridad) : 3,
      enTablero: pestana === PESTANA_SEGUIMIENTO ? 1 : 0,
      idExterno: r.id === null || r.id === undefined ? null : String(r.id),
      creada: r.creada || ahoraISO(),
      actualizada: r.actualizada || ahoraISO(),
    };
    for (const k of ["region", "plataforma", "horasPorDia", "salario", "enlace", "siguientePaso", "versionCv", "notas", "motivoDescarte", "ubicacion", "descartadaPor"]) out[k] = out[k] ?? "";
    if (!out.huella) out.huella = calcularHuella(String(out.enlace), String(out.empresa), String(out.puesto));
    if (out.estado === "Descartada" && !out.descartadaPor) out.descartadaPor = pestana === PESTANA_SEGUIMIENTO ? "alex" : "filtros";
    return out;
  }
  if (def.tabla === "banco_respuestas") {
    const out: Registro = { ...r, categoria: r.categoria ?? "", respuesta: r.respuesta ?? "", actualizado: r.actualizado || ahoraISO() };
    // Privacidad: la respuesta salarial no entra a la app (y como no cambia, tampoco se reescribe en el Sheet).
    if (esPreguntaSalarial(String(r.pregunta ?? ""))) {
      out.respuesta = "";
      out.estado = "Preguntar a Alex";
    }
    return out;
  }
  if (def.tabla === "cartas") return { ...r, texto: r.texto ?? "", creada: r.creada || ahoraISO() };
  if (def.tabla === "listas_github") return { ...r, rama: r.rama ?? "", formato: r.formato || "auto", activa: r.activa ?? 1 };
  return r;
}

const vacio = (r: Registro, def: DefTabla) => def.columnas.every((c) => r[c.campo] === null || r[c.campo] === undefined || r[c.campo] === "");

// ------------------------------------------------------------------ estructura

/** Crea pestañas y columnas que falten (y oculta las técnicas). Devuelve la info de cada pestaña. */
async function asegurarEstructura(cliente: ClienteSheets, encabezadosLeidos: Map<string, string[]>) {
  let props = await cliente.pestanas();
  const porNombre = new Map(props.map((p) => [p.title, p]));
  const requests: unknown[] = [];
  const todas: [string, DefTabla][] = TABLAS.flatMap((d) => d.pestanas.map((p) => [p, d] as [string, DefTabla]));

  for (const [pestana, def] of todas) {
    if (porNombre.has(pestana)) continue;
    const oculta = def.oculta || pestana.startsWith("_");
    requests.push({ addSheet: { properties: { title: pestana, hidden: oculta, gridProperties: { rowCount: 1000, columnCount: Math.max(26, def.columnas.length), frozenRowCount: 1 } } } });
  }
  if (!porNombre.has(PESTANA_VISTAS)) requests.push({ addSheet: { properties: { title: PESTANA_VISTAS, hidden: true, gridProperties: { rowCount: 100, columnCount: 1 } } } });
  if (requests.length) {
    await cliente.estructura(requests);
    props = await cliente.pestanas();
  }
  const info = new Map<string, InfoPestana>();
  const escrituras: { range: string; values: string[][] }[] = [];
  const ocultar: unknown[] = [];
  for (const p of props) info.set(p.title, { props: p, columnas: new Map(), ultimaFila: 1 });

  for (const [pestana, def] of todas) {
    const i = info.get(pestana)!;
    const encabezados = [...(encabezadosLeidos.get(pestana) ?? [])];
    for (const col of def.columnas) {
      let idx = indiceEncabezado(encabezados, col);
      if (idx < 0) {
        idx = encabezados.length;
        encabezados.push(col.encabezados[0]);
        escrituras.push({ range: ref(pestana, `${colLetra(idx)}1`), values: [[col.encabezados[0]]] });
        if (col.oculta && !def.oculta) {
          ocultar.push({
            updateDimensionProperties: {
              range: { sheetId: i.props.sheetId, dimension: "COLUMNS", startIndex: idx, endIndex: idx + 1 },
              properties: { hiddenByUser: true },
              fields: "hiddenByUser",
            },
          });
        }
      }
      i.columnas.set(col.campo, idx);
    }
    const faltanCols = encabezados.length - (i.props.gridProperties?.columnCount ?? 26);
    if (faltanCols > 0) ocultar.unshift({ appendDimension: { sheetId: i.props.sheetId, dimension: "COLUMNS", length: faltanCols } });
  }
  if (ocultar.length) await cliente.estructura(ocultar);
  if (escrituras.length) await cliente.escribir(escrituras, "RAW");
  return info;
}

// ------------------------------------------------------------------ hidratar

/** Lee todo el Sheet y llena la base en memoria `db` (recién creada y migrada). */
export async function hidratar(db: DB, cliente: ClienteSheets): Promise<void> {
  const nombres = [...TABLAS.flatMap((d) => d.pestanas), PESTANA_VISTAS];
  const existentes = new Set((await cliente.pestanas()).map((p) => p.title));
  const aLeer = nombres.filter((n) => existentes.has(n));
  const leidos = await cliente.leer(aLeer.map((n) => ref(n, "A1:ZZ")));
  const datos = new Map<string, string[][]>();
  aLeer.forEach((n, i) => datos.set(n, (leidos[i]?.values ?? []) as string[][]));

  const encabezados = new Map([...datos].map(([n, filas]) => [n, filas[0] ?? []]));
  const pestanas = await asegurarEstructura(cliente, encabezados);
  const estado: EstadoSheets = { cliente, pestanas, filas: new Map(), vistasCeldas: 0 };
  ESTADO.set(db, estado);

  const sinId: { def: DefTabla; pestana: string; fila: number; registro: Registro }[] = [];

  db.transaction((tx) => {
    for (const def of TABLAS) {
      const mapa = new Map<string, FilaSheet>();
      estado.filas.set(def.tabla, mapa);
      const tabla = TABLA_DRIZZLE[def.tabla];
      for (const pestana of def.pestanas) {
        const info = pestanas.get(pestana)!;
        const filas = datos.get(pestana) ?? [];
        info.ultimaFila = Math.max(1, filas.length);
        for (let i = 1; i < filas.length; i++) {
          const celdas = filas[i] ?? [];
          const crudo: Registro = {};
          for (const col of def.columnas) crudo[col.campo] = deCelda(col, celdas[info.columnas.get(col.campo)!] ?? "");
          if (vacio(crudo, def)) continue;
          const registro = normalizarRegistro(def, pestana, crudo);
          const clave = registro[def.clave];
          const claveVacia = clave === null || clave === undefined || clave === "";
          if (claveVacia || mapa.has(String(clave))) {
            // Fila sin ID (agregada a mano) o con ID repetido: se le asigna uno nuevo al final.
            if (def.clave === "id") sinId.push({ def, pestana, fila: i + 1, registro });
            continue;
          }
          const res = tx.insert(tabla).values(registro as never).onConflictDoNothing().run();
          if (res.changes === 0) continue; // duplicado (p. ej. misma pregunta dos veces en el banco)
          mapa.set(String(clave), { pestana, fila: i + 1, valores: leerFila(tx as unknown as DB, def, String(clave)) ?? registro });
        }
      }
    }
  });

  // Filas sin ID: se insertan con ID nuevo; quedan marcadas como cambiadas para escribir su ID.
  for (const s of sinId) {
    const tabla = TABLA_DRIZZLE[s.def.tabla];
    const { [s.def.clave]: _omitida, ...resto } = s.registro;
    const r = db.insert(tabla).values(resto as never).onConflictDoNothing().returning().get() as Registro | undefined;
    if (!r) continue;
    const valores = { ...r, [s.def.clave]: null }; // la celda de ID está vacía en el Sheet
    estado.filas.get(s.def.tabla)!.set(String(r[s.def.clave]), { pestana: s.pestana, fila: s.fila, valores });
  }

  // Huellas vistas: celdas de la columna A con huellas separadas por comas.
  const vistas = (datos.get(PESTANA_VISTAS) ?? []).map((f) => f[0] ?? "");
  estado.vistasCeldas = vistas.length;
  const huellas = vistas.flatMap((c) => c.split(",")).filter(Boolean);
  if (huellas.length) {
    db.transaction((tx) => {
      for (const h of huellas) tx.insert(schema.huellasVistas).values({ huella: h }).onConflictDoNothing().run();
    });
  }
  instalarTriggers(db);
  // Las filas que no tenían ID en el Sheet cuentan como cambiadas, para escribirles su ID nuevo.
  const marcar = db.$client.prepare(`INSERT OR IGNORE INTO _cambios VALUES (?, ?)`);
  for (const [tabla, mapa] of estado.filas) {
    const def = TABLAS.find((d) => d.tabla === tabla)!;
    for (const [clave, f] of mapa) if (f.valores[def.clave] === null) marcar.run(tabla, clave);
  }
}

function leerFila(db: DB, def: DefTabla, clave: string): Registro | undefined {
  const tabla = TABLA_DRIZZLE[def.tabla];
  const columna = (tabla as unknown as Record<string, unknown>)[def.clave] as never;
  const valorClave = def.clave === "id" ? Number(clave) : clave;
  return db.select().from(tabla).where(eq(columna, valorClave as never)).get() as Registro | undefined;
}

function instalarTriggers(db: DB) {
  const sqlTriggers = [
    `CREATE TABLE IF NOT EXISTS _cambios (tabla TEXT NOT NULL, clave TEXT NOT NULL, PRIMARY KEY (tabla, clave))`,
    `CREATE TABLE IF NOT EXISTS _vistas_cambiadas (x INTEGER)`,
  ];
  const sqlCol: Record<string, string> = {
    vacantes: "id", banco_respuestas: "id", filtros: "clave", cartas: "id", listas_github: "id", ejecuciones_fuentes: "fuente", actividad: "id",
  };
  for (const [t, c] of Object.entries(sqlCol)) {
    for (const [ev, ref] of [["INSERT", "NEW"], ["UPDATE", "NEW"], ["DELETE", "OLD"]]) {
      sqlTriggers.push(
        `CREATE TRIGGER IF NOT EXISTS _chg_${t}_${ev} AFTER ${ev} ON ${t} BEGIN INSERT OR IGNORE INTO _cambios VALUES ('${t}', CAST(${ref}.${c} AS TEXT)); END`,
      );
    }
  }
  sqlTriggers.push(`CREATE TRIGGER IF NOT EXISTS _chg_vistas AFTER INSERT ON huellas_vistas BEGIN INSERT INTO _vistas_cambiadas VALUES (1); END`);
  db.$client.exec(sqlTriggers.join(";\n"));
}

// ------------------------------------------------------------------ volcar

/** Pestaña donde debe vivir una vacante según su estado. */
export function pestanaDeVacante(v: Registro): string {
  if (v.enTablero === 1) return PESTANA_SEGUIMIENTO;
  return v.estado === "Por revisar" ? PESTANA_NUEVAS : PESTANA_DESCARTADAS;
}

/** Quita lo más viejo para que el Sheet no crezca sin control (las huellas se conservan en _Vistas). */
function podar(db: DB) {
  db.$client
    .prepare(
      `DELETE FROM vacantes WHERE id IN (
        SELECT id FROM vacantes WHERE en_tablero = 0 AND estado = 'Descartada' AND descartada_por = 'filtros'
        ORDER BY id DESC LIMIT -1 OFFSET ?)`,
    )
    .run(MAX_DESCARTADAS_FILTROS);
  db.$client.prepare(`DELETE FROM actividad WHERE id IN (SELECT id FROM actividad ORDER BY id DESC LIMIT -1 OFFSET ?)`).run(MAX_ACTIVIDAD);
}

/** Escribe en el Sheet lo que cambió desde hidratar() (o desde el último volcado). */
export async function volcar(db: DB): Promise<{ celdas: number; nuevas: number; borradas: number }> {
  const est = ESTADO.get(db);
  if (!est) return { celdas: 0, nuevas: 0, borradas: 0 };
  podar(db);
  const cambios = db.$client.prepare(`SELECT tabla, clave FROM _cambios`).all() as { tabla: string; clave: string }[];
  const vistasCambiadas = (db.$client.prepare(`SELECT COUNT(*) n FROM _vistas_cambiadas`).get() as { n: number }).n > 0;

  const raw: { range: string; values: string[][] }[] = [];
  const usuario: { range: string; values: string[][] }[] = [];
  const borrar = new Map<string, number[]>(); // pestaña → filas
  const nuevasPorPestana = new Map<string, { def: DefTabla; clave: string; registro: Registro }[]>();

  const celda = (pestana: string, fila: number, idx: number, col: Columna, valor: string) => {
    const destino = col.formato === "fecha" || col.formato === "numero" ? usuario : raw;
    destino.push({ range: ref(pestana, `${colLetra(idx)}${fila}`), values: [[valor]] });
  };

  for (const { tabla, clave } of cambios) {
    const def = TABLAS.find((d) => d.tabla === tabla);
    if (!def) continue;
    const actual = leerFila(db, def, clave);
    const previo = est.filas.get(tabla)!.get(clave);
    const destino = actual ? (tabla === "vacantes" ? pestanaDeVacante(actual) : def.pestanas[0]) : null;

    if (actual && previo && previo.pestana === destino) {
      const info = est.pestanas.get(destino)!;
      for (const col of def.columnas) {
        const nuevo = aCelda(col, actual[col.campo]);
        if (nuevo !== aCelda(col, previo.valores[col.campo])) celda(destino, previo.fila, info.columnas.get(col.campo)!, col, nuevo);
      }
      previo.valores = actual;
      continue;
    }
    if (previo) {
      borrar.set(previo.pestana, [...(borrar.get(previo.pestana) ?? []), previo.fila]);
      est.filas.get(tabla)!.delete(clave);
    }
    if (actual && destino) nuevasPorPestana.set(destino, [...(nuevasPorPestana.get(destino) ?? []), { def, clave, registro: actual }]);
  }

  // Filas nuevas al final de cada pestaña (con la fórmula de las columnas que la tengan, p. ej. "Días desde la aplicación").
  const estructura: unknown[] = [];
  let nNuevas = 0;
  for (const [pestana, lista] of nuevasPorPestana) {
    const info = est.pestanas.get(pestana)!;
    const formulas = await formulasDeFila(est, pestana);
    const capacidad = info.props.gridProperties?.rowCount ?? 1000;
    const necesarias = info.ultimaFila + lista.length;
    if (necesarias > capacidad) {
      estructura.push({ appendDimension: { sheetId: info.props.sheetId, dimension: "ROWS", length: necesarias - capacidad + 100 } });
      info.props.gridProperties = { ...info.props.gridProperties, rowCount: necesarias + 100 };
    }
    for (const n of lista) {
      const fila = ++info.ultimaFila;
      for (const col of n.def.columnas) {
        const v = aCelda(col, n.registro[col.campo]);
        if (v !== "") celda(pestana, fila, info.columnas.get(col.campo)!, col, v);
      }
      for (const [idx, f] of formulas) usuario.push({ range: ref(pestana, `${colLetra(idx)}${fila}`), values: [[f.replace(/(\$?[A-Z]{1,3})\$?2(?![0-9])/g, `$1${fila}`)]] });
      est.filas.get(n.def.tabla)!.set(n.clave, { pestana, fila, valores: n.registro });
      nNuevas++;
    }
  }

  // Huellas vistas, empacadas en celdas de ~40 000 caracteres.
  if (vistasCambiadas) {
    const todas = (db.$client.prepare(`SELECT huella FROM huellas_vistas`).all() as { huella: string }[]).map((r) => r.huella);
    const porCelda = 1200; // 32 caracteres + coma
    const celdas: string[][] = [];
    for (let i = 0; i < todas.length; i += porCelda) celdas.push([todas.slice(i, i + porCelda).join(",")]);
    while (celdas.length < est.vistasCeldas) celdas.push([""]);
    if (celdas.length) raw.push({ range: ref(PESTANA_VISTAS, `A1:A${celdas.length}`), values: celdas });
    est.vistasCeldas = celdas.length;
  }

  if (estructura.length) await est.cliente.estructura(estructura);
  await est.cliente.escribir(raw, "RAW");
  await est.cliente.escribir(usuario, "USER_ENTERED");

  // Borrados al final y de abajo hacia arriba, para no mover las filas que se acaban de escribir.
  const borrados: unknown[] = [];
  let nBorradas = 0;
  for (const [pestana, filas] of borrar) {
    const info = est.pestanas.get(pestana)!;
    const ordenadas = [...new Set(filas)].sort((a, b) => b - a);
    for (const f of ordenadas) {
      borrados.push({ deleteDimension: { range: { sheetId: info.props.sheetId, dimension: "ROWS", startIndex: f - 1, endIndex: f } } });
      // Las filas de abajo suben una posición
      for (const mapa of est.filas.values()) for (const fs of mapa.values()) if (fs.pestana === pestana && fs.fila > f) fs.fila--;
      info.ultimaFila--;
      nBorradas++;
    }
  }
  await est.cliente.estructura(borrados);

  db.$client.exec(`DELETE FROM _cambios; DELETE FROM _vistas_cambiadas;`);
  return { celdas: raw.length + usuario.length, nuevas: nNuevas, borradas: nBorradas };
}

/** Columnas de la fila 2 que tienen fórmula y que la app no maneja (se copian a las filas nuevas). */
async function formulasDeFila(est: EstadoSheets, pestana: string): Promise<[number, string][]> {
  const info = est.pestanas.get(pestana)!;
  if (info.ultimaFila < 2) return [];
  const [fila] = await est.cliente.leer([ref(pestana, "A2:ZZ2")], "FORMULA");
  const usadas = new Set(info.columnas.values());
  return ((fila?.values?.[0] ?? []) as string[])
    .map((v, i) => [i, String(v ?? "")] as [number, string])
    .filter(([i, v]) => !usadas.has(i) && v.startsWith("="));
}
