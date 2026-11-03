import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { vacantes, ESTADOS, type Estado, type NuevaVacante, type Vacante } from "@/db/schema";
import { registrar } from "./actividad";
import { calcularHuella } from "./huella";
import { ahoraISO, hoyISO } from "./texto";
import { evaluar, type Candidata, type ConfigFiltros, type Evaluacion } from "./filtros/motor";

export interface ResultadoIngreso {
  estado: "nueva" | "descartada" | "duplicada";
  id?: number;
  /** Solo se calcula para vacantes nuevas (las duplicadas no se vuelven a evaluar). */
  evaluacion?: Evaluacion;
}

/**
 * Pasa una candidata por los filtros y la guarda sin duplicar (por huella del enlace).
 * Lo que pasa entra como "Por revisar" en la bandeja Nuevas; lo que no, como "Descartada" con motivo.
 * En ambos casos queda fuera del tablero (en_tablero = 0) hasta que Alex la acepte.
 */
export function ingresarCandidata(db: DB, c: Candidata, plataforma: string, cfg: ConfigFiltros): ResultadoIngreso {
  const huella = calcularHuella(c.enlace ?? "", c.empresa, c.puesto);
  const existente = db.select({ id: vacantes.id }).from(vacantes).where(eq(vacantes.huella, huella)).get();
  if (existente) return { estado: "duplicada", id: existente.id };
  const ev = evaluar(c, cfg);

  const ahora = ahoraISO();
  const fila: NuevaVacante = {
    fechaEncontrada: hoyISO(),
    empresa: c.empresa.trim(),
    puesto: c.puesto.trim(),
    area: ev.area,
    plataforma,
    region: ev.region,
    tipo: ev.tipo,
    horasPorDia: ev.horasPorDia,
    salario: c.salario ?? "",
    enlace: (c.enlace ?? "").trim(),
    prioridad: ev.prioridad,
    estado: ev.pasa ? "Por revisar" : "Descartada",
    motivoDescarte: ev.motivo,
    notas: ev.avisos.join("\n"),
    ubicacion: c.ubicacion ?? "",
    huella,
    enTablero: 0,
    creada: ahora,
    actualizada: ahora,
  };
  const res = db.insert(vacantes).values(fila).returning({ id: vacantes.id }).get();
  // Las descartadas automáticas no llenan el historial: su motivo ya queda en la fila.
  if (ev.pasa) registrar(db, "vacante", res.id, "nueva", plataforma);
  return { estado: ev.pasa ? "nueva" : "descartada", id: res.id, evaluacion: ev };
}

export function obtenerVacante(db: DB, id: number): Vacante | undefined {
  return db.select().from(vacantes).where(eq(vacantes.id, id)).get();
}

export function cambiarEstado(db: DB, id: number, estado: Estado, extra: { motivo?: string; fecha?: string } = {}) {
  if (!ESTADOS.includes(estado)) throw new Error(`Estado inválido: ${estado}`);
  const antes = obtenerVacante(db, id);
  if (!antes) throw new Error("Vacante no encontrada");
  const cambios: Partial<NuevaVacante> = { estado, actualizada: ahoraISO() };
  // Cambiar el estado de una "Nueva" a algo distinto de Descartada la sube al tablero.
  if (estado !== "Descartada" && estado !== "Por revisar") cambios.enTablero = 1;
  if (estado === "Aplicada" && !antes.fechaAplicacion) cambios.fechaAplicacion = extra.fecha ?? hoyISO();
  if (estado === "Descartada") cambios.motivoDescarte = extra.motivo ?? antes.motivoDescarte ?? "";
  db.update(vacantes).set(cambios).where(eq(vacantes.id, id)).run();
  registrar(db, "vacante", id, "estado", `${antes.estado} → ${estado}${extra.motivo ? ` (${extra.motivo})` : ""}`);
}

export function actualizarCampos(db: DB, id: number, campos: Partial<NuevaVacante>) {
  const permitidos: (keyof NuevaVacante)[] = [
    "empresa", "puesto", "area", "plataforma", "region", "tipo", "horasPorDia", "salario", "enlace",
    "prioridad", "fechaAplicacion", "fechaSeguimiento", "siguientePaso", "versionCv", "notas", "motivoDescarte",
  ];
  const limpio: Partial<NuevaVacante> = {};
  for (const k of permitidos) if (k in campos) (limpio as Record<string, unknown>)[k] = campos[k];
  if ("enlace" in limpio || "empresa" in limpio || "puesto" in limpio) {
    const actual = obtenerVacante(db, id);
    if (actual) {
      limpio.huella = calcularHuella(limpio.enlace ?? actual.enlace, limpio.empresa ?? actual.empresa, limpio.puesto ?? actual.puesto);
    }
  }
  limpio.actualizada = ahoraISO();
  db.update(vacantes).set(limpio).where(eq(vacantes.id, id)).run();
  registrar(db, "vacante", id, "editada", Object.keys(limpio).filter((k) => k !== "actualizada").join(", "));
}

export function listarVacantes(db: DB, opciones: { incluirNuevas?: boolean } = {}) {
  const cond = opciones.incluirNuevas ? undefined : eq(vacantes.enTablero, 1);
  return db.select().from(vacantes).where(cond).orderBy(vacantes.prioridad, desc(vacantes.id)).all();
}

export function listarNuevas(db: DB) {
  return db
    .select()
    .from(vacantes)
    .where(and(eq(vacantes.enTablero, 0), eq(vacantes.estado, "Por revisar")))
    .orderBy(vacantes.prioridad, desc(vacantes.id))
    .all();
}

/** Descartadas sin pasar por el tablero (por filtros o en lote desde Nuevas), para revisarlas. */
export function listarDescartadasAuto(db: DB, limite = 200) {
  return db
    .select()
    .from(vacantes)
    .where(and(eq(vacantes.enTablero, 0), eq(vacantes.estado, "Descartada")))
    .orderBy(desc(vacantes.id))
    .limit(limite)
    .all();
}

export function aceptarNuevas(db: DB, ids: number[]) {
  for (const id of ids) {
    db.update(vacantes).set({ enTablero: 1, actualizada: ahoraISO() }).where(eq(vacantes.id, id)).run();
    registrar(db, "vacante", id, "aceptada", "Bandeja Nuevas → Tablero");
  }
}

export function descartarVarias(db: DB, ids: number[], motivo: string) {
  for (const id of ids) cambiarEstado(db, id, "Descartada", { motivo: motivo || "Descartada en lote" });
}

export function colaParaAplicar(db: DB) {
  return db
    .select()
    .from(vacantes)
    .where(eq(vacantes.estado, "Lista para aplicar"))
    .orderBy(vacantes.prioridad, vacantes.id)
    .all();
}

export interface Resumen {
  registradas: number;
  aplicadas: number;
  conRespuesta: number;
  entrevistas: number;
  tasaRespuesta: number; // 0..1
  porEstado: Record<string, number>;
}

const ESTADOS_TRAS_APLICAR: Estado[] = ["Aplicada", "Respuesta recibida", "Entrevista", "Prueba técnica", "Oferta"];
const ESTADOS_CON_RESPUESTA: Estado[] = ["Respuesta recibida", "Entrevista", "Prueba técnica", "Oferta"];

export function calcularResumen(lista: Pick<Vacante, "estado" | "fechaAplicacion">[]): Resumen {
  const porEstado: Record<string, number> = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const v of lista) porEstado[v.estado] = (porEstado[v.estado] ?? 0) + 1;
  // "Aplicadas" cuenta todo lo que ya se envió, incluidas las que luego se descartaron con fecha de aplicación.
  const aplicadas = lista.filter(
    (v) => ESTADOS_TRAS_APLICAR.includes(v.estado) || (v.estado === "Descartada" && !!v.fechaAplicacion),
  ).length;
  const conRespuesta = lista.filter((v) => ESTADOS_CON_RESPUESTA.includes(v.estado)).length;
  const entrevistas = lista.filter((v) => ["Entrevista", "Prueba técnica", "Oferta"].includes(v.estado)).length;
  return {
    registradas: lista.length,
    aplicadas,
    conRespuesta,
    entrevistas,
    tasaRespuesta: aplicadas ? conRespuesta / aplicadas : 0,
    porEstado,
  };
}

/** Devuelve una descartada automática a la bandeja Nuevas (por si el filtro se equivocó). */
export function rescatarDescartada(db: DB, id: number) {
  db.update(vacantes)
    .set({ estado: "Por revisar", motivoDescarte: "", enTablero: 0, actualizada: ahoraISO() })
    .where(eq(vacantes.id, id))
    .run();
  registrar(db, "vacante", id, "rescatada", "Descartada → Nuevas");
}
