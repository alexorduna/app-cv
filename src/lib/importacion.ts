import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import {
  AREAS, ESTADOS, ESTADOS_RESPUESTA, TIPOS, bancoRespuestas, filtros, vacantes,
  type Area, type Estado, type EstadoRespuesta, type NuevaVacante, type Tipo, type Vacante,
} from "@/db/schema";
import { csvAObjetos, generarCsv } from "./csv";
import { calcularHuella } from "./huella";
import { registrar } from "./actividad";
import { ahoraISO, hoyISO, normalizar, normalizarFecha } from "./texto";

/** Columnas exactas del Google Sheet de seguimiento (mismo orden al exportar). */
export const COLUMNAS_SEGUIMIENTO = [
  "ID", "Fecha encontrada", "Empresa", "Puesto", "Área", "Plataforma", "Región", "Tipo", "Horas por día",
  "Salario", "Enlace para aplicar", "Prioridad", "Estado", "Fecha de aplicación", "Fecha de seguimiento",
  "Siguiente paso", "Versión de CV",
] as const;

export const COLUMNAS_BANCO = ["Categoría", "Pregunta", "Respuesta", "Estado"] as const;
export const COLUMNAS_FILTROS = ["Clave", "Valor"] as const;

/** Detecta preguntas de expectativa salarial: su respuesta nunca se guarda. */
export function esPreguntaSalarial(pregunta: string): boolean {
  const p = normalizar(pregunta);
  return /(salar(y|i)|sueldo|compensa|pretension|expectativa econ|pay expectation|desired pay|expected pay|rate expectation|tarifa)/.test(p);
}

function columna(fila: Record<string, string>, nombre: string): string {
  const objetivo = normalizar(nombre);
  for (const [k, v] of Object.entries(fila)) if (normalizar(k) === objetivo) return v ?? "";
  return "";
}

export function mapearArea(v: string): Area | "" {
  const n = normalizar(v);
  if (!n) return "";
  if (/ofens|offens|red team|pentest/.test(n)) return "Ofensiva";
  if (/defens|blue|soc|dfir/.test(n)) return "Defensiva";
  if (/soft|desarroll|dev|backend/.test(n)) return "Software";
  return AREAS.find((a) => normalizar(a) === n) ?? "";
}

export function mapearEstado(v: string): Estado {
  const n = normalizar(v);
  const exacto = ESTADOS.find((e) => normalizar(e) === n);
  if (exacto) return exacto;
  if (/rechaz/.test(n)) return "Rechazada";
  if (/sin respuesta/.test(n)) return "Sin respuesta";
  if (/descart|cerrad/.test(n)) return "Descartada";
  if (/ofert/.test(n)) return "Oferta";
  if (/prueba|tecnica|challenge/.test(n)) return "Prueba técnica";
  if (/entrevist/.test(n)) return "Entrevista";
  if (/respuest/.test(n)) return "Respuesta recibida";
  if (/aplicad|enviad/.test(n)) return "Aplicada";
  if (/lista/.test(n)) return "Lista para aplicar";
  return "Por revisar";
}

export function mapearTipo(v: string): Tipo | "" {
  const n = normalizar(v);
  if (!n) return "";
  const exacto = TIPOS.find((t) => normalizar(t) === n);
  if (exacto) return exacto;
  if (/pract|intern|trainee|becari/.test(n)) return "Prácticas";
  if (/contrat|freelance/.test(n)) return "Contrato";
  if (/completo|full|tiempo/.test(n)) return "Tiempo completo";
  return ""; // "No indicado" y similares quedan sin tipo
}

function mapearPrioridad(v: string): number {
  const n = parseInt(v, 10);
  return n >= 1 && n <= 3 ? n : 3;
}

export interface ResumenImportacion {
  archivo: string;
  insertadas: number;
  actualizadas: number;
  sinCambios: number;
  omitidas: number;
}

const CAMPOS_COMPARABLES: (keyof NuevaVacante)[] = [
  "idExterno", "fechaEncontrada", "empresa", "puesto", "area", "plataforma", "region", "tipo", "horasPorDia",
  "salario", "enlace", "prioridad", "estado", "fechaAplicacion", "fechaSeguimiento", "siguientePaso", "versionCv",
];

/** Importa seguimiento.csv. Idempotente: busca por ID del Sheet y luego por huella del enlace. */
export function importarSeguimiento(db: DB, textoCsv: string, archivo = "seguimiento.csv"): ResumenImportacion {
  const r: ResumenImportacion = { archivo, insertadas: 0, actualizadas: 0, sinCambios: 0, omitidas: 0 };
  const filas = csvAObjetos(textoCsv);
  db.transaction((tx) => {
    for (const f of filas) {
      const empresa = columna(f, "Empresa");
      const puesto = columna(f, "Puesto");
      const enlace = columna(f, "Enlace para aplicar");
      if (!empresa && !puesto && !enlace) {
        r.omitidas++;
        continue;
      }
      const idExterno = columna(f, "ID") || null;
      const datos: NuevaVacante = {
        idExterno,
        fechaEncontrada: normalizarFecha(columna(f, "Fecha encontrada")) ?? hoyISO(),
        empresa,
        puesto,
        area: mapearArea(columna(f, "Área")),
        plataforma: columna(f, "Plataforma"),
        region: columna(f, "Región"),
        tipo: mapearTipo(columna(f, "Tipo")),
        horasPorDia: columna(f, "Horas por día"),
        salario: columna(f, "Salario"),
        enlace,
        prioridad: mapearPrioridad(columna(f, "Prioridad")),
        estado: mapearEstado(columna(f, "Estado")),
        fechaAplicacion: normalizarFecha(columna(f, "Fecha de aplicación")),
        fechaSeguimiento: normalizarFecha(columna(f, "Fecha de seguimiento")),
        siguientePaso: columna(f, "Siguiente paso"),
        versionCv: columna(f, "Versión de CV"),
        huella: calcularHuella(enlace, empresa, puesto),
        enTablero: 1,
        creada: ahoraISO(),
        actualizada: ahoraISO(),
      };
      let existente: Vacante | undefined;
      if (idExterno) existente = tx.select().from(vacantes).where(eq(vacantes.idExterno, idExterno)).get();
      if (!existente) existente = tx.select().from(vacantes).where(eq(vacantes.huella, datos.huella)).get();

      // Lo que viene descartado del Sheet lo descartó Alex: va al historial.
      if (datos.estado === "Descartada") {
        datos.descartadaPor = "alex";
        datos.fechaDescarte = datos.fechaAplicacion ?? datos.fechaEncontrada;
      }
      if (!existente) {
        const res = tx.insert(vacantes).values(datos).returning({ id: vacantes.id }).get();
        registrar(tx as unknown as DB, "vacante", res.id, "importada", archivo);
        r.insertadas++;
        continue;
      }
      const cambios: Partial<NuevaVacante> = {};
      for (const k of CAMPOS_COMPARABLES) {
        const nuevo = datos[k] ?? null;
        const viejo = (existente as Record<string, unknown>)[k] ?? null;
        if (String(nuevo ?? "") !== String(viejo ?? "")) (cambios as Record<string, unknown>)[k] = nuevo;
      }
      if (cambios.estado !== undefined) {
        cambios.descartadaPor = datos.estado === "Descartada" ? "alex" : "";
        cambios.fechaDescarte = datos.estado === "Descartada" ? hoyISO() : null;
      }
      if (datos.huella !== existente.huella) {
        const choque = tx.select({ id: vacantes.id }).from(vacantes).where(eq(vacantes.huella, datos.huella)).get();
        if (!choque) cambios.huella = datos.huella;
      }
      if (Object.keys(cambios).length === 0) {
        r.sinCambios++;
        continue;
      }
      tx.update(vacantes).set({ ...cambios, actualizada: ahoraISO() }).where(eq(vacantes.id, existente.id)).run();
      registrar(tx as unknown as DB, "vacante", existente.id, "actualizada_import", Object.keys(cambios).join(", "));
      r.actualizadas++;
    }
  });
  return r;
}

/** Importa banco_respuestas.csv. La expectativa salarial nunca se guarda: queda en "Preguntar a Alex". */
export function importarBanco(db: DB, textoCsv: string, archivo = "banco_respuestas.csv"): ResumenImportacion {
  const r: ResumenImportacion = { archivo, insertadas: 0, actualizadas: 0, sinCambios: 0, omitidas: 0 };
  db.transaction((tx) => {
    for (const f of csvAObjetos(textoCsv)) {
      const pregunta = columna(f, "Pregunta");
      if (!pregunta) {
        r.omitidas++;
        continue;
      }
      const categoria = columna(f, "Categoría");
      let respuesta = columna(f, "Respuesta");
      const estadoCsv = columna(f, "Estado");
      let estado: EstadoRespuesta =
        ESTADOS_RESPUESTA.find((e) => normalizar(e) === normalizar(estadoCsv)) ?? (respuesta ? "Completa" : "Pendiente");
      if (esPreguntaSalarial(pregunta)) {
        respuesta = "";
        estado = "Preguntar a Alex";
      }
      const existente = tx
        .select()
        .from(bancoRespuestas)
        .where(and(eq(bancoRespuestas.categoria, categoria), eq(bancoRespuestas.pregunta, pregunta)))
        .get();
      if (!existente) {
        tx.insert(bancoRespuestas).values({ categoria, pregunta, respuesta, estado, actualizado: ahoraISO() }).run();
        r.insertadas++;
      } else if (existente.respuesta !== respuesta || existente.estado !== estado) {
        tx.update(bancoRespuestas)
          .set({ respuesta, estado, actualizado: ahoraISO() })
          .where(eq(bancoRespuestas.id, existente.id))
          .run();
        r.actualizadas++;
      } else r.sinCambios++;
    }
  });
  return r;
}

/** Importa filtros.csv (Clave, Valor). Las claves de salario se ignoran por privacidad. */
export function importarFiltros(db: DB, textoCsv: string, archivo = "filtros.csv"): ResumenImportacion {
  const r: ResumenImportacion = { archivo, insertadas: 0, actualizadas: 0, sinCambios: 0, omitidas: 0 };
  for (const f of csvAObjetos(textoCsv)) {
    const clave = columna(f, "Clave").trim();
    const valor = columna(f, "Valor");
    if (!clave || /salari|sueldo/i.test(clave)) {
      r.omitidas++;
      continue;
    }
    const existente = db.select().from(filtros).where(eq(filtros.clave, clave)).get();
    if (!existente) {
      db.insert(filtros).values({ clave, valor }).run();
      r.insertadas++;
    } else if (existente.valor !== valor) {
      db.update(filtros).set({ valor }).where(eq(filtros.clave, clave)).run();
      r.actualizadas++;
    } else r.sinCambios++;
  }
  return r;
}

/** Importa todos los CSV presentes en una carpeta (por defecto data/import). */
export function importarCarpeta(db: DB, carpeta: string): ResumenImportacion[] {
  const resultados: ResumenImportacion[] = [];
  const leer = (n: string) => {
    const p = path.join(carpeta, n);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };
  const f = leer("filtros.csv");
  if (f !== null) resultados.push(importarFiltros(db, f));
  const s = leer("seguimiento.csv");
  if (s !== null) resultados.push(importarSeguimiento(db, s));
  const b = leer("banco_respuestas.csv");
  if (b !== null) resultados.push(importarBanco(db, b));
  return resultados;
}

export function hayCsvParaImportar(carpeta: string): boolean {
  return ["seguimiento.csv", "banco_respuestas.csv", "filtros.csv"].some((n) => fs.existsSync(path.join(carpeta, n)));
}

/** Genera el CSV de seguimiento con las mismas columnas del Sheet. Solo lo que está en el tablero. */
export function exportarSeguimiento(db: DB, opciones: { incluirDescartadasAuto?: boolean } = {}): string {
  const cond = opciones.incluirDescartadasAuto ? undefined : eq(vacantes.enTablero, 1);
  const filas = db
    .select()
    .from(vacantes)
    .where(cond)
    .orderBy(vacantes.id)
    .all()
    .filter((v) => opciones.incluirDescartadasAuto || v.estado !== "Por revisar" || v.enTablero === 1)
    .map((v) => [
      v.idExterno ?? String(v.id),
      v.fechaEncontrada ?? "",
      v.empresa,
      v.puesto,
      v.area,
      v.plataforma,
      v.region,
      v.tipo,
      v.horasPorDia,
      v.salario,
      v.enlace,
      v.prioridad,
      v.estado,
      v.fechaAplicacion ?? "",
      v.fechaSeguimiento ?? "",
      v.siguientePaso,
      v.versionCv,
    ]);
  return generarCsv([...COLUMNAS_SEGUIMIENTO], filas);
}

export function exportarBanco(db: DB): string {
  const filas = db.select().from(bancoRespuestas).orderBy(bancoRespuestas.categoria, bancoRespuestas.id).all();
  return generarCsv([...COLUMNAS_BANCO], filas.map((f) => [f.categoria, f.pregunta, f.respuesta, f.estado]));
}
